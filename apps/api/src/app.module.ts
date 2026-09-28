import { Module } from '@nestjs/common';
import { LeaderboardModule } from './leaderboard/leaderboard.module';
import { PrismaModule } from './prisma/prisma.module';
import { SubmissionsModule } from './submissions/submissions.module';

@Module({
  imports: [PrismaModule, LeaderboardModule, SubmissionsModule],
})
export class AppModule {}
