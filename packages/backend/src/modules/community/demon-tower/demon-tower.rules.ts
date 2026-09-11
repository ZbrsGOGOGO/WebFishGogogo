import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { DEMON_TOWER_FLOORS, type DemonTowerActionInput, type DemonTowerWorldView } from '@stealth-reader/shared';
import { DemonTowerWorldFloor } from '../../../database/entities/demon-tower.entity';
import { toBusinessLocalDate } from '../../platform/platform-time';
import { assertCommunityWritesEnabled, communityWritesEnabled } from '../community-write-gate';

export const DEMON_TOWER_DAILY_COINS = 200;
export const DEMON_TOWER_CHAMPION_COINS = 100;
export const DEMON_TOWER_DAILY_ACTION_LIMIT = 2000;
export const DEMON_TOWER_RANKING_RULES = '按服务器结算当日（北京时间00:00分日）的有效世界首领伤害总和排名；相同伤害先达到者优先。建设另计贡献，不折算伤害。每日最多3次讨伐，无有效伤害不发奖。每日00:05第一名获得100办公币，停机后补发且不重复。妖塔日常奖励另有每日200办公币上限；全程免费，无付费战力。';

export function demonTowerEnabled(): boolean { return process.env.FEATURE_COMMUNITY_DEMON_TOWER_ENABLED === 'true'; }
export function demonTowerExpansionEnabled(): boolean { return process.env.FEATURE_DEMON_TOWER_EXPANSION_ENABLED === 'true'; }
export function demonTowerWritesEnabled(): boolean { return demonTowerEnabled() && communityWritesEnabled(); }
export function assertDemonTowerWrites(): void {
  assertCommunityWritesEnabled();
  if (!demonTowerEnabled()) throw new ServiceUnavailableException({ code: 'DEMON_TOWER_DISABLED', message: '九层妖塔暂未开放，既有存档仍保留。' });
}

export function demonTowerAction(raw: unknown): DemonTowerActionInput {
  const fail = (): never => { throw new BadRequestException({ code: 'DEMON_TOWER_REQUEST_INVALID' }); };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail();
  const input = raw as Record<string, unknown>;
  if (Object.keys(input).length !== 4 || Object.keys(input).some((key) => !['requestId', 'expectedVersion', 'kind', 'payload'].includes(key))) fail();
  if (typeof input.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId)) fail();
  if (!Number.isInteger(input.expectedVersion) || (input.expectedVersion as number) < 0 || (input.expectedVersion as number) >= 2_147_483_647) fail();
  const kinds = ['enroll', 'explore', 'attack', 'skill', 'flee', 'train', 'rest', 'equip', 'allocate', 'reset_attributes', 'choose_innate', 'upgrade', 'select_floor', 'challenge_boss', 'donate', 'claim_reward', 'expedition', 'market', 'star_up', 'breakthrough', 'select_skin', 'claim_boss_loot', 'arena_enroll', 'arena_learn', 'arena_equip', 'arena_challenge', 'honor_exchange', 'squad_create', 'squad_join', 'squad_leave', 'squad_ready', 'squad_step', 'squad_claim', 'shop_purchase', 'use_rune'];
  if (typeof input.kind !== 'string' || !kinds.includes(input.kind)) fail();
  if (!input.payload || typeof input.payload !== 'object' || Array.isArray(input.payload)) fail();
  const pending: Array<{ item: unknown; depth: number }> = [{ item: input.payload, depth: 0 }];
  let count = 0;
  while (pending.length) {
    const { item, depth } = pending.pop()!;
    if (++count > 60 || depth > 3) fail();
    if (item && typeof item === 'object') {
      if (Object.keys(item).some((key) => key === '__proto__' || key === 'prototype' || key === 'constructor')) fail();
      for (const value of Object.values(item)) pending.push({ item: value, depth: depth + 1 });
    } else if (typeof item === 'string') { if (item.length > 100) fail(); }
    else if (typeof item === 'number') { if (!Number.isSafeInteger(item)) fail(); }
    else if (item !== null && typeof item !== 'boolean') fail();
  }
  if (JSON.stringify(input.payload).length > 2048) fail();
  if (input.kind === 'enroll' && Object.keys(input.payload as object).length) fail();
  return { ...input, requestId: (input.requestId as string).toLowerCase() } as DemonTowerActionInput;
}

