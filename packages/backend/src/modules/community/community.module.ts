import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  CommunityCommandReceipt,
  CommunityNotification,
  DeskPlant,
  DeskPlantCycle,
  DeskPlantRewardClaim,
  FriendEncouragement,
  FriendRequest,
  Friendship,
  Guild,
  GuildLedger,
  GuildMember,
  ReferralClaimToken,
  ReferralCode,
  ReferralRedemption,
  UserBlock,
} from '../../database/entities';
import { AuthModule } from '../auth/auth.module';
import { PlatformAssetsModule } from '../platform';
import {
  COMMUNITY_CLOCK,
  systemCommunityClock,
} from './community-clock';
import { DeskPlantController } from './desk-plant.controller';
import { DeskPlantService } from './desk-plant.service';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';
import { GuildController } from './guild.controller';
import { GuildService } from './guild.service';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { PublicProfileController } from './public-profile.controller';
import { PublicProfileService } from './public-profile.service';
import { ReferralController } from './referral.controller';
import { ReferralService } from './referral.service';
import { RelationshipController } from './relationship.controller';
import { RelationshipPolicyService } from './relationship-policy.service';
import { RelationshipService } from './relationship.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CommunityCommandReceipt,
      CommunityNotification,
      DeskPlant,
      DeskPlantCycle,
      DeskPlantRewardClaim,
      FriendEncouragement,
      FriendRequest,
      Friendship,
      Guild,
      GuildLedger,
      GuildMember,
      ReferralClaimToken,
      ReferralCode,
      ReferralRedemption,
      UserBlock,
    ]),
    AuthModule,
    PlatformAssetsModule,
  ],
  controllers: [
    RelationshipController,
    PublicProfileController,
    ReferralController,
    FeedController,
    DeskPlantController,
    GuildController,
    NotificationController,
  ],
  providers: [
    RelationshipPolicyService,
    RelationshipService,
    PublicProfileService,
    ReferralService,
    FeedService,
    DeskPlantService,
    GuildService,
    NotificationService,
    { provide: COMMUNITY_CLOCK, useValue: systemCommunityClock },
  ],
  exports: [
    RelationshipPolicyService,
    RelationshipService,
    ReferralService,
    FeedService,
    DeskPlantService,
    GuildService,
    NotificationService,
  ],
})
export class CommunityModule {}
