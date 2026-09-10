import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommunityAchievementUnlock, CommunityMembershipGrant, CommunityUserPresentation } from '../../../database/entities/community-progression.entity';
import { AuthModule } from '../../auth/auth.module';
import { COMMUNITY_CLOCK, systemCommunityClock } from '../community-clock';
import { CommunityProgressionController } from './community-progression.controller';
import { CommunityProgressionService } from './community-progression.service';
import { MembershipService } from './membership.service';
import { FishGrowthService } from './fish-growth.service';
import { SupportLedgerService } from './support-ledger.service';

@Module({ imports: [AuthModule, TypeOrmModule.forFeature([CommunityMembershipGrant, CommunityAchievementUnlock, CommunityUserPresentation])],
  controllers: [CommunityProgressionController], providers: [CommunityProgressionService, MembershipService, FishGrowthService, SupportLedgerService, { provide: COMMUNITY_CLOCK, useValue: systemCommunityClock }],
  exports: [MembershipService, CommunityProgressionService] })
export class CommunityProgressionModule {}
