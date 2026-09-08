import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { ChatModule } from '../../chat/chat.module';
import { PlatformAssetsModule } from '../../platform/platform-assets.module';
import { CommunityModule } from '../community.module';
import { RailChatService } from './rail-chat.service';
import { RailController } from './rail.controller';
import { RailRewardsService } from './rail-rewards.service';
import { RailService } from './rail.service';

@Module({ imports: [AuthModule, ChatModule, CommunityModule, PlatformAssetsModule], controllers: [RailController], providers: [RailService, RailRewardsService, RailChatService] })
export class RailModule {}
