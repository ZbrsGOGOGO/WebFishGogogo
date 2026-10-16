import { Body, Controller, Get, GoneException, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUserId } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../auth/optional-jwt-auth.guard';

/** Compatibility tombstone for the retired fused implementation. */
@Controller('v1/games/demon-tower')
export class DemonTowerController {
  private gone(): never {
    throw new GoneException({ code: 'DEMON_TOWER_CLIENT_OUTDATED', replacement: '/games/demon-tower' });
  }

  @Get('catalog') catalog(): never { return this.gone(); }
  @Get('overview') @UseGuards(JwtAuthGuard)
  overview(@CurrentUserId() _userId: string): never { return this.gone(); }
  @Get('social') @UseGuards(JwtAuthGuard)
  social(@CurrentUserId() _userId: string): never { return this.gone(); }
  @Post('actions') @UseGuards(JwtAuthGuard)
  action(@CurrentUserId() _userId: string, @Body() _body: unknown): never { return this.gone(); }
  @Get('leaderboard') @UseGuards(OptionalJwtAuthGuard)
  leaderboard(@Query('date') _date?: string): never { return this.gone(); }
  @Get('contributions') @UseGuards(OptionalJwtAuthGuard)
  contributions(@Query('floor') _floor?: string): never { return this.gone(); }
  @Get('auto-explore') @UseGuards(JwtAuthGuard)
  autoRead(@CurrentUserId() _userId: string): never { return this.gone(); }
  @Post('auto-explore') @UseGuards(JwtAuthGuard)
  autoStart(@CurrentUserId() _userId: string, @Body() _body: unknown): never { return this.gone(); }
  @Post('auto-explore/:id/stop') @UseGuards(JwtAuthGuard)
  autoStop(@CurrentUserId() _userId: string, @Param('id') _id: string, @Body() _body: unknown): never { return this.gone(); }
}
