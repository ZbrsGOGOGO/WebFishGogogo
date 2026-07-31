import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Checkin } from '../../database/entities/checkin.entity';
import { EnergyState } from '../../database/entities/energy-state.entity';
import { InventoryLedger } from '../../database/entities/inventory-ledger.entity';
import { InventoryStack } from '../../database/entities/inventory-stack.entity';
import { ItemDefinition } from '../../database/entities/item-definition.entity';
import { PlayerProfile } from '../../database/entities/player-profile.entity';
import { PlayerProgression } from '../../database/entities/player-progression.entity';
import { RewardGrant } from '../../database/entities/reward-grant.entity';
import { WalletBalance } from '../../database/entities/wallet-balance.entity';
import { WalletLedger } from '../../database/entities/wallet-ledger.entity';
import { OutboxModule } from '../outbox';
import { CheckinsController } from './checkins.controller';
import { PlatformAssetsService } from './platform-assets.service';
import {
  PLATFORM_CLOCK,
  systemPlatformClock,
} from './platform.constants';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';

/**
 * 跨阅读、工具、农场和小游戏复用的用户资产底座。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      PlayerProfile,
      PlayerProgression,
      EnergyState,
      WalletBalance,
      WalletLedger,
      RewardGrant,
      Checkin,
      ItemDefinition,
      InventoryStack,
      InventoryLedger,
    ]),
    OutboxModule,
  ],
  controllers: [PlatformController, CheckinsController],
  providers: [
    PlatformService,
    PlatformAssetsService,
    {
      provide: PLATFORM_CLOCK,
      useValue: systemPlatformClock,
    },
  ],
  exports: [PlatformService, PlatformAssetsService],
})
export class PlatformModule {}
