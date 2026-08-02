import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';

import { CurrentUserId } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserPreference } from '../../database/entities/user-preference.entity';
import { toPreferencePatch, UpdatePreferencesDto } from './dto/update-preferences.dto';
import { PreferencesService } from './preferences.service';

/**
 * PreferencesController：用户偏好 REST API（design.md 6.4）。
 *
 * - GET  /preferences：读取当前用户偏好（无记录时返回默认值行）。
 * - PUT  /preferences：部分更新偏好，同时持久化 profession
 *   （active_skin/font_size/line_height/theme/boss_key/profession —— Req 6.4/9.4/14.6）。
 *
 * 全部路由经 JwtAuthGuard 保护，userId 由 @CurrentUserId() 从已认证请求派生，
 * 客户端无法伪造他人 userId（对齐访问隔离）。
 */
@UseGuards(JwtAuthGuard)
@Controller('preferences')
export class PreferencesController {
  constructor(private readonly preferencesService: PreferencesService) {}

  /** GET /preferences：读取当前用户偏好。 */
  @Get()
  async getPreferences(@CurrentUserId() userId: string): Promise<UserPreference> {
    return this.preferencesService.getPreferences(userId);
  }

  /**
   * PUT /preferences：部分更新当前用户偏好并返回最新完整偏好。
   * profession 的受支持集合校验由 service 层完成（非法值返回 400）。
   */
  @Put()
  async updatePreferences(
    @CurrentUserId() userId: string,
    @Body() body: UpdatePreferencesDto,
  ): Promise<UserPreference> {
    const patch = toPreferencePatch(body);
    return this.preferencesService.updatePreferences(userId, patch);
  }
}
