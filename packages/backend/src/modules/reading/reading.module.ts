import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Bookmark, Chapter, ReadingProgress } from '../../database/entities';
import { DocumentsModule } from '../documents/documents.module';
import { StorageModule } from '../documents/storage';
import { SkinModule } from '../skin/skin.module';
import { BookmarkRepository } from './bookmark.repository';
import { ChapterRepository } from './chapter.repository';
import { ProgressRepository } from './progress.repository';
import { ReadingController } from './reading.controller';
import { ReadingService } from './reading.service';

/**
 * 阅读引擎模块（Reading）。
 *
 * 提供：
 * - 阅读进度数据访问（ProgressRepository）。
 * - 阅读视图组装与进度保存（ReadingService.getArticleView / saveProgress，
 *   对齐 tasks.md 9.3 / Requirement 5、6、7）。
 * - 章节目录与书签逻辑（ChapterRepository、BookmarkRepository、ReadingService，
 *   对齐 tasks.md 9.5 / Requirement 8）。
 *
 * 依赖：
 * - DocumentsModule：导出 DocumentRepository，用于归属鉴权与章节定位。
 * - StorageModule：导出 STORAGE_PORT，用于按 storageKey 拉取章节正文。
 * - SkinModule：导出 SkinService，用于将正文渲染为伪装文章视图。
 *
 * 暴露 ReadingController（tasks.md 9.6，design.md 6.4 REST API），经 JwtAuthGuard
 * 保护；导出 Service 与 Repository 以便后续集成。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ReadingProgress, Chapter, Bookmark]),
    DocumentsModule,
    StorageModule,
    SkinModule,
  ],
  controllers: [ReadingController],
  providers: [
    ProgressRepository,
    ChapterRepository,
    BookmarkRepository,
    ReadingService,
  ],
  exports: [
    ProgressRepository,
    ChapterRepository,
    BookmarkRepository,
    ReadingService,
  ],
})
export class ReadingModule {}
