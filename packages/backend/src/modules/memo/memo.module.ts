import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Memo } from '../../database/entities';
import { MemoController } from './memo.controller';
import { MemoRepository } from './memo.repository';
import { MemoService } from './memo.service';

/**
 * 便签模块（Memo）。
 *
 * 提供 Memo_Service 与其 Repository，并暴露 MemoController（GET/PUT /memo，
 * 经 JwtAuthGuard 保护，Task 10.2）。导出 MemoService 以便后续集成。
 */
@Module({
  imports: [TypeOrmModule.forFeature([Memo])],
  controllers: [MemoController],
  providers: [MemoRepository, MemoService],
  exports: [MemoService],
})
export class MemoModule {}
