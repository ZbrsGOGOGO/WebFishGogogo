import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { CommunityRbacGuard } from './community-rbac.guard';
import { CommunityContentFeatureGuard } from './content-gates';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';
import { NotificationService } from './notification.service';
import { RelationshipPolicyService } from './relationship-policy.service';

@Module({
  imports: [AuthModule],
  controllers: [ContentController, ModerationController],
  providers: [
    CommunityRbacGuard,
    CommunityContentFeatureGuard,
    ContentService,
    ModerationService,
    NotificationService,
    RelationshipPolicyService,
  ],
  exports: [ContentService, ModerationService],
})
export class CommunityContentModule {}
