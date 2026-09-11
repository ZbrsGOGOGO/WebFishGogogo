import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  OFFICE_RELIEF_BOOKS, OFFICE_RELIEF_CROPS, OFFICE_RELIEF_MATERIALS, OFFICE_RELIEF_RULES,
  OFFICE_RELIEF_SKINS, OFFICE_RELIEF_TITLES, OFFICE_RELIEF_TOOLS,
  type OfficeReliefAction, type OfficeReliefDrop, type OfficeReliefOutcome,
  type OfficeReliefState, type OfficeReliefTool,
} from '@stealth-reader/shared';

const RULES = OFFICE_RELIEF_RULES;
const MAX_COUNTER = 2_147_483_647;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function invalid(code = 'ACTION_INVALID'): never { throw new BadRequestException({ code: `OFFICE_RELIEF_${code}` }); }
function conflict(code: string): never { throw new ConflictException({ code: `OFFICE_RELIEF_${code}` }); }
const integer = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
function object(value: unknown, keys: readonly string[], required: readonly string[] = keys): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![null, Object.prototype].includes(Object.getPrototypeOf(value))) invalid();
  const raw = value as Record<string, unknown>;
  if (Reflect.ownKeys(raw).some(key => typeof key !== 'string' || !keys.includes(key) || !Object.getOwnPropertyDescriptor(raw, key)?.enumerable ||
    !('value' in Object.getOwnPropertyDescriptor(raw, key)!)) || required.some(key => !Object.prototype.hasOwnProperty.call(raw, key))) invalid();
  return raw;
}
function iso(raw: unknown): raw is string {
  return typeof raw === 'string' && raw.length <= 28 && Number.isFinite(Date.parse(raw)) && new Date(raw).toISOString() === raw;
}
function time(now: number): string {
  if (!integer(now, 0, 8_640_000_000_000_000)) invalid('TIME_INVALID');
  return new Date(now).toISOString();
}
function uuid(raw: unknown): string {
  if (typeof raw !== 'string' || !UUID.test(raw)) invalid();
  return raw.toLowerCase();
}
function closedArray(raw: unknown, choices: readonly { id: string }[]): string[] {
  if (!Array.isArray(raw) || raw.length > choices.length || new Set(raw).size !== raw.length || raw.some(id => typeof id !== 'string' || !choices.some(item => item.id === id))) invalid();
  return raw;
}
function dropDefinition(kind: unknown, id: unknown): { id: string; name: string; quantity: number } | undefined {
  const pool = kind === 'tower_material' ? OFFICE_RELIEF_MATERIALS : kind === 'farm_crop' ? OFFICE_RELIEF_CROPS : kind === 'tower_book' ? OFFICE_RELIEF_BOOKS : [];
  return pool.find(item => item.id === id);
}
function validateDrop(raw: unknown): OfficeReliefDrop {
  const value = object(raw, ['id', 'kind', 'itemId', 'quantity', 'receivedAt']);
  const definition = dropDefinition(value.kind, value.itemId);
  if (!definition || value.quantity !== definition.quantity || !iso(value.receivedAt)) invalid();
  uuid(value.id);
  return copy(value) as OfficeReliefDrop;
}
function validateOutcome(raw: unknown): OfficeReliefOutcome {
  const value = object(raw, ['id', 'at', 'kind', 'tokenDelta', 'nominalAmount', 'itemId', 'dropId', 'message', 'tool'], ['id', 'at', 'kind', 'tokenDelta', 'message']);
  uuid(value.id);
  if (!iso(value.at) || typeof value.message !== 'string' || !value.message.length || value.message.length > 300 || !integer(value.tokenDelta, -RULES.maxCoinReward, RULES.maxCoinReward)) invalid();
  const isPlay = ['coin', 'loss', 'title', 'tower_material', 'farm_crop', 'tower_book'].includes(value.kind as string);
  if (isPlay ? !OFFICE_RELIEF_TOOLS.some(item => item.id === value.tool) : value.tool !== undefined) invalid();
  if (value.nominalAmount !== undefined && !integer(value.nominalAmount, 0, RULES.maxCoinReward)) invalid();
  if (value.kind === 'coin') {
    if (!integer(value.tokenDelta, 100, RULES.maxCoinReward) || value.nominalAmount !== undefined || value.itemId !== undefined || value.dropId !== undefined) invalid();
  } else if (value.kind === 'loss') {
    if (!integer(value.nominalAmount, RULES.lossMin, RULES.lossMax) || !integer(value.tokenDelta, -value.nominalAmount, 0) || value.itemId !== undefined || value.dropId !== undefined) invalid();
  } else if (value.kind === 'title') {
    if (!OFFICE_RELIEF_TITLES.some(item => item.id === value.itemId) || ![0, RULES.titleDuplicateTokens].includes(value.tokenDelta) || value.nominalAmount !== undefined || value.dropId !== undefined) invalid();
  } else if (['tower_material', 'farm_crop', 'tower_book'].includes(value.kind as string)) {
    if (!dropDefinition(value.kind, value.itemId) || value.dropId !== value.id || value.tokenDelta !== 0 || value.nominalAmount !== undefined) invalid();
  } else if (value.kind === 'purchase') {
    const skin = OFFICE_RELIEF_SKINS.find(item => item.id === value.itemId);
    if (!skin || value.tokenDelta !== -skin.price || value.dropId !== undefined || value.nominalAmount !== undefined) invalid();
  } else if (value.kind === 'equip') {
    if (value.itemId !== undefined && !OFFICE_RELIEF_SKINS.some(item => item.id === value.itemId) || value.tokenDelta !== 0 || value.dropId !== undefined || value.nominalAmount !== undefined) invalid();
  } else if (value.kind === 'claim') {
    uuid(value.dropId);
    if (![...OFFICE_RELIEF_MATERIALS, ...OFFICE_RELIEF_CROPS, ...OFFICE_RELIEF_BOOKS].some(item => item.id === value.itemId) || value.tokenDelta !== 0 || value.nominalAmount !== undefined) invalid();
  } else invalid();
  return copy(value) as unknown as OfficeReliefOutcome;
}
/** Reject corrupt persisted assets; never silently replace an existing save. */
export function validateOfficeRelief(raw: unknown): OfficeReliefState {
  try {
    const value = object(raw, ['schemaVersion', 'version', 'chances', 'remainderSeconds', 'trackedSeconds', 'tokenBalance', 'totalPlays', 'titles', 'skins', 'equippedSkin', 'pending', 'history', 'lastResult', 'startedAt']);
    if (value.schemaVersion !== 1 || !integer(value.version, 1, MAX_COUNTER) || !integer(value.chances, 0, RULES.chanceCap) ||
      !integer(value.remainderSeconds, 0, RULES.secondsPerChance - 1) || !integer(value.trackedSeconds, 0, Number.MAX_SAFE_INTEGER) ||
      !integer(value.tokenBalance, 0, RULES.tokenCap) || !integer(value.totalPlays, 0, MAX_COUNTER - 1) || value.totalPlays >= value.version ||
      value.trackedSeconds !== (value.totalPlays + value.chances) * RULES.secondsPerChance + value.remainderSeconds ||
      value.chances === RULES.chanceCap && value.remainderSeconds !== 0 || !iso(value.startedAt)) invalid();
    const titles = closedArray(value.titles, OFFICE_RELIEF_TITLES), skins = closedArray(value.skins, OFFICE_RELIEF_SKINS);
    if (value.equippedSkin !== null && !skins.includes(value.equippedSkin as string)) invalid();
    if (!Array.isArray(value.pending) || value.pending.length > RULES.pendingCap || !Array.isArray(value.history) || value.history.length > RULES.historyLimit) invalid();
    const pending = value.pending.map(validateDrop), history = value.history.map(validateOutcome);
    if (new Set(pending.map(item => item.id)).size !== pending.length || new Set(history.map(item => item.id)).size !== history.length ||
      history.length > value.version - 1 || pending.length > value.totalPlays) invalid();
    let previousTime = Date.parse(value.startedAt);
    for (const outcome of history) {
      if (Date.parse(outcome.at) < previousTime || outcome.kind === 'title' && !titles.includes(outcome.itemId!)) invalid();
      previousTime = Date.parse(outcome.at);
    }
    if (pending.some(item => Date.parse(item.receivedAt) < Date.parse(value.startedAt as string))) invalid();
    const lastResult = value.lastResult === null ? null : validateOutcome(value.lastResult);
    if ((lastResult === null) !== (history.length === 0) || lastResult && JSON.stringify(lastResult) !== JSON.stringify(history.at(-1))) invalid();
    return { schemaVersion: 1, version: value.version, chances: value.chances, remainderSeconds: value.remainderSeconds,
      trackedSeconds: value.trackedSeconds, tokenBalance: value.tokenBalance, totalPlays: value.totalPlays,
      titles: [...titles], skins: [...skins], equippedSkin: value.equippedSkin, pending, history, lastResult, startedAt: value.startedAt } as OfficeReliefState;
  } catch { return conflict('STATE_INVALID'); }
}
export function newOfficeRelief(now: number): OfficeReliefState {
  return { schemaVersion: 1, version: 1, chances: 0, remainderSeconds: 0, trackedSeconds: 0, tokenBalance: 0, totalPlays: 0,
    titles: [], skins: [], equippedSkin: null, pending: [], history: [], lastResult: null, startedAt: time(now) };
}
/** Undefined means not activated. Reading projects zeros only; callers decide whether a write is authorized. */
export function readOfficeRelief(raw: unknown, now: number): OfficeReliefState {
  time(now);
  const state = raw === undefined ? newOfficeRelief(now) : validateOfficeRelief(raw);
  if (Date.parse(state.startedAt) > now || state.history.some(item => Date.parse(item.at) > now) || state.pending.some(item => Date.parse(item.receivedAt) > now)) invalid('TIME_INVALID');
  return state;
}
/** Only use server-accepted active seconds, already deduplicated and capped by FishGrowthService. */
export function accrueOfficeRelief(input: OfficeReliefState, acceptedSeconds: number): OfficeReliefState {
  const state = validateOfficeRelief(input);
  if (!integer(acceptedSeconds, 0, RULES.activeSecondsPerDay)) invalid();
  const capacitySeconds = (RULES.chanceCap - state.chances) * RULES.secondsPerChance - state.remainderSeconds;
  const accepted = Math.min(capacitySeconds, acceptedSeconds);
  if (!Number.isSafeInteger(state.trackedSeconds + accepted)) conflict('STATE_INVALID');
  state.trackedSeconds += accepted;
  const progress = state.remainderSeconds + accepted;
  state.chances += Math.floor(progress / RULES.secondsPerChance);
  state.remainderSeconds = state.chances === RULES.chanceCap ? 0 : progress % RULES.secondsPerChance;
  return state;
}

