import type { DemonTowerActionInput, DemonTowerActionReceipt, DemonTowerCatalog, DemonTowerContributions, DemonTowerLeaderboard, DemonTowerOverview } from '@stealth-reader/shared';

import { CommunityApiError, communityHttp, getCommunityAccessToken } from './community-http';

const ROOT = '/v1/games/demon-tower';

export const communityDemonTowerApi = {
  catalog: (signal?: AbortSignal): Promise<DemonTowerCatalog> => communityHttp.get(`${ROOT}/catalog`, { auth: false, signal }),
  overview: (signal?: AbortSignal): Promise<DemonTowerOverview> => communityHttp.get(`${ROOT}/overview`, { signal }),
  action: (input: DemonTowerActionInput, signal?: AbortSignal): Promise<DemonTowerActionReceipt> => communityHttp.post(`${ROOT}/actions`, input, { retryAfterRefresh: false, signal }),
  leaderboard: (date?: string, signal?: AbortSignal): Promise<DemonTowerLeaderboard> => communityHttp.get(`${ROOT}/leaderboard`, { auth: Boolean(getCommunityAccessToken()), query: { date }, signal }),
  contributions: (floor?: number, signal?: AbortSignal): Promise<DemonTowerContributions> => communityHttp.get(`${ROOT}/contributions`, { auth: Boolean(getCommunityAccessToken()), query: { floor }, signal }),
};

export function demonTowerErrorCode(error: unknown): string {
  return error instanceof CommunityApiError && error.body && typeof error.body === 'object' && 'code' in error.body ? String(error.body.code) : '';
}

