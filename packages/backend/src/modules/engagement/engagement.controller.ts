import { Controller, Get, UseGuards } from '@nestjs/common';

import { CurrentUserId } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  EngagementService,
  RecentActivityResponse,
} from './engagement.service';

@UseGuards(JwtAuthGuard)
@Controller('v1/activity')
export class EngagementController {
  constructor(private readonly engagementService: EngagementService) {}

  /** GET /api/v1/activity/recent */
  @Get('recent')
  getRecent(
    @CurrentUserId() userId: string,
  ): Promise<RecentActivityResponse> {
    return this.engagementService.getRecentActivities(userId);
  }
}
