import { Module } from '@nestjs/common';

import { CommunityHealthController } from './community-health.controller';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { ChatModule } from './modules/chat/chat.module';
import { CommunityModule } from './modules/community/community.module';
import { CommunityContentModule } from './modules/community/community-content.module';
import { NewsModule } from './modules/community/news/news.module';
import { OfficeBattleModule } from './modules/community/office-battle/office-battle.module';
import { ArcadeModule } from './modules/community/arcade/arcade.module';

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
    OfficeBattleModule,
  ],
  controllers: [CommunityHealthController],
})
export class CommunityAppModule {}
