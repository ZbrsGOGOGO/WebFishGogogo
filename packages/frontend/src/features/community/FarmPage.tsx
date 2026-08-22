import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';

import {
  communityFarmApi,
  createCommunityIdempotencyKey,
  type CommunityFarmOverview,
} from '../../api/community';
import { useCommunityAuthStore } from '../../app/store/community-auth-store';
import { Button } from '../../components/ui';
import { communityFarmRemainingSeconds, formatCommunityFarmDuration } from './farm-countdown';
import { communityRequestErrorMessage } from './request-error';
import styles from './FarmPage.module.css';

const GUEST_FARM_KEY = 'zbrs.guest-farm.v1';
const GUEST_FIRST_CYCLE_SECONDS = 90;
const GUEST_STANDARD_CYCLE_SECONDS = 5 * 60;

function createGuestFarm(): CommunityFarmOverview {
  return {
    serverTime: new Date().toISOString(),
    state: 'idle',
    plant: {
      name: '工位薄荷',
      appearanceKey: 'desk-mint',
      level: 1,
      experience: 0,
      careStreak: 0,
      cycleStartedAt: null,
      maturesAt: null,
      cycleSeconds: null,
      firstCycle: true,
    },
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
    if (stored) farm = { ...farm, ...(JSON.parse(stored) as CommunityFarmOverview) };
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

export function CommunityFarmPage(): JSX.Element {
  const phase = useCommunityAuthStore((state) => state.phase);
  const authenticated = phase !== 'bootstrapping' && phase !== 'guest';
  const [overview, setOverview] = useState<CommunityFarmOverview | null>(null);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [clientNowMs, setClientNowMs] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const refreshedMaturity = useRef<string>();

  const applyOverview = useCallback((next: CommunityFarmOverview): void => {
    const serverNow = Date.parse(next.serverTime);
    setOverview(next);
    setServerOffsetMs(Number.isFinite(serverNow) ? serverNow - Date.now() : 0);
    setClientNowMs(Date.now());
  }, []);

  const load = useCallback(async (showLoading = true): Promise<void> => {
    if (showLoading) setLoading(true);
    setError(undefined);
    try {
      applyOverview(authenticated ? await communityFarmApi.getOverview() : loadGuestFarm());
    } catch (requestError) {
      setError(communityRequestErrorMessage(requestError, '绿植暂时没有连接上，请稍后再试'));
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [applyOverview, authenticated]);

  useEffect(() => { void load(); }, [load]);
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
    if (overview?.state !== 'growing' || !maturesAt || remainingSeconds !== 0 || refreshedMaturity.current === maturesAt) return;
    refreshedMaturity.current = maturesAt;
    void load(false);
  }, [load, overview?.plant.maturesAt, overview?.state, remainingSeconds]);

  async function mainAction(): Promise<void> {
    if (!overview || overview.state === 'growing') return;
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      if (!authenticated) {
        const now = Date.now();
        const harvesting = overview.state === 'ready';
        const experience = overview.plant.experience + (harvesting ? 20 : 0);
        const cycleSeconds = overview.plant.firstCycle
          ? GUEST_FIRST_CYCLE_SECONDS
          : GUEST_STANDARD_CYCLE_SECONDS;
        const next: CommunityFarmOverview = {
          ...overview,
          serverTime: new Date(now).toISOString(),
          state: 'growing',
          dailyRewardClaimed: overview.dailyRewardClaimed || harvesting,
          plant: {
            ...overview.plant,
            level: Math.floor(experience / 100) + 1,
            experience,
            careStreak: overview.plant.careStreak + 1,
            cycleStartedAt: new Date(now).toISOString(),
            maturesAt: new Date(now + cycleSeconds * 1000).toISOString(),
            cycleSeconds,
            firstCycle: false,
          },
        };
        persistGuestFarm(next);
        applyOverview(next);
        setNotice(harvesting ? '收获了 20 点成长经验，新一轮已开始。' : '浇水完成！第一轮 90 秒后成熟。');
        return;
      }
      const key = createCommunityIdempotencyKey(`farm:${overview.state}`);
      const result = overview.state === 'idle'
        ? await communityFarmApi.care(key)
        : await communityFarmApi.harvestAndCare(key);
      applyOverview(result.farm);
      setNotice(overview.state === 'idle'
        ? '照料完成！绿植已经开始成长。'
        : result.reward?.summary ?? '收获成功！下一轮成长已经开始。');
    } catch (requestError) {
      setError(communityRequestErrorMessage(requestError, '这次操作没有成功，请再试一次'));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <main className={styles.page}><div className={styles.loading} role="status"><span>☘</span><p>正在打开你的工位绿植…</p></div></main>;
  }

  if (!overview) {
    return <main className={styles.page}><div className={styles.failure}><h1>绿植暂时没连上</h1>{error ? <p role="alert">{error}</p> : null}<Button onClick={() => void load()}>重新加载</Button></div></main>;
  }

  const progress = growthProgress(overview, remainingSeconds);
  const ready = overview.state === 'ready';
  const idle = overview.state === 'idle';
  const actionLabel = idle ? '浇水，开始成长' : ready ? '收获并种下新一轮' : '正在成长';
  const statusLabel = idle ? '等待照料' : ready ? '已经成熟' : '成长中';

  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <div><span>DESK FARM</span><h1>我的工位绿植</h1><p>不用翻地、除草或研究配方。每天来点一下，成熟后收获就好。</p></div>
        <div className={styles.headerBadge}><b>{overview.plant.careStreak}</b><span>{authenticated ? '连续照料天数' : '游客照料次数'}</span></div>
      </header>

      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {notice ? <div className={styles.rewardToast} role="status"><span>✓</span><div><strong>操作成功</strong><p>{notice}</p></div></div> : null}

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
                ? '浇一次水，就会开始第一轮成长'
                : ready
                  ? '已经长好，现在可以收获'
                  : remainingSeconds === 0
                    ? '正在确认成熟状态…'
                    : `还有 ${formatCommunityFarmDuration(remainingSeconds)} 成熟`}
            </p>
          </div>

          <Button className={styles.mainAction} fullWidth loading={busy} disabled={!idle && !ready} onClick={() => void mainAction()}>
            {actionLabel}
          </Button>
          <small className={styles.actionHint}>{overview.dailyRewardClaimed ? '今天的成长奖励已拿到，明天再来看看。' : '今天第一次收获会拿到成长奖励。'}</small>
        </div>
      </section>

      <section className={styles.today} aria-labelledby="farm-today-title">
        <div className={styles.sectionHeading}><div><span>TODAY</span><h2 id="farm-today-title">今天只做这些</h2></div><small>没有复杂任务</small></div>
        <div className={styles.taskGrid}>
          <article data-done={!idle}><span>{!idle ? '✓' : '1'}</span><div><strong>照料一次</strong><p>{!idle ? '今天已经照料过了' : '点上面的绿色按钮完成'}</p></div></article>
          <article data-done={overview.dailyRewardClaimed}><span>{overview.dailyRewardClaimed ? '✓' : '2'}</span><div><strong>收一次成熟绿植</strong><p>{overview.dailyRewardClaimed ? '今天的成长奖励已领取' : '成熟后回来点一下收获'}</p></div></article>
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
