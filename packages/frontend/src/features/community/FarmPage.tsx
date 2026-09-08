import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';

import {
  communityFarmApi,
  createCommunityIdempotencyKey,
  type CommunityFarmOverview,
  type CommunityFarmCrop,
  type CommunityFarmSkill,
  type CommunityFarmTool,
} from '../../api/community';
import { useCommunityAuthStore } from '../../app/store/community-auth-store';
import {
  beginCommunityWalletObservation,
  finishCommunityWalletObservation,
  markCommunityWalletObservationFailed,
  publishCommunityWalletOverview,
  useCommunityWalletStore,
  type CommunityWalletObservation,
} from '../../app/store/community-wallet-store';
import { getCommunitySessionGeneration } from '../../api/community-http';
import { Button } from '../../components/ui';
import { communityFarmRemainingSeconds, formatCommunityFarmDuration } from './farm-countdown';
import { communityRequestErrorMessage } from './request-error';
import styles from './FarmPage.module.css';

const GUEST_FARM_KEY = 'zbrs.guest-farm.v1';
const GUEST_FIRST_CYCLE_SECONDS = 30;
const GUEST_STANDARD_CYCLE_SECONDS = 5 * 60;
const MATURITY_REFRESH_LIMIT = 3;
const GUEST_BASE_HARVEST_COINS = 20;
type FarmRequest = { version: number; wallet: CommunityWalletObservation | null };

const GUEST_CROPS: CommunityFarmOverview['crops'] = [
  { key: 'desk_mint', name: '工位薄荷', mark: '薄', unlockLevel: 1, durationSeconds: 300, experience: 12, seedCost: 10, seedCostPerPlot: 10, coins: 100, description: '成熟最快，适合刚开始经营。', unlocked: true, selected: true, growing: false },
  { key: 'meeting_tomato', name: '会议番茄', mark: '茄', unlockLevel: 3, durationSeconds: 1200, experience: 32, seedCost: 25, seedCostPerPlot: 25, coins: 100, description: '稳定产出，适合短时回来收获。', unlocked: false, selected: false, growing: false },
  { key: 'deadline_strawberry', name: '截止日草莓', mark: '莓', unlockLevel: 6, durationSeconds: 3600, experience: 70, seedCost: 60, seedCostPerPlot: 60, coins: 100, description: '经验与订单效率均衡。', unlocked: false, selected: false, growing: false },
  { key: 'overtime_coffee', name: '加班咖啡果', mark: '咖', unlockLevel: 10, durationSeconds: 7200, experience: 125, seedCost: 110, seedCostPerPlot: 110, coins: 100, description: '适合离线两小时后回来收获。', unlocked: false, selected: false, growing: false },
  { key: 'promotion_sunflower', name: '晋升向日葵', mark: '升', unlockLevel: 15, durationSeconds: 14400, experience: 230, seedCost: 180, seedCostPerPlot: 180, coins: 100, description: '中后期主力作物。', unlocked: false, selected: false, growing: false },
  { key: 'annual_moonflower', name: '年终月光花', mark: '年', unlockLevel: 22, durationSeconds: 28800, experience: 420, seedCost: 300, seedCostPerPlot: 300, coins: 100, description: '适合完整工作日的长周期作物。', unlocked: false, selected: false, growing: false },
];

const GUEST_TOOLS: CommunityFarmTool[] = [
  { id: 'watering_can', name: '定时浇水壶', slot: '浇水工具', description: '每级让成熟时间缩短 4%。', level: 0, maxLevel: 5, nextCost: 200 },
  { id: 'planter_box', name: '透气种植箱', slot: '种植容器', description: '每级让农场经验增加 8%。', level: 0, maxLevel: 5, nextCost: 200 },
  { id: 'harvest_basket', name: '分类收获篮', slot: '收获工具', description: '每级让订单办公币增加 10%。', level: 0, maxLevel: 5, nextCost: 200 },
];

const GUEST_SKILLS: CommunityFarmSkill[] = [
  { id: 'quick_care', name: '快速照料', unlockLevel: 2, description: '每级让成熟时间额外缩短 3%。', level: 0, maxLevel: 5, unlocked: false },
  { id: 'green_thumb', name: '绿手指', unlockLevel: 5, description: '每级让农场经验额外增加 5%。', level: 0, maxLevel: 5, unlocked: false },
  { id: 'abundant_harvest', name: '丰收心得', unlockLevel: 8, description: '每级让订单办公币额外增加 6%。', level: 0, maxLevel: 5, unlocked: false },
];

