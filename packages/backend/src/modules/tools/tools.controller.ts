import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Profession } from '@stealth-reader/shared';
import type { Tool, ToolRecommendation } from '@stealth-reader/shared';

import { CurrentUserId } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  ToolLaunchResult,
  ToolListResult,
  ToolsService,
} from './tools.service';

/** 受支持职业取值集合（query 参数运行时校验用）。 */
const SUPPORTED_PROFESSIONS: readonly Profession[] = Object.values(Profession);

/**
 * ToolsController：工具聚合页 REST API（design.md 6.4）。
 *
 * - GET  /tools：列出所有可用工具；带 category / q 时执行筛选/搜索（Req 14.1/14.3/14.4）。
 * - GET  /tools/recommend：带 profession 时选择并持久化职业后推荐（Req 14.2/14.6），
 *        未带 profession 时使用已持久化职业生成推荐（Req 14.7）。
 * - POST /tools/:id/launch：启动指定工具并返回其可用状态（Req 14.5）。
 *
 * 全部路由经 JwtAuthGuard 保护，userId 由 @CurrentUserId() 从已认证请求派生，
 * 客户端无法伪造他人 userId（对齐访问隔离）。
 */
@UseGuards(JwtAuthGuard)
@Controller('tools')
export class ToolsController {
  constructor(private readonly toolsService: ToolsService) {}

  /**
   * GET /tools 或 GET /tools?category=&q=
   *
   * 未提供任何筛选参数时返回工具目录全部可用工具（Req 14.1）；
   * 提供 category / q 之一或两者时执行筛选/搜索，无匹配返回空集 + 提示（Req 14.3/14.4）。
   */
  @Get()
  async list(
    @Query('category') category?: string,
    @Query('q') q?: string,
  ): Promise<Tool[] | ToolListResult> {
    const hasCategory = typeof category === 'string' && category.trim() !== '';
    const hasQuery = typeof q === 'string' && q.trim() !== '';
    if (!hasCategory && !hasQuery) {
      return this.toolsService.listTools();
    }
    return this.toolsService.searchTools({
      category: hasCategory ? category : undefined,
      query: hasQuery ? q : undefined,
    });
  }

  /**
   * GET /tools/recommend?profession=
   *
   * 提供 profession 时：校验取值 → 持久化并据此推荐（Req 14.2/14.6）。
   * 未提供 profession 时：使用用户已持久化职业推荐；未设置职业返回 null（Req 14.7）。
   */
  @Get('recommend')
  async recommend(
    @CurrentUserId() userId: string,
    @Query('profession') profession?: string,
  ): Promise<ToolRecommendation | null> {
    if (typeof profession === 'string' && profession.trim() !== '') {
      const validated = this.assertSupportedProfession(profession);
      return this.toolsService.selectProfession(userId, validated);
    }
    return this.toolsService.getRecommendationForUser(userId);
  }

  /**
   * POST /tools/:id/launch：启动指定工具并返回其可用状态（Req 14.5）。
   * 工具不存在或未上架时由 service 抛出 404。
   */
  @Post(':id/launch')
  async launch(@Param('id') id: string): Promise<ToolLaunchResult> {
    return this.toolsService.launchTool(id);
  }

  /** 校验职业 query 参数属于受支持集合，否则抛出 400。 */
  private assertSupportedProfession(profession: string): Profession {
    if (!SUPPORTED_PROFESSIONS.includes(profession as Profession)) {
      throw new BadRequestException(`Unsupported profession: ${profession}`);
    }
    return profession as Profession;
  }
}
