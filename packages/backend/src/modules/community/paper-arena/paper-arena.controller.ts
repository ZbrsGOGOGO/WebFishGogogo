import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { CurrentUserId } from '../../auth/current-user.decorator';
import { JwtAuthGuard, type AuthenticatedRequest } from '../../auth/jwt-auth.guard';
import { PaperArenaService } from './paper-arena.service';

@Controller('v1/games/paper-arena')
@UseGuards(JwtAuthGuard)
export class PaperArenaController {
  constructor(private readonly arena: PaperArenaService) {}
  @Get('rooms') list(@CurrentUserId() id: string) { return this.arena.list(id); }
  @Post('rooms') create(@CurrentUserId() id: string, @Body() body: unknown) { return this.arena.create(id, body); }
  @Post('rooms/join') join(@CurrentUserId() id: string, @Body() body: unknown) { return this.arena.join(id, body); }
  @Get('rooms/:roomId') get(@CurrentUserId() id: string, @Param('roomId') roomId: string) { return this.arena.get(id, roomId); }
  @Post('rooms/:roomId/start') start(@CurrentUserId() id: string, @Param('roomId') roomId: string, @Body() body: unknown) { return this.arena.start(id, roomId, body); }
  @Post('rooms/:roomId/team') team(@CurrentUserId() id: string, @Param('roomId') roomId: string, @Body() body: unknown) { return this.arena.team(id, roomId, body); }
  @Post('rooms/:roomId/leave') leave(@CurrentUserId() id: string, @Param('roomId') roomId: string, @Body() body: unknown) { return this.arena.leave(id, roomId, body); }
  @Post('rooms/:roomId/ticket') ticket(@Req() request: AuthenticatedRequest, @Param('roomId') roomId: string, @Body() body: unknown) { return this.arena.ticket(request.user!.id, request.user!.sessionId, roomId, body); }
}
