import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
import {
  idempotencyKey,
  publicId,
  requiredObject,
} from './community-validation';
import { RelationshipService } from './relationship.service';

@Controller('v1')
@UseGuards(JwtAuthGuard)
export class RelationshipController {
  constructor(private readonly relationships: RelationshipService) {}

  @Get('friends')
  listFriends(
    @CurrentUserId() userId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.relationships.listFriends(userId, cursor);
  }

  @Get('friend-requests')
  listRequests(
    @CurrentUserId() userId: string,
    @Query('direction') rawDirection?: string,
    @Query('cursor') cursor?: string,
  ) {
    if (
      rawDirection !== undefined &&
      rawDirection !== 'incoming' &&
      rawDirection !== 'outgoing'
    ) {
      throw new BadRequestException('direction 不受支持');
    }
    return this.relationships.listRequests(userId, rawDirection, cursor);
  }

  @Post('friend-requests')
  sendRequest(
    @CurrentUserId() userId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') rawKey?: string,
  ) {
    const input = requiredObject(body);
    return this.relationships.sendRequest(
      userId,
      publicId(input.publicId),
      idempotencyKey(rawKey),
    );
  }

  @Post('friend-requests/:id/accept')
  accept(
    @CurrentUserId() userId: string,
    @Param('id') requestId: string,
    @Headers('idempotency-key') rawKey?: string,
  ) {
    return this.relationships.accept(
      userId,
      publicId(requestId, 'requestId'),
      idempotencyKey(rawKey),
    );
  }

  @Post('friend-requests/:id/reject')
  reject(
    @CurrentUserId() userId: string,
    @Param('id') requestId: string,
    @Headers('idempotency-key') rawKey?: string,
  ) {
    return this.relationships.reject(
      userId,
      publicId(requestId, 'requestId'),
      idempotencyKey(rawKey),
    );
  }

  @Delete('friend-requests/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  cancel(
    @CurrentUserId() userId: string,
    @Param('id') requestId: string,
    @Headers('idempotency-key') rawKey?: string,
  ): Promise<void> {
    return this.relationships.cancel(
      userId,
      publicId(requestId, 'requestId'),
      idempotencyKey(rawKey),
    );
  }

  @Delete('friends/:publicId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeFriend(
    @CurrentUserId() userId: string,
    @Param('publicId') targetPublicId: string,
    @Headers('idempotency-key') rawKey?: string,
  ): Promise<void> {
    return this.relationships.removeFriend(
      userId,
      publicId(targetPublicId),
      idempotencyKey(rawKey),
    );
  }

  @Get('blocks')
  listBlocks(
    @CurrentUserId() userId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.relationships.listBlocks(userId, cursor);
  }

  @Post('blocks')
  block(
    @CurrentUserId() userId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') rawKey?: string,
  ) {
    const input = requiredObject(body);
    return this.relationships.block(
      userId,
      publicId(input.publicId),
      idempotencyKey(rawKey),
    );
  }

  @Delete('blocks/:publicId')
  @HttpCode(HttpStatus.NO_CONTENT)
  unblock(
    @CurrentUserId() userId: string,
    @Param('publicId') targetPublicId: string,
    @Headers('idempotency-key') rawKey?: string,
  ): Promise<void> {
    return this.relationships.unblock(
      userId,
      publicId(targetPublicId),
      idempotencyKey(rawKey),
    );
  }
}
