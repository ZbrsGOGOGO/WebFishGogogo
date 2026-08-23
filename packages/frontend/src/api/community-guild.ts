import { CommunityApiError, communityHttp } from './community-http';
import { communityIdempotencyHeaders } from './community-idempotency';

const GUILD_ROOT = '/v1/guilds';

export type CommunityGuildBuildingKey =
  | 'project_room'
  | 'training_room'
  | 'pantry'
  | 'showcase_wall';

export interface CommunityGuildOverview {
  serverTime: string;
  unlockLevel: number;
  unlocked: boolean;
  player: {
    level: number;
    officeCoins: number;
    energy: number;
    energyCapacity: number;
  };
  rules: {
    createCost: number;
    dailyEffectiveDonation: number;
    maxDonationPerRequest: number;
    boss: {
      unlockLevel: number;
      energyCost: number;
      dailyAttempts: number;
      reward: { officeCoins: number; experience: number; activity: number };
    };
    market: { status: 'observation'; minimumObservationDays: number };
  };
  membership: {
    guild: {
      id: string;
      name: string;
      level: number;
      treasury: number;
      memberCount: number;
      memberCapacity: number;
      version: number;
    };
    me: { role: 'owner' | 'member'; activity: number; donatedToday: number };
    buildings: Array<{
      key: CommunityGuildBuildingKey;
      name: string;
      description: string;
      level: number;
      maxLevel: number;
      nextCost: number;
    }>;
    members: Array<{
      publicId: string | null;
      displayName: string;
      role: 'owner' | 'member';
      activity: number;
      joinedAt: string;
    }>;
    boss: {
      serviceDate: string;
      bossName: string;
      status: 'ready' | 'active' | 'defeated';
      maxHp: number;
      remainingHp: number;
      endsAt: string;
      version: number;
      attempted: boolean;
      attemptsRemaining: number;
      canAttack: boolean;
      myContribution: { damage: number; criticalHit: boolean } | null;
      leaderboard: Array<{
        rank: number;
        publicId: string | null;
        displayName: string;
        damage: number;
        criticalHit: boolean;
      }>;
    };
  } | null;
  suggestions: Array<{
    id: string;
    name: string;
    level: number;
    memberCount: number;
    memberCapacity: number;
    treasury: number;
  }>;
  lastMutation: Record<string, unknown> | null;
}

function options(key: string) {
  return {
    headers: communityIdempotencyHeaders(key),
    retryAfterRefresh: false,
  };
}

export const communityGuildApi = {
  overview: (): Promise<CommunityGuildOverview> =>
    communityHttp.get(`${GUILD_ROOT}/me`),
  create: (name: string, key: string): Promise<CommunityGuildOverview> =>
    communityHttp.post(GUILD_ROOT, { name }, options(key)),
  join: (guildId: string, key: string): Promise<CommunityGuildOverview> =>
    communityHttp.post(`${GUILD_ROOT}/${encodeURIComponent(guildId)}/join`, undefined, options(key)),
  donate: (amount: number, key: string): Promise<CommunityGuildOverview> =>
    communityHttp.post(`${GUILD_ROOT}/me/donations`, { amount }, options(key)),
  upgradeBuilding: (
    buildingKey: CommunityGuildBuildingKey,
    key: string,
  ): Promise<CommunityGuildOverview> =>
    communityHttp.post(
      `${GUILD_ROOT}/me/buildings/${encodeURIComponent(buildingKey)}/upgrade`,
      undefined,
      options(key),
    ),
  attackBoss: (key: string): Promise<CommunityGuildOverview> =>
    communityHttp.post(`${GUILD_ROOT}/me/boss/attacks`, undefined, options(key)),
  leave: (): Promise<void> => communityHttp.delete(`${GUILD_ROOT}/me/membership`),
};

function code(error: CommunityApiError): string | undefined {
  if (!error.body || typeof error.body !== 'object' || !('code' in error.body)) return undefined;
  const value = (error.body as { code?: unknown }).code;
  return typeof value === 'string' ? value : undefined;
}

export function communityGuildErrorMessage(error: unknown): string {
  if (!(error instanceof CommunityApiError)) {
    return error instanceof Error ? error.message : '帮派请求失败，请稍后重试';
  }
  switch (code(error)) {
    case 'GUILD_LEVEL_LOCKED': return '职场等级达到 Lv.15 后才可创建或加入帮派';
    case 'GUILD_NAME_TAKEN': return '这个帮派名称已被使用';
    case 'GUILD_NAME_INVALID': return '帮派名称需为 2～16 个中英文、数字或常用连接符';
    case 'GUILD_MEMBERSHIP_EXISTS': return '你已经加入了一个帮派';
    case 'GUILD_MEMBER_CAPACITY_REACHED': return '这个帮派已经满员';
    case 'GUILD_TREASURY_INSUFFICIENT': return '帮派金库不足，暂时不能升级';
    case 'GUILD_OWNER_REQUIRED': return '只有帮派负责人可以进行建设升级';
    case 'GUILD_OWNER_CANNOT_LEAVE': return '负责人需要先完成后续转让流程，不能直接退出';
    case 'GUILD_BOSS_LEVEL_LOCKED': return '职场等级不足，暂时不能挑战帮派首领';
    case 'GUILD_BOSS_DAILY_ATTEMPT_USED': return '今天已经完成过帮派首领挑战，明天 05:00 重置';
    case 'GUILD_BOSS_ALREADY_DEFEATED': return '今天的帮派首领已经被击败';
    case 'INSUFFICIENT_ENERGY': return '体力不足，恢复后再来挑战';
    case 'INSUFFICIENT_WALLET_BALANCE': return '办公币不足';
    default: return error.message || '帮派请求失败，请稍后重试';
  }
}
