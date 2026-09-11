import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { COMMUNITY_ACHIEVEMENTS } from '@stealth-reader/shared';
import { User, WalletBalance } from '../../../database/entities';
import { CommunityAchievementUnlock, CommunityMembershipGrant, CommunityUserPresentation } from '../../../database/entities/community-progression.entity';
import { createLocalDevDataSource } from '../../../database/local-dev-datasource';
import { newOfficeProfile } from '../office-hub/office-hub.rules';
import { newOfficeRelief } from '../office-hub/office-relief.rules';
import { CommunityProgressionService } from './community-progression.service';
import { MembershipService } from './membership.service';
import { loadTitleBadges, unlockedTitleBadges } from './title-projection';

const keys = ['office_relief_fish', 'office_relief_rebel', 'office_relief_rest'] as const;
describe('Relief rare titles use real individual ownership without automatic public display', () => {
  let db: DataSource, progression: CommunityProgressionService, owner: User, peer: User;
  const env = { ...process.env }, now = new Date('2099-09-11T01:00:00Z');
  beforeEach(async () => {
    process.env.FEATURE_COMMUNITY_PROGRESSION_ENABLED = 'true'; process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'true'; process.env.FEATURE_OFFICE_HUB_ENABLED = 'true';
    db = await createLocalDevDataSource(); progression = new CommunityProgressionService(db, new MembershipService(), { now: () => now });
    const repo = db.getRepository(User); [owner, peer] = await repo.save(['relief_title', 'relief_peer'].map(username => repo.create({ username, email: username + '@synthetic.invalid', passwordHash: 'synthetic-only', accountStatus: 'active' })));
  });
  afterEach(async () => { if (db?.isInitialized) await db.destroy(); process.env = { ...env }; });
  async function state(titles: unknown, schemaVersion = 1) {
    await db.query('INSERT INTO office_hub_profiles(user_id,state) VALUES($1,$2::jsonb) ON CONFLICT(user_id) DO UPDATE SET state=EXCLUDED.state',
      [owner.id, JSON.stringify({ ...newOfficeProfile(+now), relief: { ...newOfficeRelief(+now), titles, schemaVersion } })]);
  }
  const equip = (key: string, expectedVersion = 0, requestId = randomUUID()) => progression.equip(owner.id, { titleKey: key, expectedVersion, requestId });

  it('registers three distinct plain-text cosmetic badges, not global exclusivity, VIP or admin rights', () => {
    const definitions = COMMUNITY_ACHIEVEMENTS.filter(item => keys.includes(item.key as typeof keys[number]));
    expect(definitions.map(item => item.title.label)).toEqual(['摸鱼之神', '反内卷先锋', '带薪如厕宗师']);
    expect(new Set(definitions.map(item => item.metric)).size).toBe(3);
    expect(definitions.every(item => item.target === 1)).toBe(true);
  });

  it('GET projects only each actual versioned prize flag and never grants, equips or creates assets', async () => {
    await state(['office_relief_rebel', 'office_relief_rebel', 'admin', { key: 'office_relief_fish' }]);
    const before = await db.query('SELECT state FROM office_hub_profiles WHERE user_id=$1', [owner.id]);
    const view = await progression.me(owner.id);
    expect(view.achievements.find(item => item.key === 'office_relief_rebel')).toMatchObject({ progress: 1, eligible: true, unlockedAt: null });
    for (const key of ['office_relief_fish', 'office_relief_rest']) expect(view.achievements.find(item => item.key === key)).toMatchObject({ progress: 0, eligible: false });
    expect((await progression.me(peer.id)).achievements.filter(item => keys.includes(item.key as typeof keys[number])).every(item => !item.eligible)).toBe(true);
    expect(view.presentation.equippedTitle).toBeNull(); expect(await loadTitleBadges(db.manager, [owner.id])).toEqual(new Map());
    for (const entity of [CommunityAchievementUnlock, CommunityUserPresentation, CommunityMembershipGrant, WalletBalance]) expect(await db.getRepository(entity).count()).toBe(0);
    expect(await db.query('SELECT state FROM office_hub_profiles WHERE user_id=$1', [owner.id])).toEqual(before);
  });

  it('refreshes the exact real prizes once and requires deliberate versioned ownership-bound equip', async () => {
    await state(['office_relief_fish', 'office_relief_rest']);
    const refreshed = await progression.refresh(owner.id, {}); expect(refreshed.newlyUnlocked).toEqual(['office_relief_fish', 'office_relief_rest']);
    expect((await progression.refresh(owner.id, {})).newlyUnlocked).toEqual([]);
    expect(await unlockedTitleBadges(db.manager, owner.id)).toHaveLength(2); expect(await loadTitleBadges(db.manager, [owner.id])).toEqual(new Map());
    await expect(equip('office_relief_rebel')).rejects.toMatchObject({ response: { code: 'TITLE_NOT_UNLOCKED' } });
    const requestId = randomUUID(); await equip('office_relief_fish', 0, requestId);
    expect((await equip('office_relief_fish', 0, requestId)).replayed).toBe(true);
    await expect(equip('office_relief_rest', 0)).rejects.toMatchObject({ response: { code: 'PROGRESSION_VERSION_CONFLICT' } });
    expect((await loadTitleBadges(db.manager, [owner.id, peer.id])).get(owner.id)).toEqual({ key: 'office_relief_fish', label: '摸鱼之神' });
    await equip('office_relief_rest', 1); expect((await loadTitleBadges(db.manager, [owner.id])).get(owner.id)?.key).toBe('office_relief_rest');
    expect((await db.getRepository(User).findOneByOrFail({ id: owner.id })).communityRole).toBe('user');
    for (const entity of [WalletBalance, CommunityMembershipGrant]) expect(await db.getRepository(entity).count()).toBe(0);
  });

  it('does not infer ownership from invalid shapes, unknown schema, display text or disabled Office Hub', async () => {
    for (const titles of ['office_relief_fish', { office_relief_fish: true }, ['摸鱼之神', 'fish_6', '<b>office_relief_fish</b>']]) {
      await state(titles); expect((await progression.refresh(owner.id, {})).newlyUnlocked).toEqual([]);
    }
    await state([...keys], 2); expect((await progression.refresh(owner.id, {})).newlyUnlocked).toEqual([]);
    await state([...keys]); process.env.FEATURE_OFFICE_HUB_ENABLED = 'false'; expect((await progression.refresh(owner.id, {})).newlyUnlocked).toEqual([]);
    await expect(equip('office_relief_fish')).rejects.toMatchObject({ response: { code: 'TITLE_NOT_UNLOCKED' } });
    expect(await db.getRepository(CommunityAchievementUnlock).count()).toBe(0);
  });

  it('recognizes a transactionally granted prize immediately but hides unowned or inactive projections', async () => {
    await db.getRepository(CommunityAchievementUnlock).insert({ userId: owner.id, achievementKey: 'office_relief_fish', unlockedAt: now, sourceVersion: 1 });
    await equip('office_relief_fish'); expect((await loadTitleBadges(db.manager, [owner.id])).size).toBe(1);
    await db.getRepository(CommunityAchievementUnlock).delete({ userId: owner.id, achievementKey: 'office_relief_fish' });
    expect((await loadTitleBadges(db.manager, [owner.id])).size).toBe(0);
    await db.getRepository(CommunityAchievementUnlock).insert({ userId: owner.id, achievementKey: 'office_relief_fish', unlockedAt: now, sourceVersion: 1 });
    await db.getRepository(User).update(owner.id, { accountStatus: 'suspended' }); expect((await loadTitleBadges(db.manager, [owner.id])).size).toBe(0);
  });
});
