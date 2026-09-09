import type { DemonTowerActionInput, DemonTowerActionReceipt, DemonTowerAutoResponse, DemonTowerAutoStartInput, DemonTowerCatalog, DemonTowerContributions, DemonTowerLeaderboard, DemonTowerOverview, DemonTowerSocialView } from '@stealth-reader/shared';

import { CommunityApiError, communityHttp, getCommunityAccessToken } from './community-http';

const ROOT = '/v1/games/demon-tower';

export const communityDemonTowerApi = {
  catalog: (signal?: AbortSignal): Promise<DemonTowerCatalog> => communityHttp.get(`${ROOT}/catalog`, { auth: false, signal }),
  overview: (signal?: AbortSignal): Promise<DemonTowerOverview> => communityHttp.get(`${ROOT}/overview`, { signal }),
  social: (signal?: AbortSignal): Promise<DemonTowerSocialView> => communityHttp.get(`${ROOT}/social`, { signal }),
  action: (input: DemonTowerActionInput, signal?: AbortSignal): Promise<DemonTowerActionReceipt> => communityHttp.post(`${ROOT}/actions`, input, { retryAfterRefresh: false, signal }),
  auto: (signal?: AbortSignal): Promise<DemonTowerAutoResponse> => communityHttp.get(`${ROOT}/auto-explore`, { signal }),
  autoStart: (input: DemonTowerAutoStartInput, signal?: AbortSignal): Promise<DemonTowerAutoResponse> => communityHttp.post(`${ROOT}/auto-explore`, input, { retryAfterRefresh: false, signal }),
  autoStop: (id: string, signal?: AbortSignal): Promise<DemonTowerAutoResponse> => communityHttp.post(`${ROOT}/auto-explore/${encodeURIComponent(id)}/stop`, {}, { retryAfterRefresh: false, signal }),
  leaderboard: (date?: string, signal?: AbortSignal): Promise<DemonTowerLeaderboard> => communityHttp.get(`${ROOT}/leaderboard`, { auth: Boolean(getCommunityAccessToken()), query: { date }, signal }),
  contributions: (floor?: number, signal?: AbortSignal): Promise<DemonTowerContributions> => communityHttp.get(`${ROOT}/contributions`, { auth: Boolean(getCommunityAccessToken()), query: { floor }, signal }),
};

export function demonTowerErrorCode(error: unknown): string {
  return error instanceof CommunityApiError && error.body && typeof error.body === 'object' && 'code' in error.body ? String(error.body.code) : '';
}

