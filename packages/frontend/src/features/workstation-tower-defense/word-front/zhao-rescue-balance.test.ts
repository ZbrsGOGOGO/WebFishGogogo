import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const gameRoot = resolve(process.cwd(), 'public/games/zhao-rescue/js');
const playerKey = 'balance-regression';

type ZhaoRuntime = {
  config: Record<string, any>;
  core: Record<string, any>;
};

function today(): string {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function executeAsset(name: string): void {
  const source = readFileSync(resolve(gameRoot, name), 'utf8');
  const run = new Function(
    'window',
    'document',
    'localStorage',
    `var ZYJ = window.ZYJ = window.ZYJ || {};\n${source}\n//# sourceURL=zhao-rescue/${name}`,
  );
  run(window, document, localStorage);
}

function boot(legacyDayState?: Record<string, unknown>): ZhaoRuntime {
  document.body.innerHTML = '<canvas id="cv" width="384" height="480"></canvas>';
  Object.defineProperty(window, 'ZYJ_PLAYER_KEY', { value: playerKey, configurable: true });
  (window as any).ZYJ = {
    ui: { log: vi.fn(), toast: vi.fn(), renderAll: vi.fn() },
    api: { saveProgress: vi.fn(), loadProgress: vi.fn(() => ({ levels: {}, endlessBest: 0, codex: [] })) },
    net: { isActive: vi.fn(() => false), op: vi.fn() },
  };
  executeAsset('config.js');
  if (legacyDayState) localStorage.setItem(`momo_zyjad_day_${playerKey}`, JSON.stringify(legacyDayState));
  executeAsset('core.js');
  const runtime = (window as any).ZYJ as ZhaoRuntime;
  runtime.core.initBoard();
  return runtime;
}

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

afterEach(() => vi.restoreAllMocks());

describe('Zhao rescue canonical balance', () => {
  it('keeps attack speed in attacks per second and does not double server wave totals', () => {
    const { config } = boot();
    expect(config.UNIT_DEF['刀'].levels[1]).toMatchObject({ atk: 2, cd: 1.25, range: 3 });
    expect(config.UNIT_DEF['刀'].levels[5]).toMatchObject({ atk: 10, cd: 6.2, range: 3 });
    expect(config.WEAPON_ATKSPEED_MUL).toBe(1.3);
    expect(config.WAVE_DEF['山贼'].speed).toBe(0.4);
    expect(config.WAVES[0]).toHaveLength(24);
    expect(config.WAVES[1]).toHaveLength(32);

    config.applyServerConfig({ waves: [{ waveNo: 1, enemyName: '山贼', cnt: 2 }] });
    expect(config.WAVES).toHaveLength(1);
    expect(config.WAVES[0]).toEqual(['山贼', '山贼']);
  });

  it('produces identical complete stats for direct placement and every upgrade path', () => {
    const { core } = boot();
    core.reset('main', 0, 0);
    const [[c1, r1], [c2, r2], [c3, r3]] = core.freeCells();
    const direct = core.placeChar(r1, c1, '刀', 5);
    const upgraded = core.placeChar(r2, c2, '刀', 1);
    for (let level = 1; level < 5; level += 1) expect(core.upgradeUnit(upgraded)).toBe(true);

    expect({
      level: upgraded.card.level,
      atk: upgraded.atk,
      attackSpeed: upgraded.attackSpeed,
      interval: upgraded.cd0,
      range: upgraded.range,
      type: upgraded.atkType,
    }).toEqual({
      level: direct.card.level,
      atk: direct.atk,
      attackSpeed: direct.attackSpeed,
      interval: direct.cd0,
      range: direct.range,
      type: direct.atkType,
    });
    expect(direct.cd0).toBeCloseTo(1 / (6.2 * 1.3), 8);
    expect(core.upgradeUnit(upgraded)).toBe(false);
    expect(upgraded.card.level).toBe(5);

    expect(core.applyToCell(r3, c3, { kind: 'char', ch: '弓', level: 4 })).toBe('consumed');
    expect(core.board[r3][c3].unit.card.level).toBe(4);
    expect(core.board[r3][c3].unit.attackSpeed).toBe(5.4);
  });

  it('normalizes old oversized life bonuses and applies the documented +5/+3 values', () => {
    const legacy = {
      date: today(),
      buffs: { lifeBonus: 200 },
      stash: {},
    };
    const { core } = boot(legacy);
    core.reset('pvp', 0, 0);
    expect(core.G.adouMax).toBe(30);
    expect(core.G.oppAdouMax).toBe(26);
    expect(core.getDayState().buffs).toMatchObject({ lifeBonus: 10, opponentLifeBonus: 6 });
  });

  it('adds and persists the documented life values for each purchase', () => {
    const { core } = boot();
    core.reset('pvp', 0, 0);
    core.grantOfficeCoin(100);
    expect(core.buyMerchant('xumingdan').ok).toBe(true);
    expect(core.buyMerchant('xumingdan').ok).toBe(true);
    expect(core.G.adouMax).toBe(30);
    expect(core.G.oppAdouMax).toBe(26);
    expect(core.getDayState().buffs).toMatchObject({ lifeBonus: 10, opponentLifeBonus: 6 });
  });

  it('applies exactly one life for either bun outcome', () => {
    const { core } = boot();
    core.reset('main', 0, 0);
    core.G.adouHp = 10;
    vi.spyOn(Math, 'random').mockReturnValueOnce(0);
    expect(core.applyItem({ kind: 'item', item: '包子' })).toBe(true);
    expect(core.G.adouHp).toBe(11);

    vi.mocked(Math.random).mockReturnValueOnce(0.99);
    expect(core.applyItem({ kind: 'item', item: '包子' })).toBe(true);
    expect(core.G.adouHp).toBe(10);
  });
});
