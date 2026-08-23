import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';

import {
  communityFarmApi,
  createCommunityIdempotencyKey,
  type CommunityFarmOverview,
  type CommunityFarmSkill,
  type CommunityFarmTool,
} from '../../api/community';
import { useCommunityAuthStore } from '../../app/store/community-auth-store';
import { Button } from '../../components/ui';
import { communityFarmRemainingSeconds, formatCommunityFarmDuration } from './farm-countdown';
import { communityRequestErrorMessage } from './request-error';
import styles from './FarmPage.module.css';

const GUEST_FARM_KEY = 'zbrs.guest-farm.v1';
const GUEST_FIRST_CYCLE_SECONDS = 30;
const GUEST_STANDARD_CYCLE_SECONDS = 5 * 60;

const GUEST_CROPS: CommunityFarmOverview['crops'] = [
  { key: 'desk_mint', name: '工位薄荷', mark: '薄', unlockLevel: 1, durationSeconds: 300, experience: 12, coins: 12, description: '成熟最快，适合刚开始经营。', unlocked: true, selected: true, growing: false },
  { key: 'meeting_tomato', name: '会议番茄', mark: '茄', unlockLevel: 3, durationSeconds: 1200, experience: 32, coins: 36, description: '稳定产出，适合短时回来收获。', unlocked: false, selected: false, growing: false },
  { key: 'deadline_strawberry', name: '截止日草莓', mark: '莓', unlockLevel: 6, durationSeconds: 3600, experience: 70, coins: 84, description: '经验与办公币都很均衡。', unlocked: false, selected: false, growing: false },
  { key: 'overtime_coffee', name: '加班咖啡果', mark: '咖', unlockLevel: 10, durationSeconds: 7200, experience: 125, coins: 165, description: '偏向农场币产出，适合升级工具。', unlocked: false, selected: false, growing: false },
  { key: 'promotion_sunflower', name: '晋升向日葵', mark: '升', unlockLevel: 15, durationSeconds: 14400, experience: 230, coins: 280, description: '中后期主力作物。', unlocked: false, selected: false, growing: false },
  { key: 'annual_moonflower', name: '年终月光花', mark: '年', unlockLevel: 22, durationSeconds: 28800, experience: 420, coins: 540, description: '长周期高收益作物。', unlocked: false, selected: false, growing: false },
];

const GUEST_TOOLS: CommunityFarmTool[] = [
  { id: 'watering_can', name: '定时浇水壶', slot: '浇水工具', description: '每级让成熟时间缩短 4%。', level: 0, maxLevel: 5, nextCost: 20 },
  { id: 'planter_box', name: '透气种植箱', slot: '种植容器', description: '每级让农场经验增加 8%。', level: 0, maxLevel: 5, nextCost: 20 },
  { id: 'harvest_basket', name: '分类收获篮', slot: '收获工具', description: '每级让农场币增加 10%。', level: 0, maxLevel: 5, nextCost: 20 },
];

