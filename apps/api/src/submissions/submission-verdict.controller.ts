import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { JudgeServiceKeyGuard } from './judge-service-key.guard';
import { SubmissionVerdictService } from './submission-verdict.service';

@Controller('internal/submissions')
@UseGuards(JudgeServiceKeyGuard)
export class SubmissionVerdictController {
  constructor(private readonly verdicts: SubmissionVerdictService) {}

  @Post(':submissionId/verdict')
  recordVerdict(@Param('submissionId') submissionId: string, @Body() body: unknown) {
    return this.verdicts.recordVerdict(submissionId, body);
  }
}
