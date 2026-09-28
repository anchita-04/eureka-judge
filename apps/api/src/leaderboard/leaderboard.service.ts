import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type VerdictSubmission = {
  id: string;
  userId: string;
  problemId: string;
  verdict: string | null;
  submittedAt: Date;
  judgedAt: Date | null;
};

type ScoringProblem = { problemId: string; label: string; ordinal: number };
type Participant = { id: string; username: string; name: string | null; avatarUrl: string | null };

type ProblemResult = {
  problemId: string;
  label: string;
  solved: boolean;
  wrongAttempts: number;
  solveTimeMinutes: number | null;
};

type Standing = {
  rank: number;
  userId: string;
  username: string;
  name: string | null;
  avatarUrl: string | null;
  problemsSolved: number;
  penaltyMinutes: number;
  problems: ProblemResult[];
};

const NON_PENALIZING_VERDICTS = new Set(['SE', 'SYSTEM_ERROR']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class LeaderboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getLeaderboard(contestId: string, encodedCursor?: string, rawLimit?: string) {
    if (!UUID_PATTERN.test(contestId)) throw new BadRequestException('contestId must be a UUID');
    const limit = this.parseLimit(rawLimit);
    const contest = await this.prisma.contest.findUnique({
      where: { id: contestId },
      include: {
        problems: { orderBy: { ordinal: 'asc' } },
        participants: { include: { user: true } },
      },
    });

    if (!contest) throw new NotFoundException('Contest not found');
    if (contest.visibility !== 'public') {
      throw new ForbiddenException('Private contest leaderboard access requires the identity module');
    }

    const now = new Date();
    const frozen = Boolean(
      contest.freezeTime && now >= contest.freezeTime && now < contest.endTime,
    );
    let entries: Standing[];

    if (frozen) {
      const snapshot = await this.getOrCreateFreezeSnapshot(
        contest.id,
        contest.freezeTime!,
        contest.startTime,
        contest.penaltyMinutesPerWrong,
        contest.problems,
        contest.participants.map(({ user }) => user),
      );
      entries = snapshot as unknown as Standing[];
    } else {
      const submissions = await this.getCompletedSubmissions(contest.id, contest.startTime, contest.endTime);
      entries = this.computeStandings(
        contest.startTime,
        contest.penaltyMinutesPerWrong,
        contest.problems,
        contest.participants.map(({ user }) => user),
        submissions,
      );
    }

    const after = this.decodeCursor(encodedCursor);
    const startIndex = after ? entries.findIndex((row) => this.isAfterCursor(row, after)) : 0;
    if (after && startIndex < 0) throw new BadRequestException('Invalid or expired cursor');
    const page = entries.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < entries.length;
    const last = page[page.length - 1];

    return {
      contestId,
      asOf: now.toISOString(),
      state: frozen ? 'frozen' : now < contest.startTime ? 'upcoming' : now >= contest.endTime ? 'finished' : 'live',
      frozen,
      entries: page,
      nextCursor: hasMore && last ? this.encodeCursor(last) : null,
    };
  }

  private async getCompletedSubmissions(contestId: string, startTime: Date, endTime: Date) {
    return this.prisma.submission.findMany({
      where: {
        contestId,
        status: 'done',
        verdict: { not: null },
        submittedAt: { gte: startTime, lte: endTime },
      },
      select: { id: true, userId: true, problemId: true, verdict: true, submittedAt: true, judgedAt: true },
      orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
    });
  }

  private async getOrCreateFreezeSnapshot(
    contestId: string,
    freezeTime: Date,
    startTime: Date,
    penaltyMinutesPerWrong: number,
    problems: ScoringProblem[],
    participants: Participant[],
  ): Promise<Prisma.JsonValue> {
    const saved = await this.prisma.leaderboardFreezeSnapshot.findUnique({ where: { contestId } });
    if (saved) return saved.entries;

    // A pre-freeze submission judged after the freeze must not reveal its result.
    const submissions = await this.prisma.submission.findMany({
      where: {
        contestId,
        status: 'done',
        verdict: { not: null },
        submittedAt: { gte: startTime, lte: freezeTime },
        judgedAt: { not: null, lte: freezeTime },
      },
      select: { id: true, userId: true, problemId: true, verdict: true, submittedAt: true, judgedAt: true },
      orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
    });
    const snapshot = this.computeStandings(
      startTime,
      penaltyMinutesPerWrong,
      problems,
      participants,
      submissions,
    );

    const created = await this.prisma.leaderboardFreezeSnapshot.upsert({
      where: { contestId },
      create: { contestId, capturedAt: new Date(), entries: snapshot as unknown as Prisma.InputJsonValue },
      update: {},
    });
    return created.entries;
  }

  private computeStandings(
    startTime: Date,
    penaltyMinutesPerWrong: number,
    contestProblems: ScoringProblem[],
    participants: Participant[],
    submissions: VerdictSubmission[],
  ): Standing[] {
    const problemOrder = [...contestProblems].sort((a, b) => a.ordinal - b.ordinal || a.label.localeCompare(b.label));
    const submissionsByParticipantProblem = new Map<string, VerdictSubmission[]>();

    for (const submission of submissions) {
      const key = `${submission.userId}:${submission.problemId}`;
      const group = submissionsByParticipantProblem.get(key) ?? [];
      group.push(submission);
      submissionsByParticipantProblem.set(key, group);
    }

    const standings = participants.map((participant) => {
      let problemsSolved = 0;
      let penaltyMinutes = 0;
      const problems: ProblemResult[] = problemOrder.map(({ problemId, label }) => {
        const attempts = submissionsByParticipantProblem.get(`${participant.id}:${problemId}`) ?? [];
        let wrongAttempts = 0;
        let accepted: VerdictSubmission | undefined;

        for (const attempt of attempts) {
          const verdict = attempt.verdict?.toUpperCase();
          if (verdict === 'AC') {
            accepted = attempt;
            break;
          }
          if (verdict && !NON_PENALIZING_VERDICTS.has(verdict)) wrongAttempts += 1;
        }

        if (!accepted) return { problemId, label, solved: false, wrongAttempts, solveTimeMinutes: null };

        const elapsed = Math.max(0, Math.floor((accepted.submittedAt.getTime() - startTime.getTime()) / 60_000));
        problemsSolved += 1;
        penaltyMinutes += elapsed + wrongAttempts * penaltyMinutesPerWrong;
        return { problemId, label, solved: true, wrongAttempts, solveTimeMinutes: elapsed };
      });

      return {
        rank: 0,
        userId: participant.id,
        username: participant.username,
        name: participant.name,
        avatarUrl: participant.avatarUrl,
        problemsSolved,
        penaltyMinutes,
        problems,
      };
    });

    standings.sort((a, b) =>
      b.problemsSolved - a.problemsSolved ||
      a.penaltyMinutes - b.penaltyMinutes ||
      a.username.localeCompare(b.username) ||
      a.userId.localeCompare(b.userId),
    );

    let rank = 0;
    standings.forEach((row, index) => {
      if (
        index === 0 ||
        row.problemsSolved !== standings[index - 1].problemsSolved ||
        row.penaltyMinutes !== standings[index - 1].penaltyMinutes
      ) rank = index + 1;
      row.rank = rank;
    });

    return standings;
  }

  private parseLimit(rawLimit?: string): number {
    if (!rawLimit) return 50;
    const limit = Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException('limit must be an integer between 1 and 100');
    }
    return limit;
  }

  private encodeCursor(row: Standing): string {
    return Buffer.from(JSON.stringify({
      solved: row.problemsSolved,
      penalty: row.penaltyMinutes,
      username: row.username,
      userId: row.userId,
    })).toString('base64url');
  }

  private decodeCursor(cursor?: string): { solved: number; penalty: number; username: string; userId: string } | null {
    if (!cursor) return null;
    try {
      const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
      if (
        !Number.isInteger(decoded.solved) || !Number.isInteger(decoded.penalty) ||
        typeof decoded.username !== 'string' || typeof decoded.userId !== 'string'
      ) throw new Error('Invalid cursor shape');
      return decoded;
    } catch {
      throw new BadRequestException('Invalid cursor');
    }
  }

  private isAfterCursor(
    row: Standing,
    cursor: { solved: number; penalty: number; username: string; userId: string },
  ): boolean {
    if (row.problemsSolved !== cursor.solved) return row.problemsSolved < cursor.solved;
    if (row.penaltyMinutes !== cursor.penalty) return row.penaltyMinutes > cursor.penalty;
    const usernameOrder = row.username.localeCompare(cursor.username);
    if (usernameOrder !== 0) return usernameOrder > 0;
    return row.userId.localeCompare(cursor.userId) > 0;
  }
}