const GUEST_SKILLS: CommunityFarmSkill[] = [
  { id: 'quick_care', name: '快速照料', unlockLevel: 2, description: '每级让成熟时间额外缩短 3%。', level: 0, maxLevel: 5, unlocked: false },
  { id: 'green_thumb', name: '绿手指', unlockLevel: 5, description: '每级让农场经验额外增加 5%。', level: 0, maxLevel: 5, unlocked: false },
  { id: 'abundant_harvest', name: '丰收心得', unlockLevel: 8, description: '每级让农场币额外增加 6%。', level: 0, maxLevel: 5, unlocked: false },
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
      totalHarvests: 0,
      farmVersion: 1,
      skillPointsEarned: 0,
      skillPointsAvailable: 0,
      nextUnlock: { level: 2, name: '快速照料', kind: 'skill' },
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

export function CommunityFarmPage(): JSX.Element {
  const phase = useCommunityAuthStore((state) => state.phase);
  const authenticated = phase !== 'bootstrapping' && phase !== 'guest';
  const [overview, setOverview] = useState<CommunityFarmOverview | null>(null);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [clientNowMs, setClientNowMs] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [growthBusy, setGrowthBusy] = useState<string>();
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
        const level = Math.floor(experience / 100) + 1;
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
            farmCoins: overview.growth.farmCoins + (harvesting ? 12 : 0),
            totalHarvests: overview.growth.totalHarvests + (harvesting ? 1 : 0),
            farmVersion: overview.growth.farmVersion + 1,
          },
        };
        persistGuestFarm(next);
        applyOverview(next);
        setNotice(harvesting ? '收获了 20 点成长经验，新一轮已开始。' : '浇水完成！第一轮 30 秒后成熟。');
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

  async function selectCrop(cropKey: string, cropName: string): Promise<void> {
    if (!authenticated || !overview) return;
    setGrowthBusy(`crop:${cropKey}`);
    setError(undefined);
    try {
      const result = await communityFarmApi.selectCrop(
        cropKey,
        overview.growth.farmVersion,
        createCommunityIdempotencyKey('farm-crop'),
      );
      applyOverview(result.farm);
      setNotice(`${cropName}已设为下一轮作物，当前成长不会被打断。`);
    } catch (requestError) {
      setError(communityRequestErrorMessage(requestError, '作物选择没有保存，请刷新后再试'));
    } finally {
      setGrowthBusy(undefined);
    }
  }

  async function upgradeTool(tool: CommunityFarmTool): Promise<void> {
    if (!authenticated || !overview) return;
    setGrowthBusy(`tool:${tool.id}`);
    setError(undefined);
    try {
      const result = await communityFarmApi.upgradeTool(
        tool.id,
        overview.growth.farmVersion,
        createCommunityIdempotencyKey('farm-tool'),
      );
      applyOverview(result.farm);
      setNotice(`${tool.name}已升到 Lv.${result.farm.tools.find((item) => item.id === tool.id)?.level ?? tool.level + 1}，消耗 ${result.cost} 农场币。`);
    } catch (requestError) {
      setError(communityRequestErrorMessage(requestError, '工具升级没有成功，请确认农场币和档案状态'));
    } finally {
      setGrowthBusy(undefined);
    }
  }

  async function upgradeSkill(skill: CommunityFarmSkill): Promise<void> {
    if (!authenticated || !overview) return;
    setGrowthBusy(`skill:${skill.id}`);
    setError(undefined);
    try {
      const result = await communityFarmApi.upgradeSkill(
        skill.id,
        overview.growth.farmVersion,
        createCommunityIdempotencyKey('farm-skill'),
      );
      applyOverview(result.farm);
      setNotice(`${skill.name}已升到 Lv.${result.farm.skills.find((item) => item.id === skill.id)?.level ?? skill.level + 1}。`);
    } catch (requestError) {
      setError(communityRequestErrorMessage(requestError, '技能升级没有成功，请确认技能点和解锁等级'));
    } finally {
      setGrowthBusy(undefined);
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

      <section className={styles.growthSummary} aria-label="农场成长摘要">
        <article><span>农场等级</span><strong>Lv.{overview.plant.level}</strong><small>{overview.plant.experience} 总经验</small></article>
        <article><span>农场币</span><strong>{overview.growth.farmCoins}</strong><small>只用于农场工具</small></article>
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

      <section className={styles.growthSection} aria-labelledby="farm-crops-title">
        <div className={styles.sectionHeading}><div><span>CROPS</span><h2 id="farm-crops-title">选择下一轮作物</h2></div><small>切换不会中断当前成长</small></div>
        <div className={styles.cropGrid}>
          {overview.crops.map((crop) => (
            <article key={crop.key} data-selected={crop.selected} data-locked={!crop.unlocked}>
              <b>{crop.mark}</b>
              <div><strong>{crop.name}</strong><small>{crop.description}</small></div>
              <dl><div><dt>成熟</dt><dd>{formatCommunityFarmDuration(crop.durationSeconds)}</dd></div><div><dt>收获</dt><dd>经验 {crop.experience} · 币 {crop.coins}</dd></div></dl>
              <Button
                variant={crop.selected ? 'secondary' : 'primary'}
                loading={growthBusy === `crop:${crop.key}`}
                disabled={!authenticated || !crop.unlocked || crop.selected || Boolean(growthBusy)}
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
              return <article key={tool.id}><div><span>{tool.slot}</span><strong>{tool.name}</strong><small>{tool.description}</small></div><b>Lv.{tool.level}</b><Button variant="secondary" loading={growthBusy === `tool:${tool.id}`} disabled={!authenticated || maxed || overview.growth.farmCoins < tool.nextCost || Boolean(growthBusy)} onClick={() => void upgradeTool(tool)}>{!authenticated ? '登录后升级' : maxed ? '已满级' : `${tool.nextCost} 币升级`}</Button></article>;
            })}
          </div>
        </div>
        <div className={styles.growthSection}>
          <div className={styles.sectionHeading}><div><span>SKILLS</span><h2>三条农场技能</h2></div><small>可用 {overview.growth.skillPointsAvailable} 点</small></div>
          <div className={styles.upgradeList}>
            {overview.skills.map((skill) => {
              const maxed = skill.level >= skill.maxLevel;
              return <article key={skill.id} data-locked={!skill.unlocked}><div><span>{skill.unlocked ? '已解锁' : `Lv.${skill.unlockLevel} 解锁`}</span><strong>{skill.name}</strong><small>{skill.description}</small></div><b>Lv.{skill.level}</b><Button variant="secondary" loading={growthBusy === `skill:${skill.id}`} disabled={!authenticated || !skill.unlocked || maxed || overview.growth.skillPointsAvailable < 1 || Boolean(growthBusy)} onClick={() => void upgradeSkill(skill)}>{!authenticated ? '登录后升级' : !skill.unlocked ? '未解锁' : maxed ? '已满级' : '1 点升级'}</Button></article>;
            })}
          </div>
        </div>
      </section>

      <section className={styles.today} aria-labelledby="farm-today-title">
        <div className={styles.sectionHeading}><div><span>TODAY</span><h2 id="farm-today-title">今天只做这些</h2></div><small>养成是可选深度</small></div>
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
