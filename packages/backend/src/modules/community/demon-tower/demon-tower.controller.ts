import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUserId, OptionalCurrentUserId } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../auth/optional-jwt-auth.guard';
import { DemonTowerRewardsService } from './demon-tower-rewards.service';
import { DemonTowerService } from './demon-tower.service';

@Controller('v1/games/demon-tower')
export class DemonTowerController {
  constructor(private readonly tower: DemonTowerService, private readonly rewards: DemonTowerRewardsService) {}
  @Get('catalog') catalog() { return this.tower.catalog(); }
  @Get('overview') @UseGuards(JwtAuthGuard)
  overview(@CurrentUserId() userId: string) { return this.tower.overview(userId); }
  @Post('actions') @UseGuards(JwtAuthGuard)
  action(@CurrentUserId() userId: string, @Body() body: unknown) { return this.tower.action(userId, body); }
  @Get('leaderboard') @UseGuards(OptionalJwtAuthGuard)
  leaderboard(@Query('date') date: string | undefined, @OptionalCurrentUserId() userId: string | null) { return this.rewards.leaderboard(date, userId); }
  @Get('contributions') @UseGuards(OptionalJwtAuthGuard)
  contributions(@Query('floor') floor: string | undefined, @OptionalCurrentUserId() userId: string | null) { return this.rewards.contributions(floor, userId); }
}