export function demonTowerDate(raw: string | undefined, now: Date): string {
  if (raw !== undefined && typeof raw !== 'string') throw new BadRequestException({ code: 'DEMON_TOWER_DATE_INVALID' });
  const today = toBusinessLocalDate(now);
  const date = raw ?? today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date || date > today) throw new BadRequestException({ code: 'DEMON_TOWER_DATE_INVALID' });
  return date;
}

export function demonTowerFloor(raw: unknown, fallback = 1): number {
  if (raw === undefined) return fallback;
  const floor = typeof raw === 'string' && /^[1-9]$/.test(raw) ? Number(raw) : raw;
  if (!Number.isInteger(floor) || (floor as number) < 1 || (floor as number) > 9) throw new BadRequestException({ code: 'DEMON_TOWER_FLOOR_INVALID' });
  return floor as number;
}

/** GET may project this initial world without inserting any row. Explicit enrollment initializes it atomically. */
export function initialDemonTowerWorld(now = new Date(0)): DemonTowerWorldFloor[] {
  return DEMON_TOWER_FLOORS.map((definition) => Object.assign(new DemonTowerWorldFloor(), {
    floor: definition.floor, bossHp: definition.bossMaxHp, bossMaxHp: definition.bossMaxHp,
    passageProgress: 0, passageRequired: definition.passageRequired, version: 1,
    unlockedAt: definition.floor === 1 ? now : null, defeatedAt: null, completedAt: null, updatedAt: now,
  }));
}

export function demonTowerWorldView(input: DemonTowerWorldFloor[]): DemonTowerWorldView {
  const rows = input.length ? input : initialDemonTowerWorld();
  if (rows.length !== 9 || rows.some((row, index) => row.floor !== index + 1)) throw new Error('Demon tower world invariant failed');
  for (const [index, row] of rows.entries()) {
    const invalid = () => { throw new Error('Demon tower world invariant failed'); };
    if (![row.bossHp, row.bossMaxHp, row.passageProgress, row.passageRequired, row.version].every(Number.isSafeInteger) || row.bossHp < 0 || row.bossMaxHp <= 0 || row.bossHp > row.bossMaxHp || row.passageProgress < 0 || row.passageRequired <= 0 || row.passageProgress > row.passageRequired || row.version < 1) invalid();
    if (!(row.updatedAt instanceof Date) || !Number.isFinite(row.updatedAt.getTime())) invalid();
    for (const date of [row.unlockedAt, row.defeatedAt, row.completedAt]) if (date !== null && (!(date instanceof Date) || !Number.isFinite(date.getTime()))) invalid();
    if ((row.bossHp === 0) !== (row.defeatedAt !== null) || (row.passageProgress > 0 && row.bossHp > 0)) invalid();
    if ((row.passageProgress === row.passageRequired) !== (row.completedAt !== null)) invalid();
    if (row.unlockedAt === null && (row.bossHp !== row.bossMaxHp || row.passageProgress !== 0 || row.completedAt !== null || row.defeatedAt !== null)) invalid();
    if (index === 0 ? row.unlockedAt === null : (row.unlockedAt !== null) !== (rows[index - 1].completedAt !== null)) invalid();
  }
  const unlocked = rows.filter((row) => row.unlockedAt !== null);
  const current = unlocked.at(-1);
  if (!current) throw new Error('Demon tower world invariant failed');
  return {
    version: rows.reduce((sum, row) => sum + row.version - 1, 1),
    unlockedFloor: current.floor, currentFloor: current.floor,
    phase: current.completedAt !== null && current.floor === 9 ? 'complete' : current.bossHp > 0 ? 'boss' : 'passage',
    boss: { name: DEMON_TOWER_FLOORS[current.floor - 1].bossName, hp: current.bossHp, maxHp: current.bossMaxHp },
    passage: { current: current.passageProgress, required: current.passageRequired },
    completedFloors: rows.filter((row) => row.completedAt !== null).map((row) => row.floor),
    updatedAt: Math.max(...rows.map((row) => row.updatedAt.getTime())),
  };
}
