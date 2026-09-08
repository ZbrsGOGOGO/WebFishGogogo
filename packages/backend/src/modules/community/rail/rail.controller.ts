import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUserId } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RailChatService } from './rail-chat.service';
import { RailRewardsService } from './rail-rewards.service';
import { RailService } from './rail.service';
import { railObject } from './rail.rules';

@Controller('v1/games/rail')
export class RailController {
  constructor(private readonly rail: RailService, private readonly rewards: RailRewardsService, private readonly chat: RailChatService) {}
  @Get('catalog') catalog() { return this.rail.catalog(); }
  @Get('leaderboard') leaderboard(@Query('date') date?: string) { return this.rewards.leaderboard(date); }
  @Get('me') @UseGuards(JwtAuthGuard)
  me(@CurrentUserId() userId: string) { return this.rewards.me(userId); }
  @Get('rooms') @UseGuards(JwtAuthGuard)
  list(@CurrentUserId() userId: string) { return this.rail.list(userId); }
  @Post('rooms') @UseGuards(JwtAuthGuard)
  create(@CurrentUserId() userId: string, @Body() body: unknown) { return this.rail.create(userId, body); }
  @Post('rooms/join') @UseGuards(JwtAuthGuard)
  join(@CurrentUserId() userId: string, @Body() body: unknown) { return this.rail.join(userId, body); }
  @Get('rooms/:roomId') @UseGuards(JwtAuthGuard)
  get(@CurrentUserId() userId: string, @Param('roomId') roomId: string) { return this.rail.get(userId, roomId); }
  @Post('rooms/:roomId/ready') @UseGuards(JwtAuthGuard)
  ready(@CurrentUserId() userId: string, @Param('roomId') roomId: string, @Body() body: unknown) { return this.rail.ready(userId, roomId, body); }
  @Post('rooms/:roomId/start') @UseGuards(JwtAuthGuard)
  start(@CurrentUserId() userId: string, @Param('roomId') roomId: string, @Body() body: unknown) { railObject(body, []); return this.rail.start(userId, roomId); }
  @Post('rooms/:roomId/actions') @UseGuards(JwtAuthGuard)
  action(@CurrentUserId() userId: string, @Param('roomId') roomId: string, @Body() body: unknown) { return this.rail.action(userId, roomId, body); }
  @Post('rooms/:roomId/leave') @UseGuards(JwtAuthGuard)
  leave(@CurrentUserId() userId: string, @Param('roomId') roomId: string, @Body() body: unknown) { railObject(body, []); return this.rail.leave(userId, roomId); }
  @Post('rooms/:roomId/bots') @UseGuards(JwtAuthGuard)
  bots(@CurrentUserId() userId: string, @Param('roomId') roomId: string, @Body() body: unknown) { return this.rail.setBots(userId, roomId, body); }
  @Post('rooms/:roomId/password') @UseGuards(JwtAuthGuard)
  password(@CurrentUserId() userId: string, @Param('roomId') roomId: string, @Body() body: unknown) { return this.rail.setPassword(userId, roomId, body); }
  @Get('rooms/:roomId/chat') @UseGuards(JwtAuthGuard)
  chatList(@CurrentUserId() userId: string, @Param('roomId') roomId: string, @Query('afterSequence') afterSequence?: string, @Query('beforeSequence') beforeSequence?: string, @Query('channel') channel?: string) { return this.chat.list(userId, roomId, { afterSequence, beforeSequence, channel }); }
  @Post('rooms/:roomId/chat') @UseGuards(JwtAuthGuard)
  chatSend(@CurrentUserId() userId: string, @Param('roomId') roomId: string, @Body() body: unknown) { return this.chat.send(userId, roomId, body); }
  @Post('rooms/:roomId/chat/:messageId/withdraw') @UseGuards(JwtAuthGuard)
  chatWithdraw(@CurrentUserId() userId: string, @Param('roomId') roomId: string, @Param('messageId') messageId: string, @Body() body: unknown) { railObject(body, []); return this.chat.withdraw(userId, roomId, messageId); }
}
