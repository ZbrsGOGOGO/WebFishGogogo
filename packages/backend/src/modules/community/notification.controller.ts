import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUserId } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { publicId, requiredObject } from './community-validation';
import { NotificationService } from './notification.service';

@Controller('v1/notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  list(
    @CurrentUserId() userId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.notifications.list(userId, cursor);
  }

  @Put(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async read(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
  ): Promise<void> {
    await this.notifications.markRead(userId, publicId(id, 'notificationId'));
  }

  @Put('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  async readAll(@CurrentUserId() userId: string): Promise<void> {
    await this.notifications.markAllRead(userId);
  }

  @Put('read-by-category')
  @HttpCode(HttpStatus.NO_CONTENT)
  async readByCategory(
    @CurrentUserId() userId: string,
    @Body() body: unknown,
  ): Promise<void> {
    const raw = requiredObject(body);
    await this.notifications.markAllRead(
      userId,
      this.notifications.assertCategory(raw.category),
    );
  }
}
