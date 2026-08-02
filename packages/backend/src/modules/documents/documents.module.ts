import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Chapter } from '../../database/entities/chapter.entity';
import { Document } from '../../database/entities/document.entity';
import { DocumentRepository } from './document.repository';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { StorageModule } from './storage';

/**
 * 文档存储模块（Documents）。
 *
 * 提供 Document/Chapter 的数据访问（DocumentRepository）与上传解析编排
 * （DocumentsService，tasks.md 6.2）。DocumentsService 通过 StorageModule
 * 注入 StoragePort（STORAGE_PORT 令牌）。DocumentsController（tasks.md 6.5）
 * 暴露文档库 REST API（POST/GET/DELETE /documents，经 JwtAuthGuard 保护）；
 * JwtAuthGuard 依赖的 JwtService 由 AuthModule 的全局 JwtModule 提供，故此处
 * 无需显式导入 AuthModule。导出 DocumentsService/DocumentRepository 以便后续接入。
 */
@Module({
  imports: [TypeOrmModule.forFeature([Document, Chapter]), StorageModule],
  controllers: [DocumentsController],
  providers: [DocumentRepository, DocumentsService],
  exports: [DocumentRepository, DocumentsService],
})
export class DocumentsModule {}
