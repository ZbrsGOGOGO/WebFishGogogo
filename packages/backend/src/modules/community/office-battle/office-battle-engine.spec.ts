import { createHash } from 'node:crypto';

import { calculateDamage, resolveOfficeBattle, Sha256CounterRandom } from './office-battle-engine';
import {
  battleLevelSnapshot,
  createEquipmentDefinition,
  deriveBattleStats,
  fighterPower,
  nextCommunityReset,
  OFFICE_BATTLE_SLOTS,
} from './office-battle-rules';

describe('Office Battle v1 pure rules and engine', () => {
  it('keeps the SHA-256 counter stream and complete settlement replay stable', () => {
    const random = Sha256CounterRandom.fromHex('00'.repeat(32));
    expect([random.next53(), random.next53(), random.next53()]).toEqual([
      1555369855698800n,
      312262592036373n,
      5324722636123268n,
    ]);

    const player = {
      profession: 'developer' as const,
      stats: { hp: 138, attack: 26, defense: 18, speed: 16, luck: 17 },
    };
    const opponent = {
      profession: 'product' as const,
      stats: { hp: 146, attack: 23, defense: 20, speed: 14, luck: 19 },
    };
    const first = resolveOfficeBattle(player, opponent, '01'.repeat(32));
    const replay = resolveOfficeBattle(player, opponent, '01'.repeat(32));
    expect(replay).toEqual(first);
    expect(first.events.at(-1)?.kind).toBe('battle_end');
    expect(first.rounds).toBeGreaterThanOrEqual(1);
    expect(first.rounds).toBeLessThanOrEqual(10);
    expect(createHash('sha256').update(JSON.stringify(first)).digest('hex')).toBe(
      '4549883c18d34bb07784f19bd396973c3d16828a0cbc205a18fc3195f574b6f3',
    );
  });

  it('uses exact equipment, level, power and damage formulas at boundaries', () => {
    const starter = OFFICE_BATTLE_SLOTS.map((slot) =>
      createEquipmentDefinition('developer', slot, 1, 'common'),
    );
    const stats = deriveBattleStats({ profession: 'developer', level: 1, equipment: starter });
    expect(stats).toEqual({ hp: 138, attack: 26, defense: 18, speed: 16, luck: 17 });
    expect(fighterPower(stats)).toBe(224);

    const top = createEquipmentDefinition('developer', 'weapon', 60, 'legendary');
    expect(top).toMatchObject({
      name: '代表作·星环算力中枢',
      equipmentLevel: 60,
      stats: { attack: 62 },
      score: 620,
    });
    expect(battleLevelSnapshot(40119)).toMatchObject({ level: 59 });
    expect(battleLevelSnapshot(40120)).toEqual({
      level: 60,
      experienceInLevel: 0,
      experienceToNextLevel: null,
    });

    expect(
      calculateDamage(
        { profession: 'developer', stats },
        {
          profession: 'product',
          stats: { hp: 146, attack: 23, defense: 20, speed: 14, luck: 19 },
        },
        1,
        146,
        true,
        true,
        0n,
      ),
    ).toBe(45);
  });

  it('resets on the next Asia/Shanghai 05:00 boundary', () => {
    expect(nextCommunityReset(new Date('2026-08-22T20:59:59+08:00')).toISOString()).toBe(
      '2026-08-22T21:00:00.000Z',
    );
    expect(nextCommunityReset(new Date('2026-08-22T05:00:00+08:00')).toISOString()).toBe(
      '2026-08-22T21:00:00.000Z',
    );
  });
});
