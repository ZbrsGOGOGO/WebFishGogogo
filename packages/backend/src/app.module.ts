import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { ReadingModule } from './modules/reading/reading.module';
import { SkinModule } from './modules/skin/skin.module';
import { MemoModule } from './modules/memo/memo.module';
import { PreferencesModule } from './modules/preferences/preferences.module';
import { ToolsModule } from './modules/tools/tools.module';

// 根模块（Task 13 后端集成 checkpoint）。
// 接入全部 V1 功能模块：auth/documents/reading/skin/memo/preferences/tools。
// - AuthModule 通过全局 JwtModule 提供 JwtService，供各模块 JwtAuthGuard 验签。
// - DocumentsModule/ReadingModule 组成 上传→解析→章节索引→阅读组装 端到端链路。
// - ToolsModule 依赖 PreferencesModule 完成 选职业→持久化→新会话推荐 链路。
@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    DocumentsModule,
    ReadingModule,
    SkinModule,
    MemoModule,
    PreferencesModule,
    ToolsModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
