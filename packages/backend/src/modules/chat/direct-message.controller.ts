import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUserId } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { chatException } from './chat.errors';
import { DirectMessageService } from './direct-message.service';

@Controller('v1/chat')
@UseGuards(JwtAuthGuard)
export class DirectMessageController {
  constructor(private readonly directMessages: DirectMessageService) {}

  @Get('direct-conversations')
  conversations(
    @CurrentUserId() userId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.directMessages.listConversations(userId, cursor);
  }

  @Post('direct-conversations')
  openConversation(
    @CurrentUserId() userId: string,
    @Body() body: unknown,
  ) {
    const input = objectBody(body);
    return this.directMessages.openConversation(
      userId,
      requiredString(input, 'friendPublicId', 100),
    );
  }

  @Get('direct-conversations/:id/messages')
  messages(
    @CurrentUserId() userId: string,
    @Param('id') conversationId: string,
    @Query('afterSequence') afterSequence?: string,
    @Query('beforeSequence') beforeSequence?: string,
    @Query('limit') limit?: string,
  ) {
    return this.directMessages.history(userId, conversationId, {
      ...(afterSequence === undefined
        ? {}
        : { afterSequence: integerQuery(afterSequence, 'afterSequence') }),
      ...(beforeSequence === undefined
        ? {}
        : { beforeSequence: integerQuery(beforeSequence, 'beforeSequence') }),
      ...(limit === undefined ? {} : { limit: integerQuery(limit, 'limit') }),
    });
  }

  @Post('direct-conversations/:id/read')
  @HttpCode(HttpStatus.OK)
  markRead(
    @CurrentUserId() userId: string,
    @Param('id') conversationId: string,
    @Body() body: unknown,
  ) {
    const input = objectBody(body);
    return this.directMessages.markRead(
      userId,
      conversationId,
      integerBody(input, 'throughSequence'),
    );
  }

  @Post('direct-messages/:id/report')
  report(
    @CurrentUserId() userId: string,
    @Param('id') messageId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
  ) {
    const input = objectBody(body);
    return this.directMessages.report(
      userId,
      messageId,
      idempotencyKey ?? '',
      { reason: input.reason, detail: input.detail },
    );
  }
}

function objectBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw chatException('CHAT_FRAME_INVALID', '请求内容格式无效。');
  }
  return value as Record<string, unknown>;
}

function requiredString(
  value: Record<string, unknown>,
  field: string,
  maxLength: number,
): string {
  const candidate = value[field];
  if (
    typeof candidate !== 'string' ||
    candidate.length < 1 ||
    candidate.length > maxLength
  ) {
    throw chatException('CHAT_FRAME_INVALID', `${field} 无效。`);
  }
  return candidate;
}

function integerBody(value: Record<string, unknown>, field: string): number {
  const candidate = value[field];
  if (!Number.isSafeInteger(candidate) || Number(candidate) < 0) {
    throw chatException('CHAT_INVALID_CURSOR', `${field} 必须是非负整数。`);
  }
  return Number(candidate);
}

function integerQuery(value: string, field: string): number {
  if (!/^\d+$/.test(value)) {
    throw chatException('CHAT_INVALID_QUERY', `${field} 必须是非负整数。`);
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number)) {
    throw chatException('CHAT_INVALID_QUERY', `${field} 超出有效范围。`);
  }
  return number;
}
