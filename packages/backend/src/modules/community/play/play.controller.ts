import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUserId } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PlayService } from './play.service';
import { PlayRewardsService } from './play-rewards.service';
import { gameKey, object } from './play.rules';

@Controller('v1/games/play')
export class PlayController {
  constructor(private readonly play: PlayService, private readonly rewards: PlayRewardsService) {}
  @Get('catalog') catalog() { return this.play.catalog(); }
  @Get('leaderboards/office-coins') @UseGuards(JwtAuthGuard)
  officeCoins(@CurrentUserId() userId: string) { return this.rewards.officeCoins(userId); }
  @Get('leaderboards/:gameKey') leaderboard(@Param('gameKey') key: string, @Query('date') date?: string) { return this.rewards.leaderboard(gameKey(key), date); }
  @Get('rooms') @UseGuards(JwtAuthGuard)
  list(@CurrentUserId() userId: string, @Query('gameKey') key?: string) { return this.play.list(userId, key === undefined ? undefined : gameKey(key)); }
  @Post('rooms') @UseGuards(JwtAuthGuard)
  create(@CurrentUserId() userId: string, @Body() body: unknown) { return this.play.create(userId, body); }
  @Post('rooms/join') @UseGuards(JwtAuthGuard)
  join(@CurrentUserId() userId: string, @Body() body: unknown) { return this.play.join(userId, body); }
  @Get('rooms/:roomId') @UseGuards(JwtAuthGuard)
  get(@CurrentUserId() userId: string, @Param('roomId') roomId: string) { return this.play.get(userId, roomId); }
  @Post('rooms/:roomId/ready') @UseGuards(JwtAuthGuard)
  ready(@CurrentUserId() userId: string, @Param('roomId') roomId: string, @Body() body: unknown) { return this.play.ready(userId, roomId, body); }
  @Post('rooms/:roomId/start') @UseGuards(JwtAuthGuard)
  start(@CurrentUserId() userId: string, @Param('roomId') roomId: string, @Body() body: unknown) { object(body, []); return this.play.start(userId, roomId); }
  @Post('rooms/:roomId/actions') @UseGuards(JwtAuthGuard)
  action(@CurrentUserId() userId: string, @Param('roomId') roomId: string, @Body() body: unknown) { return this.play.action(userId, roomId, body); }
  @Post('rooms/:roomId/leave') @UseGuards(JwtAuthGuard)
  leave(@CurrentUserId() userId: string, @Param('roomId') roomId: string, @Body() body: unknown) { object(body, []); return this.play.leave(userId, roomId); }
}
