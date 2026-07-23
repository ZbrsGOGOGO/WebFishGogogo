import { BadRequestException, Injectable } from '@nestjs/common';
import { Profession } from '@stealth-reader/shared';

import { UserPreference } from '../../database/entities/user-preference.entity';
import { PreferencePatch, PreferencesRepository } from './preferences.repository';

/** 受支持职业取值集合（运行时校验用）。 */
const SUPPORTED_PROFESSIONS: readonly Profession[] = Object.values(Profession);

/**
 * PreferencesService：用户偏好业务逻辑。
 *
 * 持久化 active_skin、font_size、line_height、theme、boss_key、profession
 * （对齐 requirements 6.4 阅读设置、9.4 自定义老板键、14.6 职业持久化）。
 * 控制器层（task 11.2）在此之上暴露 GET/PUT /preferences。
 */
@Injectable()
export class PreferencesService {
  constructor(private readonly prefsRepo: PreferencesRepository) {}

  /** 读取用户偏好；无记录时返回带默认值的偏好行。 */
  async getPreferences(userId: string): Promise<UserPreference> {
    return this.prefsRepo.ensure(userId);
  }

  /**
   * 更新用户偏好（仅覆盖提供的字段），返回最新完整偏好。
   * 若 patch 含 profession，会校验其属于受支持集合。
   */
  async updatePreferences(userId: string, patch: PreferencePatch): Promise<UserPreference> {
    if (patch.profession !== undefined && patch.profession !== null) {
      this.assertSupportedProfession(patch.profession);
    }
    return this.prefsRepo.upsert(userId, patch);
  }

  /**
   * 读取用户已持久化职业；未设置时返回 null（Req 14.7 依赖此值生成推荐）。
   */
  async getProfession(userId: string): Promise<Profession | null> {
    return this.prefsRepo.getProfession(userId);
  }

  /**
   * 持久化用户职业偏好（Req 14.6）。
   * Postcondition: getProfession(userId) === profession（往返一致 —— 对齐 Property 9）。
   */
  async setProfession(userId: string, profession: Profession): Promise<void> {
    this.assertSupportedProfession(profession);
    await this.prefsRepo.setProfession(userId, profession);
  }

  /** 校验职业取值属于受支持集合，否则抛出 400。 */
  private assertSupportedProfession(profession: Profession): void {
    if (!SUPPORTED_PROFESSIONS.includes(profession)) {
      throw new BadRequestException(`Unsupported profession: ${String(profession)}`);
    }
  }
}
