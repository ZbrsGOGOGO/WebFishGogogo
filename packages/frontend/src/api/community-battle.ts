import { CommunityApiError, communityHttp } from './community-http';
import { communityIdempotencyHeaders } from './community-idempotency';

const BATTLE_ROOT = '/v1/games/office-battle';

export type CommunityBattleProfession =
  | 'developer'
  | 'product'
  | 'qa'
  | 'sales'
  | 'hr';

export type CommunityBattleEquipmentSlot =
  | 'weapon'
  | 'head'
  | 'body'
  | 'badge'
  | 'shoes'
  | 'accessory';

export type CommunityBattleRarity =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'epic'
  | 'legendary';

export type CommunityBattleMode = 'pve' | 'pvp';

export interface CommunityBattleStats {
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  luck: number;
}

export interface CommunityBattleCatalog {
  engineVersion: string;
  balanceVersion: string;
  minClientVersion: string;
  energy: {
    max: number;
    costPerBattle: number;
    recoveryMinutes: number;
  };
  leveling?: {
    maxLevel: number;
    experienceRule: string;
    pveSkillPointRule: string;
    pvpSkillPointRule: string;
    rarityUnlocks: Array<{
      level: number;
      rarity: CommunityBattleRarity;
      label: string;
    }>;
  };
  modes?: Record<CommunityBattleMode, CommunityBattleModeDefinition>;
  inventoryLimit: number;
  rarityRates: Array<{
    rarity: CommunityBattleRarity;
    label: string;
    rate: number;
  }>;
  skills: {
    maxLevel: number;
    pointRule: string;
    coinCosts: number[];
    definitions: CommunityBattleSkillDefinition[];
  };
  enhancement: {
    maxLevel: number;
    coinCosts: number[];
    partCosts: number[];
    successRate: number;
  };
  capabilities: {
    enhancementEnabled: boolean;
    friendChallengesEnabled: boolean;
  };
}

export interface CommunityBattleSkillDefinition {
  id: string;
  profession: CommunityBattleProfession;
  mode: CommunityBattleMode;
  name: string;
  unlockLevel: number;
  description: string;
  bonusPerLevel: Partial<CommunityBattleStats>;
}

export interface CommunityBattleModeDefinition {
  label: string;
  opponentLabel: string;
  skillTrack: CommunityBattleMode;
  equipmentEnhancementPercent: number;
  dailyRewardLimit: number;
  friendAgeHours?: number;
  winReward: {
    battleExperience: number;
    workspaceCoins: number;
    equipmentDrop: boolean;
  };
  lossReward: {
    battleExperience: number;
    workspaceCoins: number;
    equipmentDrop: boolean;
  };
  rules: string[];
}

export interface CommunityBattleEnergy {
  current: number;
  max: number;
  serviceDate: string;
  resetsAt: string | null;
  nextRecoveryAt: string | null;
  recoveryMinutes: number;
}

export interface CommunityBattleProfile {
  publicId: string;
  displayName: string;
  profession: CommunityBattleProfession;
  battleLevel: number;
  totalBattleExperience: number;
  experienceInLevel: number;
  experienceToNextLevel: number | null;
  wins: number;
  losses: number;
  power: number;
  pvePower?: number;
  pvpPower?: number;
  stats: CommunityBattleStats;
  modeSnapshots?: Record<CommunityBattleMode, {
    power: number;
    stats: CommunityBattleStats;
    equipmentEnhancementPercent: number;
  }>;
  energy: CommunityBattleEnergy;
  workspaceCoins: number;
  parts: number;
  skillLevels: Record<string, number>;
  skillPointsEarned: number;
  skillPointsAvailable: number;
  skillPoints: {
    pve: { earned: number; available: number };
    pvp: { earned: number; available: number };
  };
  nextUnlock: { level: number; name: string; kind: 'skill' | 'rarity' } | null;
  profileVersion: number;
  loadoutVersion: number;
  inventoryVersion: number;
  defenseVersion: number;
  accountState: 'active' | 'suspended' | 'banned';
  restrictionReason?: string | null;
}

export interface CommunityBattleEquipment {
  id: string;
  name: string;
  slot: CommunityBattleEquipmentSlot;
  profession: CommunityBattleProfession;
  requiredLevel: number;
  equipmentLevel: number;
  rarity: CommunityBattleRarity;
  stats: Partial<CommunityBattleStats>;
  score: number;
  locked: boolean;
  equipped: boolean;
  enhancementLevel: number;
  canSalvage: boolean;
}

