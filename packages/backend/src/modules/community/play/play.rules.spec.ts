import { BadRequestException } from '@nestjs/common';
import { boundedPayload, gameKey, hash, object, PLAY_CATALOG, uuid } from './play.rules';

describe('play transport bounds and catalog', () => {
  it('hashes action objects independently from property order, without coercing types', () => {
    expect(hash({ sequence: 1, payload: { x: 1, y: 2 } })).toBe(hash({ payload: { y: 2, x: 1 }, sequence: 1 }));
    expect(hash({ sequence: 1 })).not.toBe(hash({ sequence: '1' }));
  });
  it('rejects deep and oversized action payloads before recursive canonicalization', () => {
    let nested: Record<string, unknown> = {};
    for (let i = 0; i < 100; i += 1) nested = { nested };
    expect(() => boundedPayload(nested)).toThrow(BadRequestException);
    expect(() => boundedPayload({ text: 'a'.repeat(16_385) })).toThrow(BadRequestException);
    expect(() => boundedPayload({ points: Array.from({ length: 500 }, () => ({ x: 1, y: 2 })) })).toThrow(BadRequestException);
    expect(() => boundedPayload({ round: 2, points: Array.from({ length: 120 }, () => ({ x: 0.5, y: 0.5 })), color: '#334155', width: 4 })).not.toThrow();
  });
  it('uses an explicit six-game allowlist and bounded shared prize policy', () => {
    expect(PLAY_CATALOG.games).toHaveLength(6);
    expect(PLAY_CATALOG.games.reduce((total, game) => total + game.dailyChampionCoins, 0)).toBe(600);
    expect(PLAY_CATALOG.games.every((game) => game.maxPlayers === 8)).toBe(true);
    expect(() => gameKey('office-battle')).toThrow(BadRequestException);
    expect(() => gameKey(['snake'])).toThrow(BadRequestException);
  });
  it('rejects malformed IDs and unknown transport fields', () => {
    expect(uuid('A42F3541-778A-4615-9FC7-46468CBA9A75')).toBe('a42f3541-778a-4615-9fc7-46468cba9a75');
    expect(() => uuid('constructor')).toThrow(BadRequestException);
    expect(() => object({ score: 999 }, ['kind', 'payload'])).toThrow(BadRequestException);
    expect(() => object(null)).toThrow(BadRequestException);
  });
});
