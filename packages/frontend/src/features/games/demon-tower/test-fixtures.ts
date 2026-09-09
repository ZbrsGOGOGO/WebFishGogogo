import { DEMON_TOWER_CATALOG, type DemonTowerActionReceipt, type DemonTowerBattleView, type DemonTowerCatalog, type DemonTowerOverview, type DemonTowerProfileView, type DemonTowerWorldView } from '@stealth-reader/shared';
import type { CommunityAuthUser } from '../../../api/community';

export const TOWER_TEST_USER: CommunityAuthUser = { id: 'tower-user-a', publicId: 'tower-public-a', email: 'demon-tower-ui@users.invalid', displayName: '隔离寻道者甲', accountStatus: 'active', onboardingCompleted: true, socialVerificationStatus: 'verified', battleProfession: 'developer' };
export const TOWER_TEST_NOW = Date.parse('2026-09-09T01:00:00Z');
export function towerCatalog(overrides: Partial<DemonTowerCatalog> = {}): DemonTowerCatalog { return { ...structuredClone(DEMON_TOWER_CATALOG), ...overrides }; }
export function towerWorld(overrides: Partial<DemonTowerWorldView> = {}): DemonTowerWorldView {
  return { version: 1, unlockedFloor: 1, currentFloor: 1, phase: 'boss', boss: { name: '百战羚王·犼野', hp: 2200, maxHp: 2400 }, passage: { current: 0, required: 60 }, completedFloors: [], updatedAt: TOWER_TEST_NOW, ...overrides };
}
export function towerProfile(overrides: Partial<DemonTowerProfileView> = {}): DemonTowerProfileView {
  return {
    version: 1, level: 1, experience: 8, experienceToNext: 30, totalExperience: 8,
    attributes: { STR: 10, SPD: 10, AGI: 10, DEF: 10, LUCK: 10 }, effectiveAttributes: { STR: 16, SPD: 10, AGI: 10, DEF: 10, LUCK: 16 }, unspentPoints: 1,
    attributeReset: { allocatedPoints: 0, eligibleAt: null },
    hp: 80, maxHp: 100, stamina: 95, staminaMax: 100, nextStaminaAt: TOWER_TEST_NOW + 100_000,
    materials: { ore: 30, herb: 20, soul: 8, clue: 3 },
    weapons: [{ id: 'w1', quality: 1, spareCopies: 0 }, { id: 'w17', quality: 1, spareCopies: 0 }, { id: 'w5', quality: 1, spareCopies: 1 }],
    skills: ['s1', 's2', 's3', 's4'].map((id) => ({ id: id as 's1' | 's2' | 's3' | 's4', quality: 1, spareCopies: 0 })),
    loadout: { mainHand: 'w1', artifact: 'w17', activeSkills: ['s1', 's2', 's3'], passiveSkills: [] },
    selectedFloor: 1, personalUnlockedFloor: 1,
    daily: { serviceDate: '2026-09-09', activity: 1, activityTarget: 3, rewardClaimed: false, bossAttempts: 0, bossAttemptsMax: 3, officeCoinsEarned: 0, officeCoinCap: 200 },
    battle: null, lastReport: null, availableActions: ['explore', 'train', 'rest', 'equip', 'allocate', 'reset_attributes', 'upgrade', 'select_floor', 'challenge_boss', 'donate', 'claim_reward'], createdAt: TOWER_TEST_NOW,
    ...overrides,
  };
}
export function towerOverview(overrides: Partial<DemonTowerOverview> = {}): DemonTowerOverview { return { serverNow: TOWER_TEST_NOW, profile: towerProfile(), world: towerWorld(), wallet: { officeCoinBalance: 500 }, writesEnabled: true, ...overrides }; }
export function towerReceipt(overrides: Partial<DemonTowerActionReceipt> = {}): DemonTowerActionReceipt { return { requestId: '00000000-0000-4000-8000-000000000001', replayed: false, overview: towerOverview({ profile: towerProfile({ version: 2 }) }), events: ['完成一次探索，资料已保存。'], officeCoinsGranted: 0, effectiveBossDamage: 0, passageContribution: 0, ...overrides }; }
export function towerBattle(overrides: Partial<DemonTowerBattleView> = {}): DemonTowerBattleView {
  return { id: 'test-battle-a', kind: 'explore', floor: 1, turn: 2, roundLimit: 12,
    player: { id: 'player-a', name: '寻道者', hp: 50, maxHp: 100, shield: 12, attributes: { STR: 16, SPD: 10, AGI: 10, DEF: 10, LUCK: 16 }, effects: [{ id: 'str', name: '力之祝福', remainingTurns: 2, magnitude: 10 }] },
    enemies: [{ id: 'enemy-a', name: '荒原狼', hp: 30, maxHp: 50, shield: 0, attributes: { STR: 8, SPD: 6, AGI: 6, DEF: 5, LUCK: 5 }, effects: [] }, { id: 'enemy-b', name: '石甲蜥', hp: 18, maxHp: 60, shield: 4, attributes: { STR: 10, SPD: 3, AGI: 3, DEF: 12, LUCK: 3 }, effects: [] }],
    availableSkills: [{ id: 's1', cooldownRemaining: 2, usable: false }, { id: 's2', cooldownRemaining: 0, usable: true }, { id: 's3', cooldownRemaining: 0, usable: true }],
    log: [{ turn: 2, actor: 'player', kind: 'damage', text: '裂地斩实际造成 22 点伤害。', amount: 22, targetId: 'enemy-a' }], ...overrides };
}
