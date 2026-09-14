import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUserId } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { WordFrontRoomService } from './word-front-room.service';

@Controller('v1/games/word-front/rooms')
@UseGuards(JwtAuthGuard)
export class WordFrontRoomController {
  constructor(private readonly rooms: WordFrontRoomService) {}
  @Get() list(@CurrentUserId() id: string) { return this.rooms.list(id); }
  @Post() create(@CurrentUserId() id: string, @Body() body: unknown) { return this.rooms.create(id, body); }
  @Post('join') join(@CurrentUserId() id: string, @Body() body: unknown) { return this.rooms.join(id, body); }
  @Get(':roomId') get(@CurrentUserId() id: string, @Param('roomId') roomId: string) { return this.rooms.get(id, roomId); }
  @Post(':roomId/start') start(@CurrentUserId() id: string, @Param('roomId') roomId: string, @Body() body: unknown) { return this.rooms.start(id, roomId, body); }
  @Post(':roomId/action') act(@CurrentUserId() id: string, @Param('roomId') roomId: string, @Body() body: unknown) { return this.rooms.act(id, roomId, body); }
  @Post(':roomId/leave') leave(@CurrentUserId() id: string, @Param('roomId') roomId: string, @Body() body: unknown) { return this.rooms.leave(id, roomId, body); }
}
