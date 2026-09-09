import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentSessionId, CurrentUserId, OptionalCurrentUserId } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../auth/optional-jwt-auth.guard';
import { DemonTowerRewardsService } from './demon-tower-rewards.service';
import { DemonTowerService } from './demon-tower.service';
import { DemonTowerAutoService } from './demon-tower-auto.service';

@Controller('v1/games/demon-tower')
export class DemonTowerController {
  constructor(private readonly tower: DemonTowerService, private readonly rewards: DemonTowerRewardsService, private readonly auto: DemonTowerAutoService) {}
  @Get('catalog') catalog() { return this.tower.catalog(); }
  @Get('overview') @UseGuards(JwtAuthGuard)
  overview(@CurrentUserId() userId: string) { return this.tower.overview(userId); }
  @Post('actions') @UseGuards(JwtAuthGuard)
  action(@CurrentUserId() userId: string, @Body() body: unknown) { return this.tower.action(userId, body); }
  @Get('leaderboard') @UseGuards(OptionalJwtAuthGuard)
  leaderboard(@Query('date') date: string | undefined, @OptionalCurrentUserId() userId: string | null) { return this.rewards.leaderboard(date, userId); }
  @Get('contributions') @UseGuards(OptionalJwtAuthGuard)
  contributions(@Query('floor') floor: string | undefined, @OptionalCurrentUserId() userId: string | null) { return this.rewards.contributions(floor, userId); }
  @Get('auto-explore') @UseGuards(JwtAuthGuard)
  autoRead(@CurrentUserId() userId: string) { return this.auto.read(userId); }
  @Post('auto-explore') @UseGuards(JwtAuthGuard)
  autoStart(@CurrentUserId() userId: string, @CurrentSessionId() sessionId: string, @Body() body: unknown) { return this.auto.start(userId, sessionId, body); }
  @Post('auto-explore/:id/stop') @UseGuards(JwtAuthGuard)
  autoStop(@CurrentUserId() userId: string, @Param('id') id: string, @Body() body: unknown) { return this.auto.stop(userId, id, body); }
}