export interface CommunityBattleLoadout {
  equipment: CommunityBattleEquipment[];
  version: number;
}

export interface CommunityBattleRewardPreview {
  battleExperience: number;
  workspaceExperience: number;
  workspaceCoins: number;
  dropEligible: boolean;
  note?: string | null;
}

export type CommunityBattleOfferTier = 'simple' | 'balanced' | 'challenge';

export interface CommunityBattleOpponentSummary {
  publicId: string;
  displayName: string;
  profession: CommunityBattleProfession;
  battleLevel: number;
  power: number;
}

export interface CommunityBattleOffer {
  offerId: string;
  tier: CommunityBattleOfferTier;
  expiresAt: string;
  opponent: CommunityBattleOpponentSummary;
  powerDifferencePercent: number;
  rewardPreview: CommunityBattleRewardPreview;
}

export interface CommunityBattleDailyActions {
  rewardedBattlesUsed: number;
  rewardedBattlesLimit: number;
  rewardedFriendBattlesUsed: number;
  rewardedFriendBattlesLimit: number;
}

export interface CommunityBattlePendingReward {
  id: string;
  battleId: string;
  equipment: CommunityBattleEquipment;
  expiresAt?: string | null;
}

export interface CommunityBattleFriendCandidate {
  publicId: string;
  displayName: string;
  profession: CommunityBattleProfession;
  battleLevel: number;
  eligibleForReward: boolean;
  requiresPracticeConfirmation: boolean;
  reason?: string | null;
}

export interface CommunityBattleBootstrap {
  serverTime: string;
  clientCompatibility: {
    status: 'current' | 'upgrade_required';
    minClientVersion: string;
    message?: string | null;
  };
  catalog: CommunityBattleCatalog;
  profile: CommunityBattleProfile | null;
  loadout: CommunityBattleLoadout | null;
  defense: CommunityBattleDefenseConfiguration | null;
  offers: CommunityBattleOffer[];
  offersExpireAt?: string | null;
  dailyActions: CommunityBattleDailyActions | null;
  pendingRewards: CommunityBattlePendingReward[];
  friendCandidates: CommunityBattleFriendCandidate[];
}

export interface CommunityBattleInventoryPage {
  items: CommunityBattleEquipment[];
  nextCursor?: string | null;
  total: number;
  limit: number;
  inventoryVersion: number;
  loadout: CommunityBattleLoadout;
  parts: number;
}

export interface CommunityBattleFighterSnapshot {
  publicId: string;
  displayName: string;
  profession: CommunityBattleProfession;
  battleLevel: number;
  power: number;
  stats: CommunityBattleStats;
  equipment: CommunityBattleEquipment[] | null;
}

export type CommunityBattleEventKind =
  | 'round_start'
  | 'attack'
  | 'critical'
  | 'heal'
  | 'dodge'
  | 'effect'
  | 'battle_end';

/**
 * 事件中的伤害、治疗、剩余生命和叙事都由服务端生成。播放器只按 sequence 展示，
 * 不得用 seed 或快照在浏览器重算胜负。
 */
export interface CommunityBattleEvent {
  sequence: number;
  round: number;
  actor: 'player' | 'opponent' | 'system';
  kind: CommunityBattleEventKind;
  damage?: number | null;
  healing?: number | null;
  playerHp: number;
  opponentHp: number;
  message: string;
}

export interface CommunityBattleSettlementReward {
  battleExperience: number;
  workspaceExperience: number;
  workspaceCoins: number;
  parts: number;
  droppedEquipment: CommunityBattleEquipment | null;
  pendingRewardId?: string | null;
}

export interface CommunityBattleSettlement {
  battleId: string;
  battleRequestId: string;
  status: 'completed';
  mode: 'reward' | 'practice';
  opponentKind: 'npc' | 'friend';
  completedAt: string;
  engineVersion: string;
  balanceVersion: string;
  seed: string;
  winner: 'player' | 'opponent';
  player: CommunityBattleFighterSnapshot;
  opponent: CommunityBattleFighterSnapshot;
  events: CommunityBattleEvent[];
  reward: CommunityBattleSettlementReward;
  energy: CommunityBattleEnergy;
  profileVersion: number;
  loadoutVersion: number;
  inventoryVersion: number;
}

