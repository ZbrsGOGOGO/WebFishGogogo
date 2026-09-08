import { BadRequestException } from '@nestjs/common';
import { RAIL_DAILY_CHAMPION_COINS, type PlayPerson, type RailCatalog } from '@stealth-reader/shared';
import type { User } from '../../../database/entities/user.entity';

export const RAIL_RANKING_RULES = '按完整一局的生存率排名；自己的列车长轮不计分母，同生存率以最早达成者在前。只有开局至少 3 位真人且没有机器人、个人完成每轮必要操作并未退出的建房对局可入榜。练习、观战、代打与挂机不发奖。恶魔值只展示，不换取办公币。';
export const RAIL_REWARD_RULES = '北京时间每日 00:05 结算前一日，轨道难题日榜第一名获 100 办公币；停机后补发，同一天只发一次。成绩归入服务器实际结算当日。';
export const RAIL_CATALOG: RailCatalog = {
  gameKey: 'rail', name: '轨道难题', description: '轮流担任列车长，用善牌、恶牌和意外特性展开一场轻松的取舍讨论。',
  minPlayers: 3, maxPlayers: 9, maxBots: 8, maxSpectators: 20, dailyChampionCoins: RAIL_DAILY_CHAMPION_COINS,
  rewardRules: `${RAIL_RANKING_RULES} ${RAIL_REWARD_RULES}`,
  rules: '每人按座次当一次列车长，其余成员随机平衡分为 A/B 两队。每人从 3 善、3 恶、3 特性手牌中，放一善在己方、一恶在对方，再给任意未加特性的角色加一张特性牌。列车长选经过的轨道，另一队计一次生存。其余成员给列车长评 1–10 恶魔值，禁止自评。超时系统代打，真人超时评分记弃评；一局最长 29 分 15 秒。',
};
export function railPerson(user: User): PlayPerson {
  if (user.accountStatus === 'deleted' || user.accountStatus === 'deleting') return { publicId: user.publicId, username: null, displayName: '已注销同事' };
  return { publicId: user.publicId, username: user.username, displayName: (user.displayName || user.username || '同事').slice(0, 80) };
}
export function railUuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new BadRequestException({ code: 'RAIL_ID_INVALID' });
  return value.toLowerCase();
}
export function railObject(value: unknown, allowed?: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value) as object | null)) throw new BadRequestException({ code: 'RAIL_REQUEST_INVALID' });
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string' || (allowed && !allowed.includes(key)) || !('value' in Object.getOwnPropertyDescriptor(value, key)!))) throw new BadRequestException({ code: 'RAIL_REQUEST_INVALID' });
  return value as Record<string, unknown>;
}
export function railInteger(value: unknown, minimum: number, maximum: number, code = 'RAIL_REQUEST_INVALID'): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) throw new BadRequestException({ code });
  return Number(value);
}
