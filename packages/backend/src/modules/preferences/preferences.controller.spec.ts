import { BadRequestException } from '@nestjs/common';
import { Profession } from '@stealth-reader/shared';

import { UserPreference } from '../../database/entities/user-preference.entity';
import { PreferencesController } from './preferences.controller';
import { PreferencePatch } from './preferences.repository';
import { PreferencesService } from './preferences.service';

/** 构造一个默认偏好行用于断言。 */
function makePref(userId: string, overrides: Partial<UserPreference> = {}): UserPreference {
  return {
    userId,
    user: undefined as unknown as UserPreference['user'],
    activeSkin: 'csdn',
    fontSize: 16,
    lineHeight: '1.8',
    theme: 'light',
    bossKey: 'Escape',
    profession: null,
    settings: {},
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('PreferencesController', () => {
  const userId = 'user-123';
  let service: jest.Mocked<Pick<PreferencesService, 'getPreferences' | 'updatePreferences'>>;
  let controller: PreferencesController;

  beforeEach(() => {
    service = {
      getPreferences: jest.fn(),
      updatePreferences: jest.fn(),
    };
    controller = new PreferencesController(service as unknown as PreferencesService);
  });

  it('GET /preferences 返回当前用户偏好', async () => {
    const pref = makePref(userId);
    service.getPreferences.mockResolvedValue(pref);

    await expect(controller.getPreferences(userId)).resolves.toBe(pref);
    expect(service.getPreferences).toHaveBeenCalledWith(userId);
  });

  it('PUT /preferences 透传规整后的部分更新（含 profession）', async () => {
    const updated = makePref(userId, { fontSize: 20, profession: Profession.Dev });
    service.updatePreferences.mockResolvedValue(updated);

    const body = {
      activeSkin: 'juejin',
      fontSize: 20,
      lineHeight: 2,
      theme: 'dark',
      bossKey: 'F1',
      profession: Profession.Dev,
    };
    const result = await controller.updatePreferences(userId, body);

    expect(result).toBe(updated);
    const expectedPatch: PreferencePatch = {
      activeSkin: 'juejin',
      fontSize: 20,
      lineHeight: '2',
      theme: 'dark',
      bossKey: 'F1',
      profession: Profession.Dev,
    };
    expect(service.updatePreferences).toHaveBeenCalledWith(userId, expectedPatch);
  });

  it('PUT /preferences 支持仅更新部分字段', async () => {
    service.updatePreferences.mockResolvedValue(makePref(userId));

    await controller.updatePreferences(userId, { theme: 'dark' });

    expect(service.updatePreferences).toHaveBeenCalledWith(userId, { theme: 'dark' });
  });

  it('PUT /preferences 允许将 profession 置空', async () => {
    service.updatePreferences.mockResolvedValue(makePref(userId));

    await controller.updatePreferences(userId, { profession: null });

    expect(service.updatePreferences).toHaveBeenCalledWith(userId, { profession: null });
  });

  it('PUT /preferences 对非法字段类型返回 400', async () => {
    await expect(
      controller.updatePreferences(userId, { fontSize: 'big' } as unknown as { fontSize: number }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.updatePreferences).not.toHaveBeenCalled();
  });
});
