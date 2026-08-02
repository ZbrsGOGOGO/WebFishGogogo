import { Controller, Post, UseGuards } from '@nestjs/common';

import { CurrentUserId } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CheckinTodayResult, PlatformService } from './platform.service';

@UseGuards(JwtAuthGuard)
@Controller('v1/checkins')
export class CheckinsController {
  constructor(private readonly platformService: PlatformService) {}

  /** POST /api/v1/checkins/today */
  @Post('today')
  checkinToday(
    @CurrentUserId() userId: string,
  ): Promise<CheckinTodayResult> {
    return this.platformService.checkinToday(userId);
  }
}