const MESSAGES: Readonly<Record<string, string>> = {
  DEMON_TOWER_EXPANSION_DISABLED: '妖塔扩展正在维护，原有档案与资产保留。',
  DEMON_TOWER_EXPEDITION_DAILY_LIMIT: '今日该秘境任务次数已用完，明日北京时间重置。',
  DEMON_TOWER_EXPEDITION_WEEKLY_LIMIT: '本周周常挑战次数已用完，下周一北京时间重置。',
  DEMON_TOWER_LOOT_LEVEL_REQUIRED: '当前等级没有符合保底的物品；武器箱需Lv16，未扣材料。',
  DEMON_TOWER_NOT_ENOUGH_SKILL_PAGES: '技能残页不足30张，可通过灵气点、秘境或技能箱收集。',
  DEMON_TOWER_NOT_ENOUGH_QUALITY_EXPERIENCE: '没有可兑换的暂存品质经验，已兑现的强化不能兑换。',
  DEMON_TOWER_ALL_ELIGIBLE_SKILLS_OWNED: '当前等级可学习的技能已集齐，悟性丹没有扣除材料。',
  DEMON_TOWER_STAR_MAXIMUM: '已经达到5星，继续保留现有品质。',
  DEMON_TOWER_BREAKTHROUGH_LEVEL_REQUIRED: '下一品质突破需要更高境界：灵Lv31、仙Lv46、神Lv61。',
  DEMON_TOWER_BREAKTHROUGH_QUALITY_REQUIRED: '突破前需要当前武器至少+5，请先培养品质。',
  DEMON_TOWER_BREAKTHROUGH_MAXIMUM: '已达到神级品质，无需再次突破。',
  DEMON_TOWER_BOSS_LOOT_CLAIMED: '本层首杀贡献奖励已领取，不能重复领取。',
  DEMON_TOWER_BOSS_CONTRIBUTION_REQUIRED: '需要本层首领已击败，且账号曾造成有效首领伤害。',
  DEMON_TOWER_ARENA_ENROLL_REQUIRED: '请先自愿加入论道池，段位和SP将绑定你的档案。',
  DEMON_TOWER_ARENA_SP_REQUIRED: 'SP不足，完成每日论道和首胜可以继续积累。',
  DEMON_TOWER_ARENA_PREREQUISITE_REQUIRED: '需要先领悟同一技能树的上一招。',
  DEMON_TOWER_ARENA_SKILL_OWNED: '已领悟此技能，不会再次扣除SP。',
  DEMON_TOWER_ARENA_HONOR_REQUIRED: '荣誉不足，可完成免费论道积累。',
  DEMON_TOWER_INVALID_ARENA_LOADOUT: '论道最多装配1终极、2主动、1被动，只能装已领悟技能。',
  DEMON_TOWER_ARENA_OPPONENT_UNAVAILABLE: '对手已退出论道池或账号状态变化，请刷新对手列表。',
  DEMON_TOWER_INVALID_ARENA_OPPONENT: '请选择另一位公开加入论道的玩家。',
  DEMON_TOWER_ARENA_OPPONENT_ALREADY_CHALLENGED: '今天已与这位玩家切磋，请选另一位，避免重复刷取。',
  DEMON_TOWER_ARENA_DAILY_LIMIT: '今日5次论道已完成，明天可以继续。',
  DEMON_TOWER_SQUAD_ALREADY_JOINED: '你已有小队，请先处理完奖励并离队。',
  DEMON_TOWER_SQUAD_CREATE_LIMIT: '24小时内最多创建5个小队，可以加入其他公开队伍。',
  DEMON_TOWER_SQUAD_UNAVAILABLE: '小队已满、开战或过期，请刷新后选择。',
  DEMON_TOWER_SQUAD_NOT_JOINED: '你不在该小队中，请同步队伍状态。',
  DEMON_TOWER_SQUAD_NOT_FOUND: '小队已失效，可使用离队清除关联。',
  DEMON_TOWER_SQUAD_NOT_READY: '队伍状态已变化或你已经准备，请同步。',
  DEMON_TOWER_SQUAD_DAILY_LIMIT: '今日3次小队准备次数已用完，明天再参与。',
  DEMON_TOWER_SQUAD_NOT_ACTIVE: '尚未全员准备，或本次队伍挑战已经结束。',
  DEMON_TOWER_SQUAD_BATTLE_IN_PROGRESS: '小队挑战进行中，先推进至结束或等待过期再离队。',
  DEMON_TOWER_SQUAD_CLAIM_FIRST: '请先领取你的胜利奖励，再离开队伍。',
  DEMON_TOWER_SQUAD_REWARD_UNAVAILABLE: '未达胜利领奖条件或本场已领取。',
  DEMON_TOWER_AUTO_RUNNING: '服务器正在托管探索，请先停止并接回手动操作。',
  DEMON_TOWER_AUTO_DISABLED: '服务器托管探索暂未开放，仍可手动探索。',
  DEMON_TOWER_AUTO_VIP_REQUIRED: '托管探索需要有效 VIP 权益，手动探索不受影响。',
  VIP_REQUIRED: 'VIP 权益当前无效，仍可手动探索；不会自动续赠。',
  DEMON_TOWER_AUTO_IDEMPOTENCY_CONFLICT: '这次托管操作编号与内容不一致，请同步后重新设置。',
  DEMON_TOWER_AUTO_FLOOR_CHANGED: '探索区域已变化，本次没有启动，请同步后重新确认固定楼层。',
  DEMON_TOWER_AUTO_LOW_HEALTH: '生命未达到托管安全条件，请恢复后再启动。',
  DEMON_TOWER_AUTO_START_LIMIT: '本小时启动批次较多，请稍后再试。',
  DEMON_TOWER_AUTO_START_CANCELLED: '本批启动前账号、时间或服务状态发生变化，没有继续执行，请同步状态。',
  DEMON_TOWER_AUTO_NOT_FOUND: '未找到这批属于你的委托，请同步托管状态。',
  DEMON_TOWER_AUTO_REQUEST_INVALID: '委托参数无效，请检查次数和楼层后重新提交。',
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
  DEMON_TOWER_INVALID_INNATE: '请选择有效的心性主维。',
  DEMON_TOWER_INNATE_ALREADY_CHOSEN: '心性已确定，永久命格不能重复选择；请同步最新档案。',
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
  if (code === 'DEMON_TOWER_DISABLED' || code === 'DEMON_TOWER_AUTO_DISABLED' || code === 'COMMUNITY_WRITES_DISABLED') return false;
  return !(error instanceof CommunityApiError) || error.status === 0 || error.status >= 500;
}
