import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { Tool as ToolDto } from '@stealth-reader/shared';
import { Profession } from '@stealth-reader/shared';

import { Tool } from '../../database/entities/tool.entity';
import { ToolProfession } from '../../database/entities/tool-profession.entity';

/**
 * 工具目录数据访问层（见 design.md 6.3.5）。
 *
 * 职责：从 DB 载入完整工具目录（joined 职业标签），供 recommender.ts 纯函数
 * 做推荐/筛选。仅返回 enabled=true 的工具，并将每个工具的 professions 填充完整。
 * 不含任何业务编排（编排在 ToolsService，task 12.5）。
 */
@Injectable()
export class ToolRepository {
  constructor(
    @InjectRepository(Tool)
    private readonly toolRepo: Repository<Tool>,
  ) {}

  /**
   * 载入工具目录与其职业标签。
   * Postconditions:
   *   - 仅返回 enabled === true 的工具（对齐 Req 14.1：可用工具）
   *   - 每个返回工具的 professions 为该工具在 tool_professions 中的全部职业标签
   *   - professions 中每个取值均属于受支持职业集合（Profession 枚举）
   *   - 无副作用
   */
  async listEnabledWithProfessions(): Promise<ToolDto[]> {
    const tools = await this.toolRepo.find({
      where: { enabled: true },
      relations: { toolProfessions: true },
      order: { category: 'ASC', name: 'ASC' },
    });

    return tools.map((tool) => this.toDto(tool));
  }

  /** 将 TypeORM 实体（含 join 的 toolProfessions）映射为 shared 的 Tool DTO。 */
  private toDto(tool: Tool): ToolDto {
    const professions = (tool.toolProfessions ?? [])
      .map((tp: ToolProfession) => tp.profession as Profession)
      .filter((p): p is Profession =>
        (Object.values(Profession) as string[]).includes(p),
      );

    return {
      id: tool.id,
      slug: tool.slug,
      name: tool.name,
      category: tool.category,
      description: tool.description,
      icon: tool.icon,
      enabled: tool.enabled,
      professions,
    };
  }
}
