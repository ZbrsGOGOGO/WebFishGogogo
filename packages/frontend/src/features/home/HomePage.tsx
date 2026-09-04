// packages/frontend/src/features/home/HomePage.tsx
// 受保护首页：仪表盘式落地页，提供文档库 / 工具入口。

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type JSX,
} from 'react';
import { Link } from 'react-router-dom';

import { useAuthStore } from '../../app/store/auth-store';
import {
  clearReadingEngagementPending,
  hasReadingEngagementPending,
  READING_ENGAGEMENT_PENDING_EVENT,
} from '../../app/engagement-sync';
import { farmApi, type FarmOverview } from '../../api/farm';
import type { PlatformOverview } from '../../api/platform';
import { Card } from '../../components/ui';
import { EngagementDashboard, PlatformOverviewCard } from '../platform';
import styles from './HomePage.module.css';

// 生产 Worker 每秒轮询一次，略晚于一个轮询周期刷新可避免稳定读到旧进度。
const TASK_REFRESH_DELAY_MS = 1_200;

interface HomeEntry {
  to: string;
  mark: string;
  eyebrow: string;
  name: string;
  desc: string;
  tone: 'reading' | 'tools' | 'farm' | 'games';
}

const ENTRIES: HomeEntry[] = [
  {
    to: '/library',
    mark: '阅',
    eyebrow: '私人文档库',
    name: '阅读',
    desc: '整理自己的文本资料，随时从上次位置继续阅读。',
    tone: 'reading',
  },
  {
    to: '/tools',
    mark: '工',
    eyebrow: '效率工作台',
    name: '工具',
    desc: '打开常用的文本、数据、时间与开发辅助工具。',
    tone: 'tools',
  },
  {
    to: '/farm',
    mark: '农',
    eyebrow: '轻量成长',
    name: '农场',
    desc: '种植作物、安排收获，让资源在离线时继续成长。',
    tone: 'farm',
  },
  {
    to: '/games',
    mark: '游',
    eyebrow: '短时放松',
    name: '小游戏',
    desc: '进入俄罗斯方块和坦克大战，挑战个人最佳成绩。',
    tone: 'games',
  },
];

