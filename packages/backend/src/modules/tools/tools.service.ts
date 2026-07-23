import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  Profession,
  Tool,
  ToolQuery,
  ToolRecommendation,
} from '@stealth-reader/shared';

import { PreferencesRepository } from '../preferences/preferences.repository';
import { filterTools, recommendTools } from './recommender';
import { ToolRepository } from './tool.repository';

/**
 * 工具筛选 / 搜索结果（含无匹配提示）。
 * 对齐 Req 14.4：无匹配时返回空集与提示信息。
 */
export interface ToolListResult {
  tools: Tool[];
  /** 是否无匹配（空结果集）——供前端展示无匹配提示 */
  noMatch: boolean;
  /** 无匹配提示文案（有匹配时为 null） */
  message: string | null;
}

/**
 * 工具启动结果（Req 14.5：打开工具并返回其可用状态）。
 */
export interface ToolLaunchResult {
  toolId: string;
  slug: string;
  /** 工具当前是否可用（已上架 enabled=true 即视为可启动） */
  available: boolean;
}

/** 无匹配提示文案（Req 14.4）。 */
const NO_MATCH_MESSAGE = '未匹配到任何工具';

/**
 * Tools_Service：工具聚合页的业务编排（见 design.md 6.3.5）。
 *
 * 仅负责载入工具目录、调用 recommender.ts 纯函数、并持久化职业偏好；
 * 推荐/筛选的核心逻辑保持在纯函数中（便于属性测试）。
 *
 * 承载 Requirement 14 的业务规则：
 * - 列出所有可用工具（Req 14.1）
 * - 职业化推荐（Req 14.2）
 * - 分类/名称筛选、搜索（Req 14.3）
 * - 无匹配返回空集 + 提示（Req 14.4）
 * - 启动工具返回可用状态（Req 14.5）
 * - 职业持久化（Req 14.6）与跨会话一致的推荐（Req 14.7）
 */
@Injectable()
export class ToolsService {
  constructor(
    private readonly toolRepo: ToolRepository,
    private readonly prefsRepo: PreferencesRepository,
  ) {}

  /**
   * 列出工具目录中所有可用工具。
   *
   * _Requirements: 14.1_
   */
  async listTools(): Promise<Tool[]> {
    return this.toolRepo.listEnabledWithProfessions();
  }

  /**
   * 按分类 / 名称关键字筛选或搜索工具目录。
   * 无匹配时返回空结果集与无匹配提示（Req 14.4）。
   *
   * _Requirements: 14.3, 14.4_
   */
  async searchTools(query: ToolQuery): Promise<ToolListResult> {
    const catalog = await this.toolRepo.listEnabledWithProfessions();
    const tools = filterTools(catalog, query);
    const noMatch = tools.length === 0;
    return {
      tools,
      noMatch,
      message: noMatch ? NO_MATCH_MESSAGE : null,
    };
  }

  /**
   * 选择职业：持久化到用户偏好，并返回据此生成的推荐。
   * Postconditions:
   *   - user_preferences.profession === profession（往返一致 —— 对齐 Property 9）
   *   - 返回的每个工具的 professions 均包含 profession
   *
   * _Requirements: 14.2, 14.6_
   */
  async selectProfession(
    userId: string,
    profession: Profession,
  ): Promise<ToolRecommendation> {
    await this.prefsRepo.setProfession(userId, profession); // 持久化（Req 14.6）
    const catalog = await this.toolRepo.listEnabledWithProfessions();
    return { profession, tools: recommendTools(catalog, profession) };
  }

  /**
   * 新会话进入工具页：使用已持久化职业生成推荐。
   * 若用户未设置职业则返回 null。
   * Postconditions:
   *   - 若用户已设置职业，则推荐等价于对该职业直接调用 recommendTools（跨会话一致）
   *
   * _Requirements: 14.7_
   */
  async getRecommendationForUser(
    userId: string,
  ): Promise<ToolRecommendation | null> {
    const profession = await this.prefsRepo.getProfession(userId);
    if (!profession) return null;
    const catalog = await this.toolRepo.listEnabledWithProfessions();
    return { profession, tools: recommendTools(catalog, profession) };
  }

  /**
   * 启动指定工具，返回其可用状态。
   * 目录只载入 enabled=true 的工具，故命中即视为可用；未找到（未上架/不存在）抛 404。
   *
   * _Requirements: 14.5_
   */
  async launchTool(toolId: string): Promise<ToolLaunchResult> {
    const catalog = await this.toolRepo.listEnabledWithProfessions();
    const tool = catalog.find((t) => t.id === toolId);
    if (!tool) {
      throw new NotFoundException(`Tool not found or unavailable: ${toolId}`);
    }
    return {
      toolId: tool.id,
      slug: tool.slug,
      available: tool.enabled,
    };
  }
}
