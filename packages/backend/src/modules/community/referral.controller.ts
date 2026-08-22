import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CurrentUserId } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { idempotencyKey, requiredObject } from './community-validation';
import { ReferralService } from './referral.service';

@Controller('v1')
export class ReferralController {
  constructor(private readonly referrals: ReferralService) {}

  @Post('referrals/code')
  @UseGuards(JwtAuthGuard)
  createOrRotate(
    @CurrentUserId() userId: string,
    @Headers('idempotency-key') rawKey?: string,
  ) {
    return this.referrals.createOrRotate(userId, idempotencyKey(rawKey));
  }

  @Get('me/referrals')
  @UseGuards(JwtAuthGuard)
  overview(@CurrentUserId() userId: string) {
    return this.referrals.overview(userId);
  }

  @Post('referrals/preview')
  @Header('Cache-Control', 'no-store')
  preview(@Body() body: unknown) {
    const input = requiredObject(body);
    return this.referrals.preview(input.code as string);
  }
}
