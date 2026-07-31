import { Controller, Get, UseGuards } from '@nestjs/common';

import { CurrentUserId } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PlatformOverview, PlatformService } from './platform.service';

@UseGuards(JwtAuthGuard)
@Controller('v1/platform')
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  /** GET /api/v1/platform/overview */
  @Get('overview')
  getOverview(@CurrentUserId() userId: string): Promise<PlatformOverview> {
    return this.platformService.getOverview(userId);
  }
}
