import { Module } from '@nestjs/common';

import { SkinController } from './skin.controller';
import { SkinService } from './skin.service';

/**
 * 伪装/皮肤模块（Skin）。
 *
 * 提供 SkinService（模板注册表 + 数据契约渲染）并暴露 SkinController
 * （GET /skins 可用皮肤列表，Task 7.4）。导出 SkinService 以便 ReadingService
 * 组装阅读视图时消费（design.md 关切点 6，ReadingService.getArticleView）。
 */
@Module({
  controllers: [SkinController],
  providers: [SkinService],
  exports: [SkinService],
})
export class SkinModule {}
