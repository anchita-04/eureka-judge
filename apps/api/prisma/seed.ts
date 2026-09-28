import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const contestId = 'e0000000-0000-4000-8000-000000000001';
const startTime = new Date(Date.now() - 2 * 60 * 60 * 1000);
const endTime = new Date(Date.now() + 3 * 60 * 60 * 1000);

const users = [
  { id: 'e0000000-0000-4000-8000-000000000011', username: 'charlie', name: 'Charlie' },
  { id: 'e0000000-0000-4000-8000-000000000012', username: 'amara', name: 'Amara' },
  { id: 'e0000000-0000-4000-8000-000000000013', username: 'ben', name: 'Ben' },
  { id: 'e0000000-0000-4000-8000-000000000014', username: 'devika', name: 'Devika' },
  { id: 'e0000000-0000-4000-8000-000000000015', username: 'elio', name: 'Elio' },
];

const problems = [
  { id: 'e0000000-0000-4000-8000-000000000021', label: 'A', title: 'Warmup' },
  { id: 'e0000000-0000-4000-8000-000000000022', label: 'B', title: 'Sequences' },
  { id: 'e0000000-0000-4000-8000-000000000023', label: 'C', title: 'Hidden Paths' },
];

const attemptRows = [
  // Charlie: 2 solves, 40 + 55 = 95 minutes.
  ['31', 0, 0, 40, 'AC'],
  ['32', 0, 1, 55, 'AC'],
  // Amara: 2 solves, (20 + 20 wrong penalty) + 70 = 110 minutes.
  ['33', 1, 0, 5, 'WA'],
  ['34', 1, 0, 20, 'AC'],
  ['35', 1, 1, 70, 'AC'],
  ['36', 1, 2, 35, 'WA'],
  // Ben: 2 solves, 30 + (40 + 20 wrong penalty) = 90 minutes.
  ['37', 2, 1, 10, 'WA'],
  ['38', 2, 0, 30, 'AC'],
  ['39', 2, 1, 40, 'AC'],
  // Devika: 1 solve in 10 minutes. Elio has no solved problems.
  ['40', 3, 0, 10, 'AC'],
] as const;

async function main(): Promise<void> {
  for (const user of users) {
    await prisma.user.upsert({ where: { id: user.id }, create: user, update: user });
  }

  await prisma.contest.upsert({
    where: { id: contestId },
    create: {
      id: contestId,
      name: 'Eureka Leaderboard Demo',
      startTime,
      endTime,
      freezeTime: null,
      status: 'live',
      visibility: 'public',
      penaltyMinutesPerWrong: 20,
    },
    update: {
      name: 'Eureka Leaderboard Demo',
      startTime,
      endTime,
      freezeTime: null,
      status: 'live',
      visibility: 'public',
      penaltyMinutesPerWrong: 20,
    },
  });

  for (const [ordinal, problem] of problems.entries()) {
    await prisma.problem.upsert({
      where: { id: problem.id },
      create: { id: problem.id, title: problem.title },
      update: { title: problem.title },
    });
    await prisma.contestProblem.upsert({
      where: { contestId_problemId: { contestId, problemId: problem.id } },
      create: { contestId, problemId: problem.id, label: problem.label, ordinal },
      update: { label: problem.label, ordinal },
    });
  }

  for (const user of users) {
    await prisma.contestParticipant.upsert({
      where: { contestId_userId: { contestId, userId: user.id } },
      create: { contestId, userId: user.id },
      update: {},
    });
  }

  for (const [suffix, userIndex, problemIndex, elapsedMinutes, verdict] of attemptRows) {
    const submittedAt = new Date(startTime.getTime() + elapsedMinutes * 60_000);
    await prisma.submission.upsert({
      where: { id: `e0000000-0000-4000-8000-0000000000${suffix}` },
      create: {
        id: `e0000000-0000-4000-8000-0000000000${suffix}`,
        contestId,
        userId: users[userIndex].id,
        problemId: problems[problemIndex].id,
        status: 'done',
        verdict,
        submittedAt,
        judgedAt: new Date(),
      },
      update: {
        contestId,
        userId: users[userIndex].id,
        problemId: problems[problemIndex].id,
        status: 'done',
        verdict,
        submittedAt,
        judgedAt: new Date(),
      },
    });
  }

  console.log(`Seeded leaderboard demo contest: ${contestId}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
