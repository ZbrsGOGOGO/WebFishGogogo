import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUserId } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CommunityRbacGuard } from './community-rbac.guard';
import { CommunityContentFeatureGuard } from './content-gates';
import { idempotencyKey, publicId } from './community-validation';
import { expectedVersion, strictObject } from './content-validation';
import {
  ModerationActionName,
  ModerationService,
} from './moderation.service';

@Controller('v1/admin/moderation')
@UseGuards(CommunityContentFeatureGuard, JwtAuthGuard, CommunityRbacGuard)
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}

  @Get('access')
  access(@CurrentUserId() userId: string) {
    return this.moderation.access(userId);
  }

  @Get('cases')
  listCases(
    @CurrentUserId() userId: string,
    @Query() query: Record<string, unknown>,
  ) {
    const allowed = ['status', 'riskLevel', 'contentType', 'cursor'];
    if (Object.keys(query).some((key) => !allowed.includes(key))) {
      throw new BadRequestException({ code: 'INVALID_MODERATION_FILTER' });
    }
    const value = (key: string) =>
      typeof query[key] === 'string' ? (query[key] as string) : undefined;
    return this.moderation.list(userId, {
      status: value('status'),
      riskLevel: value('riskLevel'),
      contentType: value('contentType'),
      cursor: value('cursor'),
    });
  }

  @Get('cases/:id')
  getCase(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.moderation.detail(userId, publicId(id, 'caseId'));
  }

  @Post('cases/:id/actions')
  applyAction(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('if-match') ifMatch?: string,
    @Headers('idempotency-key') rawKey?: string,
  ) {
    const raw = strictObject(body, ['action', 'reason', 'expectedVersion']);
    if (
      raw.action !== 'approve' &&
      raw.action !== 'limit' &&
      raw.action !== 'hide' &&
      raw.action !== 'restore'
    ) {
      throw new BadRequestException({ code: 'INVALID_MODERATION_ACTION' });
    }
    if (typeof raw.reason !== 'string') {
      throw new BadRequestException({ code: 'MODERATION_REASON_REQUIRED' });
    }
    return this.moderation.applyAction(
      userId,
      publicId(id, 'caseId'),
      raw.action as ModerationActionName,
      raw.reason,
      expectedVersion(ifMatch, raw.expectedVersion),
      idempotencyKey(rawKey),
    );
  }
}
