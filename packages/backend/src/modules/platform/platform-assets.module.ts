import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EnergyState } from '../../database/entities/energy-state.entity';
import { InventoryLedger } from '../../database/entities/inventory-ledger.entity';
import { InventoryStack } from '../../database/entities/inventory-stack.entity';
import { ItemDefinition } from '../../database/entities/item-definition.entity';
import { PlayerProfile } from '../../database/entities/player-profile.entity';
import { PlayerProgression } from '../../database/entities/player-progression.entity';
import { RewardGrant } from '../../database/entities/reward-grant.entity';
import { WalletBalance } from '../../database/entities/wallet-balance.entity';
import { WalletLedger } from '../../database/entities/wallet-ledger.entity';
import { PlatformAssetsService } from './platform-assets.service';
import { PLATFORM_CLOCK, systemPlatformClock } from './platform.constants';

/** Shared game assets without exposing the legacy platform HTTP controllers. */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      PlayerProfile,
      PlayerProgression,
      EnergyState,
      WalletBalance,
      WalletLedger,
      RewardGrant,
      ItemDefinition,
      InventoryStack,
      InventoryLedger,
    ]),
  ],
  providers: [
    PlatformAssetsService,
    { provide: PLATFORM_CLOCK, useValue: systemPlatformClock },
  ],
  exports: [PlatformAssetsService, PLATFORM_CLOCK],
})
export class PlatformAssetsModule {}
