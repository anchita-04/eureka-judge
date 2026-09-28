import { Controller, Get, Param, Query } from '@nestjs/common';
import { LeaderboardService } from './leaderboard.service';

@Controller('contests/:contestId/leaderboard')
export class LeaderboardController {
  constructor(private readonly leaderboard: LeaderboardService) {}

  @Get()
  getLeaderboard(
    @Param('contestId') contestId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.leaderboard.getLeaderboard(contestId, cursor, limit);
  }
}
