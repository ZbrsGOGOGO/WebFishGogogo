import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  AdminAuditLog,
  DevelopmentAttachmentRecord,
  DevelopmentEvent,
  DevelopmentMember,
  DevelopmentRequest,
  User,
} from '../../database/entities';
import { AuthModule } from '../auth/auth.module';
import { CommunityModule } from '../community/community.module';
import { DevelopmentAccessGuard } from './development-access.guard';
import { DevelopmentAttachmentAuthorGuard } from './development-attachment-author.guard';
import {
  DevelopmentAccessController,
  DevelopmentController,
} from './development.controller';
import { DevelopmentService } from './development.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AdminAuditLog,
      DevelopmentAttachmentRecord,
      DevelopmentEvent,
      DevelopmentMember,
      DevelopmentRequest,
      User,
    ]),
    AuthModule,
    CommunityModule,
  ],
  controllers: [DevelopmentAccessController, DevelopmentController],
  providers: [
    DevelopmentService,
    DevelopmentAccessGuard,
    DevelopmentAttachmentAuthorGuard,
  ],
  exports: [DevelopmentService],
})
export class DevelopmentModule {}
