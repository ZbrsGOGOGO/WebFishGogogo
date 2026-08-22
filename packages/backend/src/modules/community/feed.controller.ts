import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUserId } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  idempotencyKey,
  publicId,
  requiredObject,
} from './community-validation';
import { FeedService } from './feed.service';

@Controller('v1/feeds')
@UseGuards(JwtAuthGuard)
export class FeedController {
  constructor(private readonly feeds: FeedService) {}

  @Get()
  overview(
    @CurrentUserId() userId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.feeds.overview(userId, cursor);
  }

  @Post()
  send(
    @CurrentUserId() userId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') rawKey?: string,
  ) {
    const input = requiredObject(body);
    return this.feeds.send(
      userId,
      publicId(input.recipientPublicId, 'recipientPublicId'),
      this.feeds.assertType(input.type),
      idempotencyKey(rawKey),
    );
  }
}