function createGuestFarm(): CommunityFarmOverview {
  return {
    serverTime: new Date().toISOString(),
    state: 'idle',
    plant: {
      name: '工位薄荷',
      appearanceKey: 'desk-mint',
      level: 1,
      experience: 0,
      experienceInLevel: 0,
      experienceToNextLevel: 40,
      careStreak: 0,
      cycleStartedAt: null,
      maturesAt: null,
      cycleSeconds: null,
      firstCycle: true,
    },
    growth: {
      farmCoins: 0,
      officeCoins: 0,
      totalHarvests: 0,
      farmVersion: 1,
      skillPointsEarned: 0,
      skillPointsAvailable: 0,
      nextUnlock: { level: 2, name: '快速照料', kind: 'skill' },
      plotCount: 1,
      maxPlotCount: 6,
      nextPlotUnlock: { level: 3, count: 2 },
      officeCoinLevelBonusPercent: 0,
      ordersCompleted: 0,
      ordersTotal: 3,
    },
    crops: GUEST_CROPS,
    tools: GUEST_TOOLS,
    skills: GUEST_SKILLS,
    standardCycleSeconds: GUEST_STANDARD_CYCLE_SECONDS,
    firstCycleSeconds: GUEST_FIRST_CYCLE_SECONDS,
    dailyRewardClaimed: false,
    encouragementAnimationEnabled: true,
    pendingEncouragements: 0,
  };
}

function persistGuestFarm(farm: CommunityFarmOverview): void {
  try {
    globalThis.localStorage?.setItem(GUEST_FARM_KEY, JSON.stringify(farm));
  } catch {
    // 禁用本地存储时，当前页面仍可继续试玩。
  }
}

function loadGuestFarm(): CommunityFarmOverview {
  let farm = createGuestFarm();
  try {
    const stored = globalThis.localStorage?.getItem(GUEST_FARM_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<CommunityFarmOverview>;
      farm = {
        ...farm,
        ...parsed,
        plant: { ...farm.plant, ...parsed.plant },
        growth: { ...farm.growth, ...parsed.growth },
        crops: parsed.crops?.length ? parsed.crops : farm.crops,
        tools: parsed.tools?.length ? parsed.tools : farm.tools,
        skills: parsed.skills?.length ? parsed.skills : farm.skills,
      };
    }
  } catch {
    // 存储损坏时回到一株新绿植。
  }
  const now = Date.now();
  if (farm.state === 'growing' && farm.plant.maturesAt && Date.parse(farm.plant.maturesAt) <= now) {
    farm = { ...farm, serverTime: new Date(now).toISOString(), state: 'ready' };
    persistGuestFarm(farm);
  }
  return farm;
}

function growthProgress(overview: CommunityFarmOverview, remainingSeconds: number | null): number {
  if (overview.state === 'ready') return 100;
  if (overview.state === 'idle') return 0;
  const cycleSeconds = overview.plant.cycleSeconds ?? overview.standardCycleSeconds;
  if (cycleSeconds <= 0) return 8;
  const remaining = remainingSeconds ?? cycleSeconds;
  return Math.min(99, Math.max(5, Math.round(((cycleSeconds - remaining) / cycleSeconds) * 100)));
}

function hasRevenueQuote(crop: CommunityFarmCrop | undefined): crop is CommunityFarmCrop & Required<Pick<CommunityFarmCrop,
  'baseHarvestCoins' | 'nextOrderBonusCoins' | 'totalHarvestCoins' | 'estimatedNetCoins'>> {
  return Boolean(crop && [crop.baseHarvestCoins, crop.nextOrderBonusCoins, crop.totalHarvestCoins].every(
    (value) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0,
  ) && Number.isSafeInteger(crop.estimatedNetCoins));
}

function signedCoins(value: number): string { return `${value >= 0 ? '+' : '−'}${Math.abs(value)}`; }

function FarmRevenueQuote({ crop, freeFirstCycle = false, current = false }: {
  crop: CommunityFarmCrop | undefined;
  freeFirstCycle?: boolean;
  current?: boolean;
}): JSX.Element {
  if (!hasRevenueQuote(crop)) return <p className={styles.quotePending}>收益报价待同步，刷新后查看基础收益与订单奖励；不以旧版数据估算。</p>;
  return <dl className={styles.revenueRows} aria-label={current ? '本轮预计收获收益' : '下一轮收益预算'}>
    <div><dt>每轮基础收益</dt><dd>+{crop.baseHarvestCoins} 办公币</dd></div>
    <div><dt>下次订单额外</dt><dd>+{crop.nextOrderBonusCoins} 办公币</dd></div>
    <div><dt>预计收获入账</dt><dd>+{crop.totalHarvestCoins} 办公币</dd></div>
    {!current ? <div className={styles.netRevenue}><dt>{freeFirstCycle ? '首轮免费预计净收益' : '扣种子后预计净收益'}</dt><dd>{signedCoins(freeFirstCycle ? crop.totalHarvestCoins : crop.estimatedNetCoins)} 办公币</dd></div> : null}
  </dl>;
}

