import { BadRequestException } from '@nestjs/common';
import { Profession } from '@stealth-reader/shared';

import { UserPreference } from '../../database/entities/user-preference.entity';
import { PreferencePatch, PreferencesRepository } from './preferences.repository';
import { PreferencesService } from './preferences.service';

/**
 * 内存版 PreferencesRepository：忠实实现 upsert / getProfession / setProfession
 * 的持久化语义，用于在无数据库环境下验证 Service 行为与往返一致性（Property 9）。
 */
class InMemoryPreferencesRepository
  implements Pick<PreferencesRepository, 'ensure' | 'findByUserId' | 'upsert' | 'getProfession' | 'setProfession'>
{
  private store = new Map<string, UserPreference>();

  private defaults(userId: string): UserPreference {
    const pref = new UserPreference();
    pref.userId = userId;
    pref.activeSkin = 'csdn';
    pref.fontSize = 16;
    pref.lineHeight = '1.8';
    pref.theme = 'light';
    pref.bossKey = 'Escape';
    pref.profession = null;
    pref.settings = {};
    pref.updatedAt = new Date();
    return pref;
  }

  async findByUserId(userId: string): Promise<UserPreference | null> {
    return this.store.get(userId) ?? null;
  }

  async ensure(userId: string): Promise<UserPreference> {
    let pref = this.store.get(userId);
    if (!pref) {
      pref = this.defaults(userId);
      this.store.set(userId, pref);
    }
    return pref;
  }

  async upsert(userId: string, patch: PreferencePatch): Promise<UserPreference> {
    const pref = await this.ensure(userId);
    Object.assign(pref, patch);
    this.store.set(userId, pref);
    return pref;
  }

  async getProfession(userId: string): Promise<Profession | null> {
    return (this.store.get(userId)?.profession as Profession | null) ?? null;
  }

  async setProfession(userId: string, profession: Profession): Promise<void> {
    await this.upsert(userId, { profession });
  }
}

describe('PreferencesService', () => {
  let repo: InMemoryPreferencesRepository;
  let service: PreferencesService;
  const userId = 'user-1';

  beforeEach(() => {
    repo = new InMemoryPreferencesRepository();
    service = new PreferencesService(repo as unknown as PreferencesRepository);
  });

  it('returns default preferences when none persisted', async () => {
    const prefs = await service.getPreferences(userId);
    expect(prefs.activeSkin).toBe('csdn');
    expect(prefs.fontSize).toBe(16);
    expect(prefs.lineHeight).toBe('1.8');
    expect(prefs.theme).toBe('light');
    expect(prefs.bossKey).toBe('Escape');
    expect(prefs.profession).toBeNull();
  });

  it('persists reading + boss-key + skin settings (Req 6.4, 9.4)', async () => {
    await service.updatePreferences(userId, {
      activeSkin: 'juejin',
      fontSize: 20,
      lineHeight: '2.0',
      theme: 'dark',
      bossKey: 'F2',
    });

    const prefs = await service.getPreferences(userId);
    expect(prefs.activeSkin).toBe('juejin');
    expect(prefs.fontSize).toBe(20);
    expect(prefs.lineHeight).toBe('2.0');
    expect(prefs.theme).toBe('dark');
    expect(prefs.bossKey).toBe('F2');
  });

  it('only overrides provided fields on update', async () => {
    await service.updatePreferences(userId, { fontSize: 22 });
    const prefs = await service.updatePreferences(userId, { theme: 'dark' });
    expect(prefs.fontSize).toBe(22);
    expect(prefs.theme).toBe('dark');
    expect(prefs.activeSkin).toBe('csdn');
  });

  it('round-trips profession set -> get consistently (Req 14.6, backs Property 9)', async () => {
    for (const profession of Object.values(Profession)) {
      await service.setProfession(userId, profession);
      expect(await service.getProfession(userId)).toBe(profession);
    }
  });

  it('returns null profession when never set', async () => {
    expect(await service.getProfession(userId)).toBeNull();
  });

  it('rejects unsupported profession values', async () => {
    await expect(
      service.setProfession(userId, '老板' as unknown as Profession),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects unsupported profession in updatePreferences', async () => {
    await expect(
      service.updatePreferences(userId, {
        profession: 'invalid' as unknown as Profession,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows clearing profession with null via update', async () => {
    await service.setProfession(userId, Profession.Dev);
    await service.updatePreferences(userId, { profession: null });
    expect(await service.getProfession(userId)).toBeNull();
  });
});