export type OfficeReliefRng = (maxExclusive: number) => number;
export type OfficeReliefDraw = { kind: 'coin'; amount: number } | { kind: 'loss'; amount: number } | { kind: 'title'; itemId: typeof OFFICE_RELIEF_TITLES[number]['id'] }
  | Pick<OfficeReliefDrop, 'kind' | 'itemId' | 'quantity'>;
function random(rng: OfficeReliefRng, max: number): number {
  const value = rng(max);
  if (!integer(value, 0, max - 1)) invalid('RANDOM_INVALID');
  return value;
}
/** The same exact integer draw used by live actions and seeded probability tests. No save or RNG is exposed to clients. */
export function drawOfficeRelief(rng: OfficeReliefRng): OfficeReliefDraw {
  const roll = random(rng, RULES.weightTotal), weights = RULES.weights;
  if (roll < weights.coin) {
    let tierPoint = random(rng, 100);
    const tier = RULES.coinTiers.find(item => { tierPoint -= item.weight; return tierPoint < 0; })!;
    return { kind: 'coin', amount: tier.min + random(rng, tier.max - tier.min + 1) };
  }
  if (roll < weights.coin + weights.loss) return { kind: 'loss', amount: RULES.lossMin + random(rng, RULES.lossMax - RULES.lossMin + 1) };
  if (roll < weights.coin + weights.loss + weights.title) return { kind: 'title', itemId: OFFICE_RELIEF_TITLES[random(rng, OFFICE_RELIEF_TITLES.length)].id };
  const materialEnd = weights.coin + weights.loss + weights.title + weights.tower_material;
  const kind = roll < materialEnd ? 'tower_material' : roll < materialEnd + weights.farm_crop ? 'farm_crop' : 'tower_book';
  const pool = kind === 'tower_material' ? OFFICE_RELIEF_MATERIALS : kind === 'farm_crop' ? OFFICE_RELIEF_CROPS : OFFICE_RELIEF_BOOKS;
  const item = pool[random(rng, pool.length)];
  return { kind, itemId: item.id, quantity: item.quantity };
}
export interface OfficeReliefActionContext { now: number; requestId: string; rng: OfficeReliefRng }
export interface OfficeReliefActionResult { state: OfficeReliefState; outcome: OfficeReliefOutcome; claimedDrop?: OfficeReliefDrop }
/** Pure transition. A claim is committed only after the caller grants claimedDrop in the SAME transaction. */
export function actOfficeRelief(input: OfficeReliefState, raw: OfficeReliefAction | unknown, context: OfficeReliefActionContext): OfficeReliefActionResult {
  const state = readOfficeRelief(input, context.now), id = uuid(context.requestId), at = time(context.now);
  if (state.version >= MAX_COUNTER) conflict('STATE_INVALID');
  if (state.history.some(item => item.id === id) || state.pending.some(item => item.id === id)) conflict('REQUEST_REUSED');
  const value = object(raw, ['kind', 'tool', 'skinId', 'dropId'], ['kind']);
  let outcome: OfficeReliefOutcome, claimedDrop: OfficeReliefDrop | undefined;
  if (value.kind === 'play') {
    object(raw, ['kind', 'tool']);
    if (!OFFICE_RELIEF_TOOLS.some(item => item.id === value.tool)) invalid();
    if (!state.chances) conflict('NO_CHANCES');
    // Reject all outcomes before RNG when any possible deferred reward cannot fit.
    if (state.pending.length >= RULES.pendingCap) conflict('PENDING_FULL');
    if (state.tokenBalance > RULES.tokenCap - RULES.maxCoinReward) conflict('TOKENS_FULL');
    const draw = drawOfficeRelief(context.rng), tool = value.tool as OfficeReliefTool;
    outcome = { id, at, kind: draw.kind, tokenDelta: 0, message: '', tool };
    if (draw.kind === 'coin') { outcome.tokenDelta = draw.amount; outcome.message = `小老板交出${draw.amount}解压币，仅用于本模块外观。`; }
    else if (draw.kind === 'loss') { const actualLoss = Math.min(state.tokenBalance, draw.amount); outcome.tokenDelta = actualLoss ? -actualLoss : 0; outcome.nominalAmount = draw.amount; outcome.message = `小老板嘴硬反击！原扣幅${draw.amount}，实际仅扣${actualLoss}解压币；办公币与主线资产不受影响。`; }
    else if (draw.kind === 'title') {
      const title = OFFICE_RELIEF_TITLES.find(item => item.id === draw.itemId)!;
      const duplicate = state.titles.includes(draw.itemId);
      if (duplicate) outcome.tokenDelta = RULES.titleDuplicateTokens; else state.titles.push(draw.itemId);
      outcome.itemId = draw.itemId; outcome.message = duplicate ? `已拥有「${title.name}」，重复称号转为${RULES.titleDuplicateTokens}解压币。` : `获得稀有称号「${title.name}」！每位玩家均有机会获得，并非全站唯一。`;
    } else {
      const drop = { id, receivedAt: at, ...draw } as OfficeReliefDrop;
      state.pending.push(drop); outcome.itemId = draw.itemId; outcome.dropId = id;
      const item = dropDefinition(draw.kind, draw.itemId)!;
      outcome.message = draw.kind === 'farm_crop'
        ? `获得${item.name}×${draw.quantity}，已存入待领礼包；每份领取后增加${RULES.farmExperiencePerGift}种植经验，不发办公币、不自动收获或更换作物。`
        : draw.kind === 'tower_book'
          ? draw.itemId === 'weapon_manual'
            ? `获得${item.name}，已存入待领礼包；领取后为当时主手武器暂存${draw.quantity}品质经验，不直接升星或升品质。`
            : `获得${item.name}，已存入待领礼包；领取后增加${draw.quantity}技能碎片。`
          : `获得${item.name}×${draw.quantity}，已存入待领礼包；需显式领取，不自动改变农场或妖塔。`;
    }
    state.tokenBalance += outcome.tokenDelta; state.chances--; state.totalPlays++;
  } else if (value.kind === 'buy') {
    object(raw, ['kind', 'skinId']); const skin = OFFICE_RELIEF_SKINS.find(item => item.id === value.skinId);
    if (!skin) invalid();
    if (state.skins.includes(skin.id)) conflict('SKIN_OWNED');
    if (state.tokenBalance < skin.price) conflict('TOKENS_LOW');
    state.tokenBalance -= skin.price; state.skins.push(skin.id);
    outcome = { id, at, kind: 'purchase', tokenDelta: -skin.price, itemId: skin.id, message: `已用${skin.price}解压币解锁「${skin.name}」外观；不增加战力、不改变掉率，可自行装备。` };
  } else if (value.kind === 'equip') {
    object(raw, ['kind', 'skinId']); const skin = OFFICE_RELIEF_SKINS.find(item => item.id === value.skinId);
    if (value.skinId !== null && !skin) invalid();
    if (skin && !state.skins.includes(skin.id)) conflict('SKIN_NOT_OWNED');
    if (state.equippedSkin === value.skinId) conflict('SKIN_UNCHANGED');
    state.equippedSkin = skin?.id ?? null;
    outcome = { id, at, kind: 'equip', tokenDelta: 0, ...(skin ? { itemId: skin.id } : {}), message: skin ? `已装备「${skin.name}」纯外观。` : '已切回默认外观。' };
  } else if (value.kind === 'claim') {
    object(raw, ['kind', 'dropId']); const dropId = uuid(value.dropId);
    const index = state.pending.findIndex(item => item.id === dropId);
    if (index < 0) conflict('DROP_NOT_FOUND');
    [claimedDrop] = state.pending.splice(index, 1);
    const item = dropDefinition(claimedDrop.kind, claimedDrop.itemId)!;
    const message = claimedDrop.kind === 'farm_crop'
      ? `已领取${item.name}×${claimedDrop.quantity}，增加${RULES.farmExperiencePerGift}种植经验并按既有曲线更新等级；不发办公币、不自动收获或更换作物。`
      : claimedDrop.kind === 'tower_book'
        ? claimedDrop.itemId === 'weapon_manual'
          ? `已领取${item.name}，为当前主手武器暂存${claimedDrop.quantity}品质经验，不直接升星或升品质。`
          : `已领取${item.name}，增加${claimedDrop.quantity}技能碎片。`
        : `已领取${item.name}×${claimedDrop.quantity}，以对应模块的同事务授予结果为准。`;
    outcome = { id, at, kind: 'claim', tokenDelta: 0, itemId: claimedDrop.itemId, dropId: claimedDrop.id, message };
  } else invalid();
  state.version++; state.history.push(outcome); state.history = state.history.slice(-RULES.historyLimit); state.lastResult = copy(outcome);
  return { state, outcome: copy(outcome), ...(claimedDrop ? { claimedDrop: copy(claimedDrop) } : {}) };
}
