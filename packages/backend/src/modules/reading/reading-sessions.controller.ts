import {
  Body,
  Controller,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CurrentUserId } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  ReadingHeartbeatDto,
  StartReadingSessionDto,
} from './dto/reading-session.dto';
import {
  ReadingSessionResponse,
  ReadingSessionsService,
} from './reading-sessions.service';

@UseGuards(JwtAuthGuard)
@Controller('v1/reading/sessions')
export class ReadingSessionsController {
  constructor(private readonly sessions: ReadingSessionsService) {}

  /** POST /api/v1/reading/sessions */
  @Post()
  start(
    @CurrentUserId() userId: string,
    @Body() body: StartReadingSessionDto,
  ): Promise<ReadingSessionResponse> {
    return this.sessions.start(userId, body);
  }

  /** POST /api/v1/reading/sessions/:sessionId/heartbeat */
  @Post(':sessionId/heartbeat')
  heartbeat(
    @CurrentUserId() userId: string,
    @Param('sessionId') sessionId: string,
    @Body() body: ReadingHeartbeatDto,
  ): Promise<ReadingSessionResponse> {
    return this.sessions.heartbeat(userId, sessionId, body);
  }

  /** POST /api/v1/reading/sessions/:sessionId/end */
  @Post(':sessionId/end')
  end(
    @CurrentUserId() userId: string,
    @Param('sessionId') sessionId: string,
    @Body() body: ReadingHeartbeatDto,
  ): Promise<ReadingSessionResponse> {
    return this.sessions.end(userId, sessionId, body);
  }
}
