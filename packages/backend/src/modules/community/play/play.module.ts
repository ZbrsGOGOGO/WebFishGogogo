import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { PlatformAssetsModule } from '../../platform/platform-assets.module';
import { CommunityModule } from '../community.module';
import { PlayController } from './play.controller';
import { PlayService } from './play.service';
import { PlayRewardsService } from './play-rewards.service';

@Module({ imports: [AuthModule, CommunityModule, PlatformAssetsModule], controllers: [PlayController], providers: [PlayService, PlayRewardsService] })
export class PlayModule {}
