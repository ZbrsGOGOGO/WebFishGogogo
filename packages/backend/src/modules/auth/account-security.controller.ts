import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  Post,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';

import { AccountLifecycleService } from './account-lifecycle.service';
import { AccountAdminGuard } from './account-admin.guard';
import {
  parseAppealDecision,
  parseAppealReason,
  parseDeletionConfirmation,
  parsePasswordReset,
  parsePasswordResetRequest,
  parseSocialVerificationCallback,
  parseVerificationSessionRequest,
  safeHeader,
} from './auth-security-validation';
import { CurrentSessionId, CurrentUserId } from './current-user.decorator';
import { validateUuid } from './dto/auth-validation';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PasswordResetService } from './password-reset.service';
import { RestrictedJwtAuthGuard } from './restricted-jwt-auth.guard';
import { SocialVerificationService } from './social-verification.service';

interface RawCallbackRequest {
  rawBody?: Buffer;
}

@Controller('v1/auth')
export class AccountSecurityPublicController {
  constructor(
    private readonly passwordReset: PasswordResetService,
    private readonly socialVerification: SocialVerificationService,
  ) {}

  @Post('password-reset-requests')
  @HttpCode(HttpStatus.ACCEPTED)
  async requestPasswordReset(
    @Body() body: unknown,
    @Ip() ipAddress?: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<void> {
    const input = parsePasswordResetRequest(body);
    await this.passwordReset.request(input.email, {
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    });
  }

  @Post('password-resets')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(
    @Body() body: unknown,
    @Ip() ipAddress?: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<void> {
    const input = parsePasswordReset(body);
    await this.passwordReset.reset(input.token, input.newPassword, {
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    });
  }

  @Post('social-verification/callbacks')
  @HttpCode(HttpStatus.OK)
  callback(
    @Body() body: unknown,
    @Req() request: RawCallbackRequest,
    @Headers('x-verification-timestamp') timestamp?: string,
    @Headers('x-verification-nonce') nonce?: string,
    @Headers('x-verification-event-id') eventId?: string,
    @Headers('x-verification-signature') signature?: string,
    @Ip() ipAddress?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    const rawBody = request.rawBody;
    if (!rawBody) {
      throw new ServiceUnavailableException({
        code: 'VERIFICATION_CALLBACK_RAW_BODY_REQUIRED',
      });
    }
    return this.socialVerification.callback(
      parseSocialVerificationCallback(body),
      {
        timestamp: timestamp ?? '',
        nonce: nonce ?? '',
        eventId: eventId ?? '',
        signature: signature ?? '',
      },
      rawBody,
      { ipAddress: ipAddress ?? null, userAgent: userAgent ?? null },
    );
  }
}

@Controller('v1/me')
@UseGuards(JwtAuthGuard)
export class SocialVerificationController {
  constructor(private readonly socialVerification: SocialVerificationService) {}

  @Get('social-verification')
  get(@CurrentUserId() userId: string) {
    return this.socialVerification.get(userId);
  }

  @Post('social-verification/sessions')
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUserId() userId: string,
    @Body() body: unknown,
    @Ip() ipAddress?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    parseVerificationSessionRequest(body);
    return this.socialVerification.create(userId, {
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    });
  }
}

@Controller('v1/me')
@UseGuards(RestrictedJwtAuthGuard)
export class AccountLifecycleController {
  constructor(private readonly lifecycle: AccountLifecycleService) {}

  @Get('account-status')
  status(@CurrentUserId() userId: string) {
    return this.lifecycle.getStatus(userId);
  }

  @Get('account-deletion')
  deletion(@CurrentUserId() userId: string) {
    return this.lifecycle.getDeletion(userId);
  }

  @Post('account-deletion-requests')
  @HttpCode(HttpStatus.OK)
  requestDeletion(
    @CurrentUserId() userId: string,
    @CurrentSessionId() sessionId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') rawIdempotencyKey?: string,
  ) {
    parseDeletionConfirmation(body);
    const idempotencyKey = safeHeader(
      rawIdempotencyKey,
      'IDEMPOTENCY_KEY_REQUIRED',
      8,
      100,
    );
    return this.lifecycle.requestDeletion(userId, sessionId, idempotencyKey);
  }

  @Post('account-deletion/cancel')
  @HttpCode(HttpStatus.OK)
  cancelDeletion(@CurrentUserId() userId: string) {
    return this.lifecycle.cancelDeletion(userId);
  }

  @Post('account-appeals')
  @HttpCode(HttpStatus.CREATED)
  appeal(@CurrentUserId() userId: string, @Body() body: unknown) {
    return this.lifecycle.submitAppeal(userId, parseAppealReason(body));
  }
}

@Controller('v1/admin/account-appeals')
@UseGuards(JwtAuthGuard, AccountAdminGuard)
export class AccountAppealAdminController {
  constructor(private readonly lifecycle: AccountLifecycleService) {}

  @Get(':id')
  detail(@CurrentUserId() actorId: string, @Param('id') rawId: string) {
    return this.lifecycle.adminAppealDetail(
      actorId,
      validateUuid(rawId, 'appealId'),
    );
  }

  @Post(':id/decision')
  @HttpCode(HttpStatus.OK)
  decide(
    @CurrentUserId() actorId: string,
    @Param('id') rawId: string,
    @Body() body: unknown,
  ) {
    const input = parseAppealDecision(body);
    return this.lifecycle.decideAppeal(
      actorId,
      validateUuid(rawId, 'appealId'),
      input.decision,
      input.reason,
    );
  }
}
