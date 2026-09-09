import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { PlatformAssetsModule } from '../../platform/platform-assets.module';
import { CommunityModule } from '../community.module';
import { DemonTowerController } from './demon-tower.controller';
import { DemonTowerRewardsService } from './demon-tower-rewards.service';
import { DemonTowerService } from './demon-tower.service';

@Module({ imports: [AuthModule, CommunityModule, PlatformAssetsModule], controllers: [DemonTowerController], providers: [DemonTowerService, DemonTowerRewardsService] })
export class DemonTowerModule {}