export interface CommunityBattleHistoryItem {
  battleId: string;
  battleRequestId: string;
  mode: 'reward' | 'practice';
  opponentKind: 'npc' | 'friend';
  opponent: CommunityBattleOpponentSummary;
  winner: 'player' | 'opponent';
  completedAt: string;
  rewardSummary: string;
}

export interface CommunityBattleHistoryPage {
  items: CommunityBattleHistoryItem[];
  nextCursor?: string | null;
}

export interface CommunityBattlePublicRecord {
  publicId: string;
  displayName: string;
  profession: CommunityBattleProfession;
  visibility: 'public' | 'friends' | 'private';
  battleLevel: number | null;
  wins: number | null;
  losses: number | null;
  equipment: CommunityBattleEquipment[] | null;
  recentBattles: Array<{
    battleId: string;
    result: 'win' | 'loss';
    completedAt: string;
  }> | null;
}

export interface CommunityBattleDefenseConfiguration {
  equipmentIds: string[];
  challengeVisibility: 'friends' | 'none';
  equipmentVisibility: 'public' | 'friends' | 'private';
  version: number;
}

export interface CommunityBattleMutationResult {
  profile: CommunityBattleProfile;
  loadout?: CommunityBattleLoadout;
  inventoryVersion: number;
  changedEquipment?: CommunityBattleEquipment | null;
}

export interface CommunityBattleLeaderboard {
  mode: 'pve' | 'pvp';
  profession: CommunityBattleProfession | 'all';
  formulaVersion: string;
  updatedAt: string;
  items: Array<{
    rank: number;
    publicId: string;
    displayName: string;
    profession: CommunityBattleProfession;
    battleLevel: number;
    power: number;
    wins: number;
    losses: number;
  }>;
}

export interface CommunityBattleRequest {
  battleRequestId: string;
  opponent:
    | { kind: 'npc'; offerId: string }
    | { kind: 'friend'; publicId: string };
  mode: 'reward' | 'practice';
  loadoutVersion: number;
}

function idempotentWriteOptions(idempotencyKey: string) {
  return {
    headers: communityIdempotencyHeaders(idempotencyKey),
    // 即使写请求带幂等键，也由业务层在超时后先按 requestId 查单，再决定是否重发。
    retryAfterRefresh: false,
  } as const;
}

export function getCommunityBattleCatalog(): Promise<CommunityBattleCatalog> {
  return communityHttp.get(`${BATTLE_ROOT}/catalog`);
}

export function getCommunityBattleBootstrap(): Promise<CommunityBattleBootstrap> {
  return communityHttp.get(`${BATTLE_ROOT}/bootstrap`);
}

export function getCommunityBattleLeaderboard(
  mode: 'pve' | 'pvp',
  profession: CommunityBattleProfession | 'all',
): Promise<CommunityBattleLeaderboard> {
  return communityHttp.get(`${BATTLE_ROOT}/leaderboard`, {
    query: { mode, profession, limit: 50 },
  });
}

export function chooseCommunityBattleProfession(
  profession: CommunityBattleProfession,
  expectedVersion: number | null,
  idempotencyKey: string,
): Promise<CommunityBattleBootstrap> {
  return communityHttp.put(
    `${BATTLE_ROOT}/profile/class`,
    { profession, expectedVersion },
    idempotentWriteOptions(idempotencyKey),
  );
}

export function getCommunityBattleInventory(
  cursor?: string,
): Promise<CommunityBattleInventoryPage> {
  return communityHttp.get(`${BATTLE_ROOT}/equipment`, { query: { cursor } });
}

export function updateCommunityBattleLoadout(
  equipmentIds: string[],
  expectedVersion: number,
  idempotencyKey: string,
): Promise<CommunityBattleMutationResult> {
  return communityHttp.put(
    `${BATTLE_ROOT}/loadout`,
    { equipmentIds, expectedVersion },
    idempotentWriteOptions(idempotencyKey),
  );
}

export function updateCommunityBattleDefense(
  configuration: Omit<CommunityBattleDefenseConfiguration, 'version'>,
  expectedVersion: number,
  idempotencyKey: string,
): Promise<CommunityBattleDefenseConfiguration> {
  return communityHttp.put(
    `${BATTLE_ROOT}/defense-loadout`,
    { ...configuration, expectedVersion },
    idempotentWriteOptions(idempotencyKey),
  );
}

