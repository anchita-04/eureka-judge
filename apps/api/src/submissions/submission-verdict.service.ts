import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LeaderboardGateway } from '../leaderboard/leaderboard.gateway';
import { PrismaService } from '../prisma/prisma.service';

const ALLOWED_VERDICTS = new Set(['AC', 'WA', 'CE', 'RE', 'TLE', 'MLE', 'SE']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type VerdictPayload = {
  verdict: string;
  runtimeMs: number | null;
  memoryKb: number | null;
};

@Injectable()
export class SubmissionVerdictService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leaderboardGateway: LeaderboardGateway,
  ) {}

  async recordVerdict(submissionId: string, rawBody: unknown) {
    if (!UUID_PATTERN.test(submissionId)) throw new BadRequestException('submissionId must be a UUID');
    const payload = this.parsePayload(rawBody);
    const judgedAt = new Date();
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      select: { contestId: true },
    });
    if (!submission) throw new NotFoundException('Submission not found');

    const updated = await this.prisma.submission.updateMany({
      where: { id: submissionId },
      data: {
        status: 'done',
        verdict: payload.verdict,
        runtimeMs: payload.runtimeMs,
        memoryKb: payload.memoryKb,
        judgedAt,
      },
    });
    if (updated.count === 0) throw new NotFoundException('Submission not found');
    if (submission.contestId) await this.leaderboardGateway.announceVerdict(submission.contestId);

    return {
      submissionId,
      status: 'done',
      verdict: payload.verdict,
      runtimeMs: payload.runtimeMs,
      memoryKb: payload.memoryKb,
      judgedAt: judgedAt.toISOString(),
    };
  }

  private parsePayload(rawBody: unknown): VerdictPayload {
    if (typeof rawBody !== 'object' || rawBody === null || Array.isArray(rawBody)) {
      throw new BadRequestException('Request body must be a JSON object');
    }

    const body = rawBody as Record<string, unknown>;
    const verdict = typeof body.verdict === 'string' ? body.verdict.toUpperCase() : '';
    if (!ALLOWED_VERDICTS.has(verdict)) {
      throw new BadRequestException('verdict must be AC, WA, CE, RE, TLE, MLE, or SE');
    }

    return {
      verdict,
      runtimeMs: this.optionalNonNegativeInteger(body.runtimeMs, 'runtimeMs'),
      memoryKb: this.optionalNonNegativeInteger(body.memoryKb, 'memoryKb'),
    };
  }

  private optionalNonNegativeInteger(value: unknown, field: string): number | null {
    if (value === undefined || value === null) return null;
    if (!Number.isInteger(value) || (value as number) < 0) {
      throw new BadRequestException(`${field} must be a non-negative integer`);
    }
    return value as number;
  }
}
