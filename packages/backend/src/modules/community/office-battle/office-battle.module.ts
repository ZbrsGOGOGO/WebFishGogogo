import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  CommunityCommandReceipt,
  OfficeBattleAssetLedger,
  OfficeBattleDefenseConfig,
  OfficeBattleEquipment,
  OfficeBattleFriendRewardClaim,
  OfficeBattleInventoryLedger,
  OfficeBattleLoadoutItem,
  OfficeBattleOffer,
  OfficeBattleOfferSet,
  OfficeBattlePendingReward,
  OfficeBattleProfile,
  OfficeBattleRecord,
} from '../../../database/entities';
import { AuthModule } from '../../auth/auth.module';
import {
  PLATFORM_CLOCK,
  PlatformAssetsService,
  systemPlatformClock,
} from '../../platform';
import { COMMUNITY_CLOCK, systemCommunityClock } from '../community-clock';
import { CommunityModule } from '../community.module';
import { OfficeBattleController } from './office-battle.controller';
import { OfficeBattleFeatureGuard, OfficeBattleVerifiedGuard } from './office-battle-gates';
import { OfficeBattleService } from './office-battle.service';

/** Independent server-authoritative game module; it never imports legacy Arena. */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      CommunityCommandReceipt,
      OfficeBattleAssetLedger,
      OfficeBattleDefenseConfig,
      OfficeBattleEquipment,
      OfficeBattleFriendRewardClaim,
      OfficeBattleInventoryLedger,
      OfficeBattleLoadoutItem,
      OfficeBattleOffer,
      OfficeBattleOfferSet,
      OfficeBattlePendingReward,
      OfficeBattleProfile,
      OfficeBattleRecord,
    ]),
    AuthModule,
    CommunityModule,
  ],
  controllers: [OfficeBattleController],
  providers: [
    OfficeBattleService,
    OfficeBattleFeatureGuard,
    OfficeBattleVerifiedGuard,
    PlatformAssetsService,
    { provide: COMMUNITY_CLOCK, useValue: systemCommunityClock },
    { provide: PLATFORM_CLOCK, useValue: systemPlatformClock },
  ],
})
export class OfficeBattleModule {}