export function HomePage(): JSX.Element {
  const user = useAuthStore((state) => state.user);
  const [overviewRefreshKey, setOverviewRefreshKey] = useState(0);
  const [engagementRefreshKey, setEngagementRefreshKey] = useState(0);
  const [platformOverview, setPlatformOverview] =
    useState<PlatformOverview | null>(null);
  const [farmOverview, setFarmOverview] = useState<FarmOverview | null>(null);
  const [readingSyncPending, setReadingSyncPending] = useState(
    hasReadingEngagementPending,
  );
  const taskRefreshTimer = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    void farmApi
      .getFarm()
      .then((nextOverview) => {
        if (active) {
          setFarmOverview(nextOverview);
          // 首次读取农场会幂等发放新手资源；随后刷新资产卡，避免并行
          // 请求先后顺序让首页短暂保留“水滴 0”的旧快照。
          setOverviewRefreshKey((current) => current + 1);
        }
      })
      .catch(() => {
        // 首页路线仍可使用；具体错误由农场页在进入时完整呈现。
      });
    return () => {
      active = false;
    };
  }, []);

  // 阅读页结束请求可能在首页已经挂载后才返回；同页自定义事件用于补上
  // sessionStorage 原生 storage 事件不会通知当前标签页的这一时序。
  useEffect(() => {
    const syncPendingState = (): void => {
      setReadingSyncPending(hasReadingEngagementPending());
    };
    window.addEventListener(
      READING_ENGAGEMENT_PENDING_EVENT,
      syncPendingState,
    );
    syncPendingState();
    return () => {
      window.removeEventListener(
        READING_ENGAGEMENT_PENDING_EVENT,
        syncPendingState,
      );
    };
  }, []);

  useEffect(() => {
    if (!readingSyncPending) return undefined;
    const timer = window.setTimeout(() => {
      setEngagementRefreshKey((current) => current + 1);
      clearReadingEngagementPending();
      setReadingSyncPending(false);
    }, TASK_REFRESH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [readingSyncPending]);

  useEffect(
    () => () => {
      if (taskRefreshTimer.current != null) {
        window.clearTimeout(taskRefreshTimer.current);
      }
    },
    [],
  );

  const handleCheckinComplete = useCallback((): void => {
    if (taskRefreshTimer.current != null) {
      window.clearTimeout(taskRefreshTimer.current);
    }
    taskRefreshTimer.current = window.setTimeout(() => {
      setEngagementRefreshKey((current) => current + 1);
      taskRefreshTimer.current = null;
    }, TASK_REFRESH_DELAY_MS);
  }, []);

  const handleRewardClaimed = useCallback((): void => {
    setOverviewRefreshKey((current) => current + 1);
  }, []);

  const handlePlatformOverviewChange = useCallback(
    (nextOverview: PlatformOverview): void => {
      setPlatformOverview(nextOverview);
    },
    [],
  );

  const greeting = user
    ? `欢迎回来，${user.displayName ?? user.email}`
    : '欢迎回来';
  const checkedIn = platformOverview?.checkin.checkedInToday ?? false;
  const firstHarvestCompleted =
    farmOverview?.onboarding.firstHarvestCompleted ?? false;
  const farmStepTitle = firstHarvestCompleted
    ? '首收完成，咖啡已解锁'
    : farmOverview?.onboarding.stage === 'ready'
      ? '作物成熟了，去完成首收'
      : farmOverview?.onboarding.stage === 'growing'
        ? '第一株生长中，回来收获'
        : '30 秒种下并收获第一株';
  const farmStepDescription = firstHarvestCompleted
    ? `当前农场 Lv.${farmOverview?.farm.level ?? 2}，已经进入正常离线种植节奏。`
    : '首次种植自动加速，首次收获直升农场 Lv.2。';

  return (
    <section className={styles.page} aria-label="首页">
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>摸摸公司 · 上班族轻量工作台</span>
          <h1>{greeting}</h1>
          <p>工作时积累成长，空闲时收菜和玩一局。先用三分钟完成今天的开局路线。</p>
        </div>
        <div className={styles.heroMission} aria-label="新手开局收益">
          <span>3 分钟开局</span>
          <strong>30 秒首收</strong>
          <small>农场 Lv.2 · 解锁咖啡</small>
        </div>
      </header>

      <section className={styles.firstPlay} aria-labelledby="first-play-title">
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.eyebrow}>今日摸鱼路线</span>
            <h2 id="first-play-title">先完成一条有结果的短循环</h2>
          </div>
          <p>补给 → 首收 → 小游戏，三步都能独立暂停，回来继续。</p>
        </div>

        <div className={styles.routeGrid}>
          <article className={styles.routeStep} data-complete={checkedIn}>
            <span className={styles.stepIndex}>{checkedIn ? '✓' : '01'}</span>
            <div>
              <small>每日补给</small>
              <strong>{checkedIn ? '今日补给已领取' : '签到领取 5 水滴'}</strong>
              <p>给今天的种植准备资源，同时积累全站成长。</p>
            </div>
            <a className={styles.routeAction} href="#today-growth">
              {checkedIn ? '查看资产' : '去签到'}
            </a>
          </article>

          <article
            className={styles.routeStep}
            data-complete={firstHarvestCompleted}
          >
            <span className={styles.stepIndex}>
              {firstHarvestCompleted ? '✓' : '02'}
            </span>
            <div>
              <small>新手首收</small>
              <strong>{farmStepTitle}</strong>
              <p>{farmStepDescription}</p>
            </div>
            <Link className={styles.routeAction} to="/farm">
              {firstHarvestCompleted ? '继续种植' : '去农场'}
            </Link>
          </article>

          <article className={styles.routeStep}>
            <span className={styles.stepIndex}>03</span>
            <div>
              <small>短时放松</small>
              <strong>选一款小游戏完成首局</strong>
              <p>从俄罗斯方块或坦克大战开始，一局结束就能随时退出。</p>
            </div>
            <Link className={styles.routeAction} to="/games">
              去玩一局
            </Link>
          </article>
        </div>

        <aside className={styles.unlockRail} aria-label="等级解锁路线">
          <strong>接下来的明确目标</strong>
          <div>
            <span data-unlocked={(farmOverview?.farm.level ?? 1) >= 2}>
              农场 Lv.2 · 咖啡豆
            </span>
            <span data-unlocked={(platformOverview?.profile.level ?? 1) >= 3}>
              全站 Lv.3 · 午休斗技场
            </span>
            <span data-unlocked={(farmOverview?.farm.level ?? 1) >= 5}>
              农场 Lv.5 · 第 5 块地
            </span>
          </div>
        </aside>
      </section>

      <section className={styles.systems} aria-labelledby="systems-title">
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.eyebrow}>四个核心系统</span>
            <h2 id="systems-title">选择一个系统开始</h2>
          </div>
          <p>所有功能相互独立，也会共同累积你的成长进度。</p>
        </div>
        <nav aria-label="系统入口">
          <ul className={styles.entryGrid}>
            {ENTRIES.map((entry) => (
              <li key={entry.to}>
                <Link
                  to={entry.to}
                  className={styles.entry}
                  data-tone={entry.tone}
                  aria-label={`进入${entry.name}系统`}
                >
                  <Card className={styles.entryCard}>
                    <div className={styles.entryTopline}>
                      <span className={styles.entryMark} aria-hidden="true">
                        {entry.mark}
                      </span>
                      <span className={styles.entryAction} aria-hidden="true">
                        进入&nbsp;→
                      </span>
                    </div>
                    <span className={styles.entryEyebrow}>{entry.eyebrow}</span>
                    <h3>{entry.name}</h3>
                    <p>{entry.desc}</p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </section>

      <section
        id="today-growth"
        className={styles.today}
        aria-labelledby="today-title"
      >
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.eyebrow}>今日状态</span>
            <h2 id="today-title">成长与任务</h2>
          </div>
          <p>签到、完成任务并领取奖励，进度会在各系统间同步。</p>
        </div>
      <PlatformOverviewCard
        className={styles.overview}
        refreshKey={overviewRefreshKey}
        onCheckinComplete={handleCheckinComplete}
        onOverviewChange={handlePlatformOverviewChange}
      />
      <EngagementDashboard
        refreshKey={engagementRefreshKey}
        onRewardClaimed={handleRewardClaimed}
        readingSyncPending={readingSyncPending}
      />
      </section>
    </section>
  );
}
