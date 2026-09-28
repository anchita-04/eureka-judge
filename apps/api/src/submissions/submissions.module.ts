import { Module } from '@nestjs/common';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';
import { JudgeServiceKeyGuard } from './judge-service-key.guard';
import { SubmissionVerdictController } from './submission-verdict.controller';
import { SubmissionVerdictService } from './submission-verdict.service';

@Module({
  imports: [LeaderboardModule],
  controllers: [SubmissionVerdictController],
  providers: [JudgeServiceKeyGuard, SubmissionVerdictService],
})
export class SubmissionsModule {}
