import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Tool } from '../../database/entities/tool.entity';
import { ToolProfession } from '../../database/entities/tool-profession.entity';
import { PreferencesModule } from '../preferences/preferences.module';
import { ToolRepository } from './tool.repository';
import { ToolsController } from './tools.controller';
import { ToolsService } from './tools.service';

/**
 * ToolsModule：工具聚合页领域（service/repository 层）。
 *
 * 注册 Tool / ToolProfession 实体与 ToolRepository，并导入 PreferencesModule
 * 以复用 PreferencesRepository.getProfession/setProfession（职业持久化 Req 14.6/14.7）。
 * ToolsController（task 12.7）暴露 GET /tools、GET /tools/recommend、POST /tools/:id/launch；
 * 此处导出 ToolsService 供后续复用。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Tool, ToolProfession]),
    PreferencesModule,
  ],
  controllers: [ToolsController],
  providers: [ToolRepository, ToolsService],
  exports: [ToolsService],
})
export class ToolsModule {}
