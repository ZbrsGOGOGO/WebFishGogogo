import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';

import { SUPPORTED_PROFESSIONS } from './user-preference.entity';
import { Tool } from './tool.entity';

/** tool_professions.profession CHECK 约束（取值同 user_preferences.profession，但此处不允许 NULL） */
export const TOOL_PROFESSION_CHECK_EXPR = `profession IN (${SUPPORTED_PROFESSIONS.map(
  (p) => `'${p}'`,
).join(',')})`;

/**
 * tool_professions 表：工具↔职业 多对多映射（junction table）。
 * 对齐 design.md Data Models 的 tool_professions DDL：
 * 复合主键 (tool_id, profession)，profession 含 CHECK 约束，profession 建索引。
 */
@Entity({ name: 'tool_professions' })
@Check('chk_tool_profession', TOOL_PROFESSION_CHECK_EXPR)
@Index('idx_tool_professions_profession', ['profession'])
export class ToolProfession {
  @PrimaryColumn({ name: 'tool_id', type: 'uuid' })
  toolId!: string;

  @ManyToOne(() => Tool, (tool) => tool.toolProfessions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tool_id' })
  tool!: Tool;

  /** 职业标签，取值同 user_preferences.profession */
  @PrimaryColumn({ type: 'varchar', length: 20 })
  profession!: string;
}