export function setCommunityBattleEquipmentLock(
  equipmentId: string,
  locked: boolean,
  expectedInventoryVersion: number,
  idempotencyKey: string,
): Promise<CommunityBattleMutationResult> {
  return communityHttp.put(
    `${BATTLE_ROOT}/equipment/${encodeURIComponent(equipmentId)}/lock`,
    { locked, expectedInventoryVersion },
    idempotentWriteOptions(idempotencyKey),
  );
}

export function salvageCommunityBattleEquipment(
  equipmentIds: string[],
  expectedInventoryVersion: number,
  idempotencyKey: string,
): Promise<CommunityBattleMutationResult & { partsGranted: number }> {
  return communityHttp.post(
    `${BATTLE_ROOT}/equipment/salvage`,
    { equipmentIds, expectedInventoryVersion },
    idempotentWriteOptions(idempotencyKey),
  );
}

/**
 * 只有 catalog.capabilities.enhancementEnabled=true 时调用。首版不得在前端模拟
 * 成本、成功率或强化结果；服务端若未开放会返回明确的能力关闭错误。
 */
export function enhanceCommunityBattleEquipment(
  equipmentId: string,
  expectedInventoryVersion: number,
  idempotencyKey: string,
): Promise<CommunityBattleMutationResult & { partsSpent: number }> {
  return communityHttp.post(
    `${BATTLE_ROOT}/equipment/${encodeURIComponent(equipmentId)}/enhance`,
    { expectedInventoryVersion },
    idempotentWriteOptions(idempotencyKey),
  );
}

export function upgradeCommunityBattleSkill(
  skillId: string,
  expectedProfileVersion: number,
  idempotencyKey: string,
): Promise<CommunityBattleMutationResult> {
  return communityHttp.post(
    `${BATTLE_ROOT}/skills/${encodeURIComponent(skillId)}/upgrade`,
    { expectedProfileVersion },
    idempotentWriteOptions(idempotencyKey),
  );
}

export function claimCommunityBattleReward(
  rewardId: string,
  expectedInventoryVersion: number,
  idempotencyKey: string,
): Promise<CommunityBattleMutationResult> {
  return communityHttp.post(
    `${BATTLE_ROOT}/rewards/${encodeURIComponent(rewardId)}/claim`,
    { expectedInventoryVersion },
    idempotentWriteOptions(idempotencyKey),
  );
}

export function salvageCommunityBattleReward(
  rewardId: string,
  expectedInventoryVersion: number,
  idempotencyKey: string,
): Promise<CommunityBattleMutationResult & { partsGranted: number }> {
  return communityHttp.post(
    `${BATTLE_ROOT}/rewards/${encodeURIComponent(rewardId)}/salvage`,
    { expectedInventoryVersion },
    idempotentWriteOptions(idempotencyKey),
  );
}

export function createCommunityBattle(
  request: CommunityBattleRequest,
): Promise<CommunityBattleSettlement> {
  return communityHttp.post(
    `${BATTLE_ROOT}/battles`,
    request,
    idempotentWriteOptions(request.battleRequestId),
  );
}

export function createCommunityFriendBattle(
  request: CommunityBattleRequest & {
    opponent: { kind: 'friend'; publicId: string };
  },
): Promise<CommunityBattleSettlement> {
  return communityHttp.post(
    `${BATTLE_ROOT}/friends/${encodeURIComponent(request.opponent.publicId)}/challenges`,
    {
      battleRequestId: request.battleRequestId,
      mode: request.mode,
      loadoutVersion: request.loadoutVersion,
    },
    idempotentWriteOptions(request.battleRequestId),
  );
}

export function getCommunityBattleByRequest(
  battleRequestId: string,
): Promise<CommunityBattleSettlement> {
  return communityHttp.get(
    `${BATTLE_ROOT}/battles/by-request/${encodeURIComponent(battleRequestId)}`,
  );
}

export function getCommunityBattle(
  battleId: string,
): Promise<CommunityBattleSettlement> {
  return communityHttp.get(`${BATTLE_ROOT}/battles/${encodeURIComponent(battleId)}`);
}

export function getCommunityBattleHistory(
  cursor?: string,
): Promise<CommunityBattleHistoryPage> {
  return communityHttp.get(`${BATTLE_ROOT}/battles`, { query: { cursor } });
}

