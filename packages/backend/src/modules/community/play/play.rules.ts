import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PLAY_DAILY_CHAMPION_COINS, PLAY_GAME_KEYS, PLAY_GAME_NAMES, type ArcadeGameKey, type PlayCatalog, type PlayPerson } from '@stealth-reader/shared';
import type { User } from '../../../database/entities/user.entity';

export const RANKING_RULES = '单机挑战与玩家房间共用该游戏的日榜，仅收录服务器结算的有效成绩；同分先达到者在前。退出、挂机零分和旧版自由练习不参加发奖。';
export const REWARD_RULES = '北京时间每日 00:05 结算前一日：每款游戏第一名获 100 办公币，每人每日六款合计最多 600；停机后补发，不重复发奖。';
export const PLAY_CATALOG: PlayCatalog = {
  games: PLAY_GAME_KEYS.map((gameKey) => ({
    gameKey, name: PLAY_GAME_NAMES[gameKey], minPlayers: gameKey === 'undercover' ? 3 : 2, maxPlayers: 8,
    soloDescription: gameKey === 'draw' || gameKey === 'undercover' ? '系统练习搭档，非真人玩家' : gameKey === 'zhesi' ? '独立短局试炼，不影响命格录原存档' : '限时个人挑战，服务器计分',
    roomDescription: gameKey === 'draw' ? '轮流作画、实时猜词' : gameKey === 'undercover' ? '描述线索、讨论投票、找出卧底' : gameKey === 'zhesi' ? '相同初始条件的回合试炼竞分' : '相同初始场景、独立棋盘的限时竞分',
    dailyChampionCoins: PLAY_DAILY_CHAMPION_COINS,
  })),
  rankingRules: RANKING_RULES, rewardRules: REWARD_RULES, settlementTime: 'Asia/Shanghai 00:05',
  historyNotice: '每日以北京时间 00:00 分榜，成绩归入服务器结算当日；便签遮罩不暂停房间计时。',
};
export function person(user: User): PlayPerson {
  return { publicId: user.publicId, username: user.username, displayName: (user.displayName || user.username || '同事').slice(0, 80) };
}
export function gameKey(value: unknown): ArcadeGameKey {
  if (typeof value !== 'string' || !PLAY_GAME_KEYS.includes(value as ArcadeGameKey)) throw new BadRequestException({ code: 'PLAY_GAME_INVALID' });
  return value as ArcadeGameKey;
}
export function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new BadRequestException({ code: 'PLAY_ID_INVALID' });
  return value.toLowerCase();
}
export function object(value: unknown, allowed?: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || (allowed && Object.keys(value).some((key) => !allowed.includes(key)))) throw new BadRequestException({ code: 'PLAY_REQUEST_INVALID' });
  return value as Record<string, unknown>;
}
export function hash(value: unknown): string {
  const canonical = (item: unknown): unknown => Array.isArray(item) ? item.map(canonical) : item && typeof item === 'object' ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)])) : item;
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
export function boundedPayload(payload: Record<string, unknown>): void {
  const pending: { value: unknown; depth: number }[] = [{ value: payload, depth: 0 }];
  let nodes = 0;
  while (pending.length) {
    const current = pending.pop()!;
    nodes += 1;
    if (nodes > 1200 || current.depth > 8) throw new BadRequestException({ code: 'PLAY_ACTION_TOO_LARGE' });
    if (current.value && typeof current.value === 'object') {
      for (const value of Object.values(current.value)) pending.push({ value, depth: current.depth + 1 });
    }
  }
  if (JSON.stringify(payload).length > 16_384) throw new BadRequestException({ code: 'PLAY_ACTION_TOO_LARGE' });
}
