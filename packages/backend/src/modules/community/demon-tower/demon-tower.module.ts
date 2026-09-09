import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { PlatformAssetsModule } from '../../platform/platform-assets.module';
import { CommunityModule } from '../community.module';
import { DemonTowerController } from './demon-tower.controller';
import { DemonTowerRewardsService } from './demon-tower-rewards.service';
import { DemonTowerService } from './demon-tower.service';
import { DemonTowerAutoService } from './demon-tower-auto.service';
import { CommunityProgressionModule } from '../progression/community-progression.module';

@Module({ imports: [AuthModule, CommunityModule, PlatformAssetsModule, CommunityProgressionModule], controllers: [DemonTowerController], providers: [DemonTowerService, DemonTowerRewardsService, DemonTowerAutoService] })
export class DemonTowerModule {}
