import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentSessionId, CurrentUserId } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { chatException } from './chat.errors';
import { ChatService } from './chat.service';

@Controller('v1/chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('rooms')
  rooms(@CurrentUserId() userId: string) {
    return this.chat.listRooms(userId);
  }

  @Get('rooms/:slug/messages')
  messages(
    @CurrentUserId() userId: string,
    @Param('slug') roomSlug: string,
    @Query('afterSequence') afterSequence?: string,
    @Query('beforeSequence') beforeSequence?: string,
    @Query('limit') limit?: string,
  ) {
    return this.chat.history(userId, roomSlug, {
      ...(afterSequence === undefined
        ? {}
        : { afterSequence: this.integerQuery(afterSequence, 'afterSequence') }),
      ...(beforeSequence === undefined
        ? {}
        : { beforeSequence: this.integerQuery(beforeSequence, 'beforeSequence') }),
      ...(limit === undefined ? {} : { limit: this.integerQuery(limit, 'limit') }),
    });
  }

  @Post('socket-tickets')
  socketTicket(
    @CurrentUserId() userId: string,
    @CurrentSessionId() sessionId: string,
  ) {
    return this.chat.issueSocketTicket(userId, sessionId);
  }

  @Post('messages/:id/report')
  report(
    @CurrentUserId() userId: string,
    @Param('id') messageId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: { reason?: unknown; detail?: unknown },
  ) {
    return this.chat.report(userId, messageId, idempotencyKey ?? '', body ?? {});
  }

  private integerQuery(value: string, name: string): number {
    if (!/^\d+$/.test(value)) {
      throw chatException('CHAT_INVALID_QUERY', `${name} 必须是非负整数。`);
    }
    const number = Number(value);
    if (!Number.isSafeInteger(number)) {
      throw chatException('CHAT_INVALID_QUERY', `${name} 超出有效范围。`);
    }
    return number;
  }
}