const MESSAGES: Readonly<Record<string, string>> = {
  DEMON_TOWER_ACTIVE_ACCOUNT_REQUIRED: '账号状态已变化，请重新登录有效账号。',
  DEMON_TOWER_ENROLL_REQUIRED: '请先建立寻道者档案，再开始探索。',
  DEMON_TOWER_NOT_ENOUGH_STAMINA: '体力暂时不足，会按服务器时间自动恢复。',
  DEMON_TOWER_REST_REQUIRED: '当前生命已耗尽，请先休整或等待战斗外恢复。',
  DEMON_TOWER_HEALTH_ALREADY_FULL: '生命已经恢复充足，无需消耗体力休整。',
  DEMON_TOWER_BATTLE_IN_PROGRESS: '请先完成或撤离当前探索战斗。',
  DEMON_TOWER_SKILL_NOT_READY: '这个技能仍在冷却或本场已使用，请选择其他行动。',
  DEMON_TOWER_PASSIVE_SKILL: '被动技能在装配后自动生效，不需要主动释放。',
  DEMON_TOWER_WEAPON_NOT_OWNED: '你尚未获得这件武器。',
  DEMON_TOWER_SKILL_NOT_OWNED: '你尚未获得这个技能。',
  DEMON_TOWER_WEAPON_LEVEL_REQUIRED: '当前等级未达到这件武器的装备要求。',
  DEMON_TOWER_SKILL_LEVEL_REQUIRED: '当前等级未达到这个技能的装配要求。',
  DEMON_TOWER_UPGRADE_LEVEL_REQUIRED: '当前等级未达到下一阶的要求，请先提升角色等级。',
  DEMON_TOWER_QUALITY_MAXIMUM: '已达到品质上限，剩余副本会保留。',
  DEMON_TOWER_NOT_ENOUGH_MATERIALS: '绑定材料不足，请先探索收集。',
  DEMON_TOWER_NOT_ENOUGH_ATTRIBUTE_POINTS: '可分配属性点不足，请同步最新成长档案。',
  DEMON_TOWER_ATTRIBUTES_UNCHANGED: '没有已分配的自由点，无需重置，也没有消耗操作额度。',
  DEMON_TOWER_ATTRIBUTE_RESET_COOLDOWN: '免费重置仍在冷却，请按人物档案中服务器确认的时间再试。',
  DEMON_TOWER_BOSS_DAILY_LIMIT: '今日首领协作次数已用完，明天可以继续参与。',
  DEMON_TOWER_DAILY_REWARD_CLAIMED: '今日活跃奖励已经领取，不会重复发放。',
  DEMON_TOWER_DAILY_REWARD_NOT_READY: '还未达到今日活跃目标，继续完成探索或修炼即可。',
  DEMON_TOWER_DAILY_ACTION_LIMIT: '今日妖塔行动已达到安全上限，请明天继续。',
  DEMON_TOWER_ACTION_RATE_LIMIT: '操作稍快，请等一会儿再试。',
  DEMON_TOWER_INVALID_DONATION: '每次建设请输入 1–1000 的整数数量。',
  DEMON_TOWER_INVALID_LOADOUT: '配装不符合槽位规则，请检查武器类型和技能数量。',
  DEMON_TOWER_DUPLICATE_EQUIPMENT: '同一件法器不能同时作为主手与辅助，请先移出其中一个槽位。',
  DEMON_TOWER_WORLD_FLOOR_CHANGED: '协作世界已推进到新楼层，这次操作没有消耗资源。请同步后确认新的行动目标，再重新提交。',
  DEMON_TOWER_DAY_CHANGED: '已跨过每日结算时间，本次行动没有消耗资源，请同步后重新提交。',
  DEMON_TOWER_LOADOUT_UNCHANGED: '配装与当前存档相同，没有重复保存或消耗行动额度。',
  DEMON_TOWER_FLOOR_UNCHANGED: '当前已经在这个探索区域，没有重复切换或消耗行动额度。',
  DEMON_TOWER_DISABLED: '九层妖塔暂未开放，请稍后再来。',
  COMMUNITY_WRITES_DISABLED: '当前处于维护只读状态，已有角色和进度仍可查看。',
  DEMON_TOWER_NOT_ENROLLED: '请先建立寻道者档案，再开始探索。',
  DEMON_TOWER_PROFILE_NOT_FOUND: '尚未建立寻道者档案，请刷新后创建。',
  DEMON_TOWER_ALREADY_ENROLLED: '你的角色已经建立，正在同步现有档案。',
  DEMON_TOWER_VERSION_CONFLICT: '角色状态刚刚发生变化，已请求同步。请查看最新状态后重新操作。',
  DEMON_TOWER_IDEMPOTENCY_CONFLICT: '这次操作的编号与内容不一致，请同步最新档案后重试。',
  DEMON_TOWER_STAMINA_LOW: '体力暂时不足，会按服务器时间自动恢复。',
  DEMON_TOWER_STAMINA_INSUFFICIENT: '体力暂时不足，会按服务器时间自动恢复。',
  DEMON_TOWER_HEALTH_LOW: '当前生命不足，请先休整或等待战斗外恢复。',
  DEMON_TOWER_HP_LOW: '当前生命不足，请先休整或等待战斗外恢复。',
  DEMON_TOWER_IN_BATTLE: '你还有一场探索战斗，请先完成或撤离。',
  DEMON_TOWER_BATTLE_ACTIVE: '请先处理当前战斗，再调整配装或进行其他任务。',
  DEMON_TOWER_NO_BATTLE: '这场战斗已经结束，正在同步最新战报。',
  DEMON_TOWER_INVALID_TARGET: '目标状态已变化，请重新选择仍存活的敌人。',
  DEMON_TOWER_SKILL_COOLDOWN: '该技能仍在冷却，请选择其他行动。',
  DEMON_TOWER_SKILL_UNAVAILABLE: '这个技能当前不可使用，请查看配装和冷却。',
  DEMON_TOWER_ITEM_NOT_OWNED: '你尚未获得这件物品。',
  DEMON_TOWER_LEVEL_REQUIRED: '当前等级未达到要求。',
  DEMON_TOWER_MATERIALS_INSUFFICIENT: '绑定材料不足，先探索收集，再进行升阶或建设。',
  DEMON_TOWER_MATERIAL_LOW: '绑定材料不足，先探索收集，再进行升阶或建设。',
  DEMON_TOWER_MAX_QUALITY: '这件物品已经达到品质上限，重复副本仍会保留。',
  DEMON_TOWER_FLOOR_LOCKED: '这层尚未解锁，需要世界进度和个人等级同时满足。',
  DEMON_TOWER_BOSS_UNAVAILABLE: '世界首领阶段已变化，请刷新协作进度。',
  DEMON_TOWER_BOSS_LIMIT: '今日世界首领参与次数已用完，明天还可以继续。',
  DEMON_TOWER_PASSAGE_UNAVAILABLE: '当前不在通道建设阶段，请刷新世界进度。',
  DEMON_TOWER_REWARD_NOT_READY: '还未达到今日活跃目标，继续完成探索或协作即可。',
  DEMON_TOWER_REWARD_CLAIMED: '今日活跃奖励已经领取，不会重复发放。',
  DEMON_TOWER_ACTION_LIMIT: '操作稍快，请等一会儿再试。',
  DEMON_TOWER_RATE_LIMIT: '操作稍快，请等一会儿再试。',
};

export function demonTowerErrorMessage(error: unknown): string {
  const code = demonTowerErrorCode(error);
  if (MESSAGES[code]) return MESSAGES[code];
  if (error instanceof CommunityApiError) {
    if (error.status === 401) return '登录已失效，请重新登录后同步角色。';
    if (error.status === 403) return '当前账号暂时无法进行此操作，请检查账号状态。';
    if (error.status === 429) return '请求较多，请稍候再试。';
    if (error.status === 0 || error.status >= 500) return '连接暂时不稳定，尚不能确定操作是否完成。';
    return '操作未完成，请同步最新状态后按页面提示重试。';
  }
  return '连接暂时中断，请检查网络后重试。';
}

export function demonTowerReadErrorMessage(error: unknown, hasPrevious = false): string {
  if (demonTowerOutcomeUncertain(error)) return hasPrevious
    ? '连接暂时中断，当前显示上次同步档案，请稍后同步。'
    : '连接暂时中断，尚未取得最新资料，请稍后同步。';
  return demonTowerErrorMessage(error);
}

/** A transport failure is not proof that the server rejected a mutation. */
export function demonTowerOutcomeUncertain(error: unknown): boolean {
  const code = demonTowerErrorCode(error);
  if (code === 'DEMON_TOWER_DISABLED' || code === 'COMMUNITY_WRITES_DISABLED') return false;
  return !(error instanceof CommunityApiError) || error.status === 0 || error.status >= 500;
}
