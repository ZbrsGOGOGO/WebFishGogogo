import { describe, expect, it } from 'vitest';

import {
  createEquipment,
  createOpponent,
  createSeededRandom,
  createStarterEquipment,
  deriveFighterStats,
  ensureLootUpgrade,
  equipmentScore,
  resolveOfficeBattle,
  rollLoot,
  type OfficeFighter,
} from './office-battle-domain';

describe('office battle domain', () => {
  it('creates six profession-specific starter slots', () => {
    const equipment = createStarterEquipment('developer');

    expect(equipment).toHaveLength(6);
    expect(new Set(equipment.map((item) => item.slot)).size).toBe(6);
    expect(equipment.find((item) => item.slot === 'weapon')?.name).toContain('键盘');
    expect(equipment.every((item) => item.profession === 'developer')).toBe(true);
  });

  it('scales the same equipment route by level and rarity', () => {
    const common = createEquipment('sales', 'weapon', 1, 'common');
    const epic = createEquipment('sales', 'weapon', 20, 'epic');

    expect(common.name).toContain('客户名片夹');
    expect(epic.name).toContain('方案呈现台');
    expect(epic.stats.attack).toBeGreaterThan(common.stats.attack ?? 0);
    expect(equipmentScore(epic)).toBeGreaterThan(equipmentScore(common));
    expect(createEquipment('sales', 'weapon', 60, 'legendary').name).toContain(
      '年度签约金印',
    );

    const standardTerminal = createEquipment('developer', 'head', 1, 'common');
    const refinedTerminal = createEquipment('developer', 'head', 1, 'uncommon');
    expect(refinedTerminal.stats.defense).toBeGreaterThan(
      standardTerminal.stats.defense ?? 0,
    );
    expect(equipmentScore(refinedTerminal)).toBeGreaterThan(
      equipmentScore(standardTerminal),
    );
  });

  it('derives fighter stats from profession, level and all equipped items', () => {
    const baseFighter: OfficeFighter = {
      name: '测试同事',
      profession: 'qa',
      level: 1,
      equipment: [],
    };
    const equippedFighter = {
      ...baseFighter,
      equipment: createStarterEquipment('qa'),
    };

    const baseStats = deriveFighterStats(baseFighter);
    const equippedStats = deriveFighterStats(equippedFighter);
    expect(equippedStats.hp).toBeGreaterThan(baseStats.hp);
    expect(equippedStats.attack).toBeGreaterThan(baseStats.attack);
    expect(equippedStats.defense).toBeGreaterThan(baseStats.defense);
  });

  it('gives every profession weapon an original combat trait', () => {
    const traits = ['developer', 'product', 'qa', 'sales', 'hr'].map((profession) =>
      createEquipment(profession as OfficeFighter['profession'], 'weapon', 10, 'rare'),
    );

    expect(traits.map((item) => item.weaponTrait)).toEqual([
      'combo',
      'stun',
      'block',
      'critical',
      'drain',
    ]);
    expect(traits.every((item) => (item.weaponTraitChance ?? 0) > 0)).toBe(true);
  });

  it('applies universal and profession skill ranks to fighter growth', () => {
    const fighter: OfficeFighter = {
      name: '成长角色',
      profession: 'qa',
      level: 5,
      equipment: createStarterEquipment('qa'),
    };
    const before = deriveFighterStats(fighter);
    const after = deriveFighterStats({
      ...fighter,
      skillRanks: { focus: 2, resilience: 1, agility: 1, qa_mastery: 2 },
    });

    expect(after.attack).toBe(before.attack + 4);
    expect(after.hp).toBe(before.hp + 10);
    expect(after.defense).toBe(before.defense + 3);
    expect(after.speed).toBe(before.speed + 2);
    expect(after.luck).toBe(before.luck + 5);
  });

  it('resolves a deterministic automatic battle with complete logs', () => {
    const player: OfficeFighter = {
      name: '我的角色',
      profession: 'product',
      level: 3,
      equipment: createStarterEquipment('product'),
    };
    const opponent = createOpponent(player.profession, player.level, 42);

    const first = resolveOfficeBattle(player, opponent, createSeededRandom(99));
    const second = resolveOfficeBattle(player, opponent, createSeededRandom(99));

    expect(first).toEqual(second);
    expect(first.rounds).toBeGreaterThan(0);
    expect(first.logs.at(-1)?.kind).toBe('result');
    expect(['player', 'opponent']).toContain(first.winner);
  });

  it('rolls loot for the selected profession', () => {
    const loot = rollLoot('hr', 12, createSeededRandom(7));

    expect(loot.profession).toBe('hr');
    expect(loot.level).toBe(12);
    expect(loot.name.length).toBeGreaterThan(4);
  });

  it('promotes a first-win drop when the rolled item is not an upgrade', () => {
    const equipped = createEquipment('developer', 'accessory', 1, 'common');
    const candidate = createEquipment('developer', 'accessory', 1, 'common', 99);

    const upgraded = ensureLootUpgrade(candidate, equipped);

    expect(upgraded?.rarity).toBe('uncommon');
    expect(equipmentScore(upgraded!)).toBeGreaterThan(equipmentScore(equipped));
  });

  it('does not offer a fake upgrade above the level and rarity cap', () => {
    const equipped = createEquipment('hr', 'badge', 60, 'legendary');
    const candidate = createEquipment('hr', 'badge', 60, 'common', 7);

    expect(ensureLootUpgrade(candidate, equipped)).toBeNull();
  });
});
