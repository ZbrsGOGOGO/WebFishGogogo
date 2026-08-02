import { Controller, Get } from '@nestjs/common';

import { SkinService, SkinSummary } from './skin.service';

/**
 * SkinController：皮肤目录 REST API（design.md 6.4）。
 *
 * - GET /skins：返回所有已注册皮肤概要列表，供前端皮肤选择使用。
 *
 * 该端点仅暴露静态皮肤目录（不含任何用户数据），故不需要用户上下文
 * 或鉴权守卫，直接委托 SkinService.listSkins()。
 *
 * _Requirements: 5.1_
 */
@Controller('skins')
export class SkinController {
  constructor(private readonly skinService: SkinService) {}

  /** GET /skins：列出所有可用皮肤概要。 */
  @Get()
  listSkins(): SkinSummary[] {
    return this.skinService.listSkins();
  }
}