export function CommunityFarmPage(): JSX.Element {
  const phase = useCommunityAuthStore((state) => state.phase);
  const userId = useCommunityAuthStore((state) => state.user?.publicId);
  const authenticated = phase !== 'bootstrapping' && phase !== 'guest';
  const walletState = useCommunityWalletStore();
  const [overview, setOverview] = useState<CommunityFarmOverview | null>(null);
  const [overviewOwner, setOverviewOwner] = useState('');
  const ownerKey = `${phase}:${userId ?? ''}:${getCommunitySessionGeneration()}`;
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [clientNowMs, setClientNowMs] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [growthBusy, setGrowthBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [maturityRefreshPaused, setMaturityRefreshPaused] = useState(false);
  const maturityRefresh = useRef({ maturesAt: '', attempts: 0, retryAt: 0 });
  const mounted = useRef(true);
  const requestInFlight = useRef(false);
  const requestVersion = useRef(0);
  const lastServerTime = useRef(Number.NEGATIVE_INFINITY);
  const resyncAfterMutation = useRef(false);

  const beginRequest = useCallback((kind: 'read' | 'mutation' = 'read'): FarmRequest | undefined => {
    if (!mounted.current || requestInFlight.current) return undefined;
    requestInFlight.current = true;
    requestVersion.current += 1;
    return { version: requestVersion.current, wallet: beginCommunityWalletObservation(kind) };
  }, []);

  const isCurrentRequest = useCallback((request: FarmRequest): boolean => {
    const auth = useCommunityAuthStore.getState();
    return mounted.current && request.version === requestVersion.current &&
      auth.phase === phase && auth.user?.publicId === userId;
  }, [phase, userId]);

  const applyOverview = useCallback((next: CommunityFarmOverview, wallet: CommunityWalletObservation | null = null): boolean => {
    const serverNow = Date.parse(next.serverTime);
    const cached = useCommunityWalletStore.getState();
    const walletTime = wallet && cached.ownerId === wallet.ownerId && cached.sessionGeneration === wallet.sessionGeneration && cached.serverTime
      ? Date.parse(cached.serverTime) : Number.NEGATIVE_INFINITY;
    // The header and the first farm read can race. Keep the first farm structure;
    // its displayed balance already comes from the newer shared wallet snapshot.
    const knownFarmTime = wallet?.kind === 'mutation' ? Math.max(lastServerTime.current, walletTime) : lastServerTime.current;
    if (wallet && serverNow < knownFarmTime) {
      markCommunityWalletObservationFailed(wallet);
      setError('收到较早的农场快照，已保留较新余额，请刷新状态重试。');
      if (wallet.kind === 'mutation') resyncAfterMutation.current = true;
      return false;
    }
    lastServerTime.current = serverNow;
    setOverview(next);
    setOverviewOwner(ownerKey);
    setServerOffsetMs(Number.isFinite(serverNow) ? serverNow - Date.now() : 0);
    setClientNowMs(Date.now());
    publishCommunityWalletOverview(wallet, next);
    return true;
  }, [ownerKey]);

  const load = useCallback(async (showLoading = true): Promise<void> => {
    const version = beginRequest();
    if (version === undefined) return;
    if (showLoading) setLoading(true);
    setRefreshing(true);
    setError(undefined);
    try {
      const next = authenticated ? await communityFarmApi.getOverview() : loadGuestFarm();
      if (isCurrentRequest(version)) applyOverview(next, version.wallet);
    } catch (requestError) {
      if (isCurrentRequest(version)) {
        markCommunityWalletObservationFailed(version.wallet);
        setError(communityRequestErrorMessage(requestError, '绿植暂时没有连接上，请稍后再试'));
      }
    } finally {
      if (isCurrentRequest(version)) {
        requestInFlight.current = false;
        setRefreshing(false);
        if (showLoading) setLoading(false);
      }
    }
  }, [applyOverview, authenticated, beginRequest, isCurrentRequest]);

  useEffect(() => {
    mounted.current = true;
    setOverview(null);
    lastServerTime.current = Number.NEGATIVE_INFINITY;
    resyncAfterMutation.current = false;
    setBusy(false);
    setGrowthBusy(undefined);
    setNotice(undefined);
    maturityRefresh.current = { maturesAt: '', attempts: 0, retryAt: 0 };
    setMaturityRefreshPaused(false);
    void load();
    return () => {
      mounted.current = false;
      requestVersion.current += 1;
      requestInFlight.current = false;
    };
  }, [load]);
  useEffect(() => {
    const interval = window.setInterval(() => setClientNowMs(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const remainingSeconds = useMemo(
    () => communityFarmRemainingSeconds(overview?.plant.maturesAt ?? null, serverOffsetMs, clientNowMs),
    [clientNowMs, overview?.plant.maturesAt, serverOffsetMs],
  );

  useEffect(() => {
    const maturesAt = overview?.plant.maturesAt;
    if (overview?.state !== 'growing' || !maturesAt) {
      maturityRefresh.current = { maturesAt: '', attempts: 0, retryAt: 0 };
      setMaturityRefreshPaused(false);
      return;
    }
    if (maturityRefresh.current.maturesAt !== maturesAt) {
      maturityRefresh.current = { maturesAt, attempts: 0, retryAt: 0 };
      setMaturityRefreshPaused(false);
    }
    const retry = maturityRefresh.current;
    if (remainingSeconds !== 0 || requestInFlight.current ||
      retry.attempts >= MATURITY_REFRESH_LIMIT || clientNowMs < retry.retryAt) return;
    retry.attempts += 1;
    retry.retryAt = clientNowMs + (retry.attempts === 1 ? 3000 : 8000);
    setMaturityRefreshPaused(retry.attempts >= MATURITY_REFRESH_LIMIT);
    void load(false);
  }, [clientNowMs, load, overview?.plant.maturesAt, overview?.state, remainingSeconds]);

  function refreshState(): void {
    if (requestInFlight.current) return;
    maturityRefresh.current = { maturesAt: '', attempts: 0, retryAt: 0 };
    setMaturityRefreshPaused(false);
    setNotice(undefined);
    void load(false);
  }

  async function mainAction(): Promise<void> {
    if (!overview || overview.state === 'growing') return;
    const version = beginRequest('mutation');
    if (version === undefined) return;
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      if (!authenticated) {
        const now = Date.now();
        const harvesting = overview.state === 'ready';
        const experience = overview.plant.experience + (harvesting ? 20 : 0);
        const level = Math.floor(experience / 100) + 1;
        const orderReward = [100, 120, 140][overview.growth.ordersCompleted] ?? 0;
        const nextOrdersCompleted = harvesting
          ? Math.min(3, overview.growth.ordersCompleted + 1)
          : overview.growth.ordersCompleted;
        const cycleSeconds = overview.plant.firstCycle
          ? GUEST_FIRST_CYCLE_SECONDS
          : GUEST_STANDARD_CYCLE_SECONDS;
        const next: CommunityFarmOverview = {
          ...overview,
          serverTime: new Date(now).toISOString(),
          state: 'growing',
          dailyRewardClaimed: nextOrdersCompleted >= 3,
          plant: {
            ...overview.plant,
            level,
            experience,
            experienceInLevel: experience % 100,
            experienceToNextLevel: 100,
            careStreak: overview.plant.careStreak + 1,
            cycleStartedAt: new Date(now).toISOString(),
            maturesAt: new Date(now + cycleSeconds * 1000).toISOString(),
            cycleSeconds,
            firstCycle: false,
          },
          growth: {
            ...overview.growth,
            farmCoins: 0,
            officeCoins:
              overview.growth.officeCoins + (harvesting ? GUEST_BASE_HARVEST_COINS + orderReward : 0),
            ordersCompleted: nextOrdersCompleted,
            totalHarvests: overview.growth.totalHarvests + (harvesting ? 1 : 0),
            farmVersion: overview.growth.farmVersion + 1,
          },
        };
        persistGuestFarm(next);
        applyOverview(next);
        setNotice(harvesting ? `试玩收获：成长经验 +20，基础试玩币 +${GUEST_BASE_HARVEST_COINS}${orderReward > 0 ? `，订单额外 +${orderReward}` : '，今日额外订单已完成'}。新一轮已开始，试玩余额不属于账号资产。` : '浇水完成！第一轮 30 秒后成熟。');
        return;
      }
      const key = createCommunityIdempotencyKey(`farm:${overview.state}`);
      const result = overview.state === 'idle'
        ? await communityFarmApi.care(key)
        : await communityFarmApi.harvestAndCare(key);
      if (!isCurrentRequest(version)) { publishCommunityWalletOverview(version.wallet, result.farm); return; }
      if (!applyOverview(result.farm, version.wallet)) return;
      if (overview.state === 'idle') {
        setNotice(result.farm.state === 'growing'
          ? '照料完成！绿植已经开始成长。'
          : '农场状态已同步，请查看当前成长状态。');
      } else {
        const reward = result.reward;
        const detailed = reward && [reward.baseCoins, reward.orderBonusCoins, reward.officeCoins].every((value) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0);
        const harvestSummary = reward?.summary?.trim() || (detailed
          ? `收获成功：基础收益 +${reward.baseCoins}，订单额外 +${reward.orderBonusCoins}，本次入账 +${reward.officeCoins} 办公币。${reward.farmExperience > 0 ? `农场经验 +${reward.farmExperience}。` : ''}续种处理后余额 ${result.farm.growth.officeCoins} 办公币。`
          : '收获成功！收益明细待同步，以实际余额为准。');
        setNotice(result.farm.state === 'idle'
          ? `${harvestSummary} 本次收获已保存，办公币不足以购买下一轮种子，尚未续种。请选择低成本作物或补充办公币后浇水。`
          : `${harvestSummary} 下一轮成长已经开始。`);
      }
    } catch (requestError) {
      markCommunityWalletObservationFailed(version.wallet);
      if (isCurrentRequest(version)) {
        setError(communityRequestErrorMessage(requestError, '这次操作没有成功，请再试一次'));
      }
    } finally {
      finishCommunityWalletObservation(version.wallet);
      if (isCurrentRequest(version)) {
        requestInFlight.current = false;
        setBusy(false);
        if (resyncAfterMutation.current) { resyncAfterMutation.current = false; void load(false); }
      }
    }
  }

  async function selectCrop(cropKey: string, cropName: string): Promise<void> {
    if (!authenticated || !overview) return;
    const version = beginRequest('mutation');
    if (version === undefined) return;
    setGrowthBusy(`crop:${cropKey}`);
    setError(undefined);
    try {
      const result = await communityFarmApi.selectCrop(
        cropKey,
        overview.growth.farmVersion,
        createCommunityIdempotencyKey('farm-crop'),
      );
      if (!isCurrentRequest(version)) { publishCommunityWalletOverview(version.wallet, result.farm); return; }
      if (!applyOverview(result.farm, version.wallet)) return;
      setNotice(`${cropName}已设为下一轮作物，当前成长不会被打断。`);
    } catch (requestError) {
      markCommunityWalletObservationFailed(version.wallet);
      if (isCurrentRequest(version)) setError(communityRequestErrorMessage(requestError, '作物选择没有保存，请刷新后再试'));
    } finally {
      finishCommunityWalletObservation(version.wallet);
      if (isCurrentRequest(version)) {
        requestInFlight.current = false;
        setGrowthBusy(undefined);
        if (resyncAfterMutation.current) { resyncAfterMutation.current = false; void load(false); }
      }
    }
  }

  async function upgradeTool(tool: CommunityFarmTool): Promise<void> {
    if (!authenticated || !overview) return;
    const version = beginRequest('mutation');
    if (version === undefined) return;
    setGrowthBusy(`tool:${tool.id}`);
    setError(undefined);
    try {
      const result = await communityFarmApi.upgradeTool(
        tool.id,
        overview.growth.farmVersion,
        createCommunityIdempotencyKey('farm-tool'),
      );
      if (!isCurrentRequest(version)) { publishCommunityWalletOverview(version.wallet, result.farm); return; }
      if (!applyOverview(result.farm, version.wallet)) return;
      setNotice(`${tool.name}已升到 Lv.${result.farm.tools.find((item) => item.id === tool.id)?.level ?? tool.level + 1}，消耗 ${result.cost} 办公币。`);
    } catch (requestError) {
      markCommunityWalletObservationFailed(version.wallet);
      if (isCurrentRequest(version)) setError(communityRequestErrorMessage(requestError, '工具升级没有成功，请确认办公币余额和档案状态'));
    } finally {
      finishCommunityWalletObservation(version.wallet);
      if (isCurrentRequest(version)) {
        requestInFlight.current = false;
        setGrowthBusy(undefined);
        if (resyncAfterMutation.current) { resyncAfterMutation.current = false; void load(false); }
      }
    }
  }

  async function upgradeSkill(skill: CommunityFarmSkill): Promise<void> {
    if (!authenticated || !overview) return;
    const version = beginRequest('mutation');
    if (version === undefined) return;
    setGrowthBusy(`skill:${skill.id}`);
    setError(undefined);
    try {
      const result = await communityFarmApi.upgradeSkill(
        skill.id,
        overview.growth.farmVersion,
        createCommunityIdempotencyKey('farm-skill'),
      );
      if (!isCurrentRequest(version)) { publishCommunityWalletOverview(version.wallet, result.farm); return; }
      if (!applyOverview(result.farm, version.wallet)) return;
      setNotice(`${skill.name}已升到 Lv.${result.farm.skills.find((item) => item.id === skill.id)?.level ?? skill.level + 1}。`);
    } catch (requestError) {
      markCommunityWalletObservationFailed(version.wallet);
      if (isCurrentRequest(version)) setError(communityRequestErrorMessage(requestError, '技能升级没有成功，请确认技能点和解锁等级'));
    } finally {
      finishCommunityWalletObservation(version.wallet);
      if (isCurrentRequest(version)) {
        requestInFlight.current = false;
        setGrowthBusy(undefined);
        if (resyncAfterMutation.current) { resyncAfterMutation.current = false; void load(false); }
      }
    }
  }

  if (loading || (overview && overviewOwner !== ownerKey)) {
    return <main className={styles.page}><div className={styles.loading} role="status"><span>☘</span><p>正在打开你的工位绿植…</p></div></main>;
  }

  if (!overview) {
    return <main className={styles.page}><div className={styles.failure}><h1>绿植暂时没连上</h1>{error ? <p role="alert">{error}</p> : null}<Button onClick={() => void load()}>重新加载</Button></div></main>;
  }

  const progress = growthProgress(overview, remainingSeconds);
  const ready = overview.state === 'ready';
  const idle = overview.state === 'idle';
  const operationBusy = busy || Boolean(growthBusy) || refreshing;
  const selectedCrop = overview.crops.find((crop) => crop.selected);
  const currentCrop = overview.crops.find((crop) => crop.growing) ?? overview.crops.find(
    (crop) => crop.key === overview.plant.appearanceKey || crop.name === overview.plant.name,
  );
  // Older servers reported firstCycle=true whenever there was no active cycle.
  const freeFirstCycle = idle && overview.plant.firstCycle && overview.growth.totalHarvests === 0;
  const seedCost = !authenticated || freeFirstCycle ? 0 : selectedCrop?.seedCost ?? 0;
  const walletMatches = authenticated && Boolean(userId) && walletState.ownerId === userId && walletState.sessionGeneration === getCommunitySessionGeneration();
  const visibleBalance = walletMatches && walletState.officeCoins !== null ? walletState.officeCoins : overview.growth.officeCoins;
  const balanceUnsynced = walletMatches && (walletState.status === 'stale' || walletState.status === 'error');
  const insufficientSeeds = authenticated && seedCost > visibleBalance;
  const affordableCrops = overview.crops.filter((crop) =>
    crop.unlocked && !crop.selected && crop.seedCost < seedCost && crop.seedCost <= visibleBalance,
  );
  const actionLabel = idle
    ? insufficientSeeds ? '办公币不足，请先选择低成本作物' : '浇水，开始成长'
    : ready ? '收获并尝试种下新一轮' : '正在成长';
  const statusLabel = idle ? '等待照料' : ready ? '已经成熟' : '成长中';
  const levelProgress = overview.plant.experienceToNextLevel
    ? Math.min(100, Math.round(overview.plant.experienceInLevel / overview.plant.experienceToNextLevel * 100))
    : 100;

  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <div><span>DESK FARM</span><h1>我的工位农场</h1><p>主流程仍然只点一次；想深入时，再选择作物、升级工具和技能。</p></div>
        <div className={styles.headerBadge}><b>{overview.plant.careStreak}</b><span>{authenticated ? '连续照料天数' : '游客照料次数'}</span></div>
      </header>

      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {notice ? <div className={styles.rewardToast} role="status"><span>✓</span><div><strong>操作成功</strong><p>{notice}</p></div></div> : null}

      <section className={styles.walletCard} aria-label={authenticated ? '农场办公币余额' : '本机试玩余额'} data-guest={!authenticated}>
        <div><span>{authenticated ? '我的办公币余额' : '游客 · 本机试玩币'}</span><strong>{visibleBalance.toLocaleString('zh-CN')}<small>{authenticated ? '办公币' : '试玩币'}</small></strong>{balanceUnsynced ? <small className={styles.balanceUnsynced}>余额待同步 · 当前显示上次确认值</small> : null}<p>{authenticated ? '与全站共用同一余额，用于种子和工具；操作后以服务器余额为准。' : '仅供当前浏览器体验，不是账号资产，登录不会转入真实余额。'}</p></div>
        <div className={styles.incomeRule}><strong>{authenticated ? '每次收获都有基础收益' : `每次试玩收获 +${GUEST_BASE_HARVEST_COINS} 基础试玩币`}</strong><span>今日额外订单 {overview.growth.ordersCompleted}/{overview.growth.ordersTotal}</span><small>{overview.growth.ordersCompleted >= overview.growth.ordersTotal ? '今日额外订单已完成，后续收获仍有基础收益。' : `每天前 ${overview.growth.ordersTotal} 次收获，另加订单奖励。`}</small></div>
      </section>

      <section className={styles.growthSummary} aria-label="农场成长摘要">
        <article><span>农场等级</span><strong>Lv.{overview.plant.level}</strong><small>{overview.plant.experience} 总经验</small></article>
        <article><span>已解锁地块</span><strong>{overview.growth.plotCount} 块</strong><small>统一种植与收获</small></article>
        <article><span>技能点</span><strong>{overview.growth.skillPointsAvailable}</strong><small>累计获得 {overview.growth.skillPointsEarned}</small></article>
        <article><span>下一解锁</span><strong>{overview.growth.nextUnlock ? `Lv.${overview.growth.nextUnlock.level}` : '已完成'}</strong><small>{overview.growth.nextUnlock?.name ?? '全部内容已开放'}</small></article>
        <div className={styles.farmLevelProgress}><span style={{ width: `${levelProgress}%` }} /></div>
      </section>

      <section className={styles.farmStage} data-state={overview.state}>
        <div className={styles.scene} aria-hidden="true">
          <div className={styles.sun} />
          <div className={styles.shelf}><i /><i /><i /></div>
          <div className={styles.plantVisual}>
            <span className={styles.sparkle}>✦</span>
            <div className={styles.leaves}><i /><i /><i /><i /><b /></div>
            <div className={styles.pot}><span /></div>
          </div>
          <div className={styles.table} />
        </div>

        <div className={styles.controlPanel}>
          <span className={styles.statePill}>{statusLabel}</span>
          <h2>{overview.plant.name}</h2>
          <p>Lv.{overview.plant.level} · 成长经验 {overview.plant.experience}</p>

          <div className={styles.progressBlock}>
            <div><span>本轮成长</span><strong>{progress}%</strong></div>
            <div className={styles.progressTrack}><i style={{ width: `${progress}%` }} /></div>
            <p aria-live="polite">
              {idle
                ? freeFirstCycle ? '首次浇水免费，开始第一轮成长' : '浇水会购买所选种子，开始新一轮成长'
                : ready
                  ? '已经长好，现在可以收获'
                  : remainingSeconds === 0
                    ? maturityRefreshPaused && !refreshing
                      ? '成熟状态尚未确认，请点击“刷新状态”重试。'
                      : '正在确认成熟状态…'
                    : `还有 ${formatCommunityFarmDuration(remainingSeconds)} 成熟`}
            </p>
          </div>

          {!idle && authenticated ? <section className={styles.currentRevenue} aria-label="本轮收获预估"><strong>本轮作物：{currentCrop?.name ?? overview.plant.name}</strong><FarmRevenueQuote crop={currentCrop} current /><p>按当前等级和地块估算，不代表历史实际种子费；订单按实际收获当天结算。</p></section> : null}

          <div className={styles.seedBudget} data-insufficient={insufficientSeeds} aria-label="下一轮种植预算">
            <strong>下一轮作物：{selectedCrop?.name ?? overview.plant.name}</strong>
            <p>{!authenticated
              ? '游客试玩免费，进度仅保存在当前浏览器。'
              : freeFirstCycle
                ? '首次种植免费；后续每轮会按已解锁地块购买种子。'
                : `${selectedCrop?.seedCostPerPlot ?? 0} 办公币/块 × ${overview.growth.plotCount} 块 = ${seedCost} 办公币`}</p>
            {authenticated ? <p>当前余额：{visibleBalance} 办公币{insufficientSeeds ? `，还差 ${seedCost - visibleBalance}。` : '。'}{balanceUnsynced ? '余额待同步，请刷新状态确认。' : ''}</p> : null}
            {authenticated ? <><FarmRevenueQuote crop={selectedCrop} freeFirstCycle={freeFirstCycle} /><p className={styles.quoteNote}>报价按当前等级、工具、技能、地块及今日剩余订单计算；跨日或升级后会更新。</p></> : null}
            {insufficientSeeds ? <p>
              {ready ? '仍可收获，收益会先到账；余额足够才会续种。' : '种子办公币不足，刷新不会增加余额。'}
              {affordableCrops.length
                ? ` 可在下方手动选择：${affordableCrops.map((crop) => `${crop.name}（${crop.seedCost} 办公币）`).join('、')}。`
                : ready ? ' 可先收获，到账后再按新余额判断是否续种。' : ' 当前没有买得起的已解锁作物，请补充办公币后再种植。'}
            </p> : ready && authenticated ? <p>收获后如解锁更多地块，续种费用会按新地块数计算；余额不足时仅收获、不续种。</p> : null}
          </div>
          <Button className={styles.mainAction} fullWidth loading={busy} disabled={operationBusy || (!idle && !ready) || (idle && insufficientSeeds)} onClick={() => void mainAction()}>
            {actionLabel}
          </Button>
          <Button className={styles.refreshAction} variant="secondary" fullWidth loading={refreshing} disabled={operationBusy} onClick={refreshState}>刷新状态</Button>
          <small className={styles.actionHint}>每轮都有基础收益；每日前 {overview.growth.ordersTotal} 次收获再领额外订单奖励。</small>
        </div>
      </section>

      <section className={styles.plotSection} aria-labelledby="farm-plots-title">
        <div className={styles.sectionHeading}>
          <div><span>PLOTS</span><h2 id="farm-plots-title">我的地块</h2></div>
          <small>{overview.growth.plotCount}/{overview.growth.maxPlotCount} 块 · 一键统一照料</small>
        </div>
        <div className={styles.plotGrid}>
          {Array.from({ length: overview.growth.maxPlotCount }, (_, index) => {
            const unlocked = index < overview.growth.plotCount;
            return (
              <article key={index} data-unlocked={unlocked}>
                <span>{unlocked ? overview.crops.find((crop) => crop.selected)?.mark ?? '苗' : '锁'}</span>
                <strong>{unlocked ? `地块 ${index + 1}` : '未解锁'}</strong>
              </article>
            );
          })}
        </div>
        <p className={styles.plotHint}>
          已解锁地块会同时种植、同时收获，不需要逐块点击；每块消耗一份种子并产出一份农场经验。
          {overview.growth.nextPlotUnlock
            ? ` Lv.${overview.growth.nextPlotUnlock.level} 解锁第 ${overview.growth.nextPlotUnlock.count} 块。`
            : ' 所有地块已经解锁。'}
        </p>
        <p className={styles.plotHint}>当前农场等级为基础收获和额外订单提供办公币 +{overview.growth.officeCoinLevelBonusPercent}% 加成。</p>
      </section>

      <section className={styles.growthSection} aria-labelledby="farm-crops-title">
        <div className={styles.sectionHeading}><div><span>CROPS</span><h2 id="farm-crops-title">选择下一轮作物</h2></div><small>切换不会中断当前成长</small></div>
        <div className={styles.cropGrid}>
          {overview.crops.map((crop) => (
            <article key={crop.key} data-selected={crop.selected} data-locked={!crop.unlocked}>
              <b>{crop.mark}</b>
              <div><strong>{crop.name}</strong><small>{crop.description}</small></div>
              <dl><div><dt>成熟</dt><dd>{formatCommunityFarmDuration(crop.durationSeconds)}</dd></div><div><dt>总成本</dt><dd>{crop.seedCost} 办公币</dd></div><div><dt>总经验</dt><dd>{crop.experience}</dd></div></dl>
              {authenticated ? <div className={styles.cropRevenue}><FarmRevenueQuote crop={crop} /></div> : <p className={styles.guestCropHint}>登录后读取真实账号的成本与收益报价。</p>}
              <Button
                variant={crop.selected ? 'secondary' : 'primary'}
                loading={growthBusy === `crop:${crop.key}`}
                disabled={!authenticated || !crop.unlocked || crop.selected || operationBusy}
                onClick={() => void selectCrop(crop.key, crop.name)}
              >
                {!authenticated ? '登录后选择' : !crop.unlocked ? `Lv.${crop.unlockLevel} 解锁` : crop.selected ? '下一轮已选' : '设为下一轮'}
              </Button>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.upgradeGrid}>
        <div className={styles.growthSection}>
          <div className={styles.sectionHeading}><div><span>TOOLS</span><h2>三件农场工具</h2></div><small>最高 Lv.5</small></div>
          <div className={styles.upgradeList}>
            {overview.tools.map((tool) => {
              const maxed = tool.level >= tool.maxLevel;
              return <article key={tool.id}><div><span>{tool.slot}</span><strong>{tool.name}</strong><small>{tool.description}</small></div><b>Lv.{tool.level}</b><Button variant="secondary" loading={growthBusy === `tool:${tool.id}`} disabled={!authenticated || maxed || visibleBalance < tool.nextCost || operationBusy} onClick={() => void upgradeTool(tool)}>{!authenticated ? '登录后升级' : maxed ? '已满级' : `${tool.nextCost} 办公币升级`}</Button></article>;
            })}
          </div>
        </div>
        <div className={styles.growthSection}>
          <div className={styles.sectionHeading}><div><span>SKILLS</span><h2>三条农场技能</h2></div><small>可用 {overview.growth.skillPointsAvailable} 点</small></div>
          <div className={styles.upgradeList}>
            {overview.skills.map((skill) => {
              const maxed = skill.level >= skill.maxLevel;
              return <article key={skill.id} data-locked={!skill.unlocked}><div><span>{skill.unlocked ? '已解锁' : `Lv.${skill.unlockLevel} 解锁`}</span><strong>{skill.name}</strong><small>{skill.description}</small></div><b>Lv.{skill.level}</b><Button variant="secondary" loading={growthBusy === `skill:${skill.id}`} disabled={!authenticated || !skill.unlocked || maxed || overview.growth.skillPointsAvailable < 1 || operationBusy} onClick={() => void upgradeSkill(skill)}>{!authenticated ? '登录后升级' : !skill.unlocked ? '未解锁' : maxed ? '已满级' : '1 点升级'}</Button></article>;
            })}
          </div>
        </div>
      </section>

      <section className={styles.today} aria-labelledby="farm-today-title">
        <div className={styles.sectionHeading}><div><span>TODAY</span><h2 id="farm-today-title">今天只做这些</h2></div><small>养成是可选深度</small></div>
        <div className={styles.taskGrid}>
          <article data-done={!idle}><span>{!idle ? '✓' : '1'}</span><div><strong>照料一次</strong><p>{!idle ? '今天已经照料过了' : '点上面的绿色按钮完成'}</p></div></article>
          <article data-done={overview.growth.ordersCompleted > 0}><span>{overview.growth.ordersCompleted > 0 ? '✓' : '2'}</span><div><strong>完成农场订单</strong><p>今日 {overview.growth.ordersCompleted}/{overview.growth.ordersTotal}，额外奖励之外，每轮仍有基础收益</p></div></article>
          <article data-done={overview.pendingEncouragements > 0}><span>{overview.pendingEncouragements > 0 ? '✓' : '3'}</span><div><strong>看看好友鼓励</strong><p>{overview.pendingEncouragements > 0 ? `收到 ${overview.pendingEncouragements} 份鼓励` : '有好友鼓励时叶子会闪光'}</p></div></article>
        </div>
      </section>

      <section className={styles.facts} aria-label="绿植信息">
        <article><small>新手首轮</small><strong>{formatCommunityFarmDuration(overview.firstCycleSeconds)}</strong><p>很快看到第一次成熟</p></article>
        <article><small>日常周期</small><strong>{formatCommunityFarmDuration(overview.standardCycleSeconds)}</strong><p>关掉网页也会继续长</p></article>
        <article><small>好友鼓励</small><strong>{overview.pendingEncouragements}</strong><p>只增加互动，不影响奖励公平</p></article>
      </section>
    </main>
  );
}