export function getCommunityBattlePublicRecord(
  publicId: string,
): Promise<CommunityBattlePublicRecord> {
  return communityHttp.get(
    `${BATTLE_ROOT}/public/users/${encodeURIComponent(publicId)}/record`,
  );
}

function errorCode(error: CommunityApiError): string | undefined {
  if (!error.body || typeof error.body !== 'object' || !('code' in error.body)) {
    return undefined;
  }
  const code = (error.body as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

export function communityBattleErrorMessage(error: unknown): string {
  if (!(error instanceof CommunityApiError)) {
    return error instanceof Error && error.message
      ? error.message
      : '办公室乐斗请求失败，请稍后重试';
  }

  switch (errorCode(error)) {
    case 'BATTLE_ENERGY_INSUFFICIENT':
    case 'ENERGY_INSUFFICIENT':
      return '今日正式行动体力不足，可以改为零消耗、零奖励的练习赛';
    case 'BATTLE_EQUIPMENT_CONFLICT':
    case 'EQUIPMENT_CONFLICT':
      return '装备配置已变化，本次行动未开始，请刷新正式档案后重试';
    case 'BATTLE_CLIENT_OUTDATED':
    case 'CLIENT_OUTDATED':
      return '当前网页版本过旧，已停止发起新对战；历史记录仍可查看';
    case 'ACCOUNT_BANNED':
      return '该正式档案已被封禁，不能发起对战或变更资产';
    case 'ACCOUNT_SUSPENDED':
      return '该正式档案当前受限，暂时不能进行这项操作';
    case 'OFFER_EXPIRED':
      return '对手候选已过期，本次未扣除体力，请刷新候选';
    case 'INVENTORY_FULL':
      return '装备仓库已满，掉落已进入待领取区，请先分解或整理装备';
    case 'VERSION_CONFLICT':
    case 'STALE_VERSION':
      return '正式档案版本已经变化，请刷新后再操作';
    case 'DEFENSE_PRIVACY_CLOSED':
      return '对方关闭了好友挑战';
    case 'FRIEND_CHALLENGE_BLOCKED':
      return '当前关系状态不允许发起好友挑战';
    case 'ENHANCEMENT_DISABLED':
      return '熟练强化尚未在当前服务端版本开放';
    case 'PARTS_INSUFFICIENT':
      return '零件不足，先分解不用的装备再强化';
    case 'EQUIPMENT_MAX_ENHANCEMENT':
      return '这件装备已经达到当前最高强化等级';
    case 'BATTLE_SKILL_POINTS_INSUFFICIENT':
      return '当前没有可用技能点，继续乐斗升级后再来';
    case 'BATTLE_SKILL_LOCKED':
      return '该技能尚未达到解锁等级';
    default:
      if (error.status === 0) return '网络中断，正在按对战请求编号核验是否已经结算';
      if (error.status === 401) return '登录状态已失效，请重新登录后继续';
      if (error.status === 403) return '当前账号没有权限执行这项操作';
      if (error.status === 404) return '没有找到对应的正式档案或战斗记录';
      if (error.status === 409) return '正式档案状态已变化，请刷新后重试';
      if (error.status === 429) return '操作过于频繁，请稍后再试';
      return error.message || '办公室乐斗请求失败，请稍后重试';
  }
}

export const communityBattleApi = {
  getCatalog: getCommunityBattleCatalog,
  getBootstrap: getCommunityBattleBootstrap,
  getLeaderboard: getCommunityBattleLeaderboard,
  chooseProfession: chooseCommunityBattleProfession,
  getInventory: getCommunityBattleInventory,
  updateLoadout: updateCommunityBattleLoadout,
  updateDefense: updateCommunityBattleDefense,
  setEquipmentLock: setCommunityBattleEquipmentLock,
  salvageEquipment: salvageCommunityBattleEquipment,
  enhanceEquipment: enhanceCommunityBattleEquipment,
  upgradeSkill: upgradeCommunityBattleSkill,
  claimReward: claimCommunityBattleReward,
  salvageReward: salvageCommunityBattleReward,
  createBattle: createCommunityBattle,
  createFriendBattle: createCommunityFriendBattle,
  getBattleByRequest: getCommunityBattleByRequest,
  getBattle: getCommunityBattle,
  getHistory: getCommunityBattleHistory,
  getPublicRecord: getCommunityBattlePublicRecord,
};
