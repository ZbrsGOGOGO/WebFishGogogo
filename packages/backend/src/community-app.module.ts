import { Module } from '@nestjs/common';

import { CommunityHealthController } from './community-health.controller';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { ChatModule } from './modules/chat/chat.module';
import { CommunityModule } from './modules/community/community.module';
import { CommunityContentModule } from './modules/community/community-content.module';
import { NewsModule } from './modules/community/news/news.module';
import { ArcadeModule } from './modules/community/arcade/arcade.module';
import { PlayModule } from './modules/community/play/play.module';
import { RailModule } from './modules/community/rail/rail.module';
import { DemonTowerModule } from './modules/community/demon-tower/demon-tower.module';
import { CommunityProgressionModule } from './modules/community/progression/community-progression.module';
import { DevelopmentModule } from './modules/development/development.module';
import { TowerDefenseModule } from './modules/community/tower-defense/tower-defense.module';
import { OfficeHubModule } from './modules/community/office-hub/office-hub.module';
import { PaperArenaModule } from './modules/community/paper-arena/paper-arena.module';

/**
 * 正式社区的 API 白名单根模块。
 *
 * 这里有意不导入旧 AppModule，也不导入 documents、reading、memo、tools、
 * legacy farm/arena 等模块。后续社区模块只有在完成迁移、权限和发布闸门后，
 * 才逐个加入此清单。
 */
@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    ChatModule,
    CommunityModule,
    CommunityContentModule,
    NewsModule,
    ArcadeModule,
    PlayModule,
    RailModule,
    DemonTowerModule,
    CommunityProgressionModule,
    DevelopmentModule,
    TowerDefenseModule,
    OfficeHubModule,
    PaperArenaModule,
  ],
  controllers: [CommunityHealthController],
})
export class CommunityAppModule {}
