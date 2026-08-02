import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { ToolProfession } from './tool-profession.entity';

/**
 * tools 表：工具目录（人工精选的自有合规实用工具，存元数据用于聚合/检索/推荐）。
 * 对齐 design.md Data Models 的 tools DDL。
 * idx_tools_category 为部分索引（WHERE enabled = true），在迁移脚本中定义。
 */
@Entity({ name: 'tools' })
export class Tool {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** 稳定 key/slug，前端据此加载对应工具组件 */
  @Column({ type: 'varchar', length: 64, unique: true })
  slug!: string;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  /** 工具分类（如 开发者/文本/计算/时间/转换） */
  @Column({ type: 'varchar', length: 50 })
  category!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description!: string | null;

  /** 图标标识或资源 key */
  @Column({ type: 'varchar', length: 200, nullable: true })
  icon!: string | null;

  /** 是否上架可用 */
  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @OneToMany(() => ToolProfession, (toolProfession) => toolProfession.tool)
  toolProfessions!: ToolProfession[];
}
