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
    desc: '进入贪食蛇、俄罗斯方块、坦克大战等完整玩法。',
    tone: 'games',
  },
];

export function HomePage(): JSX.Element {
  const user = useAuthStore((state) => state.user);
  const [overviewRefreshKey, setOverviewRefreshKey] = useState(0);
  const [engagementRefreshKey, setEngagementRefreshKey] = useState(0);
  const [readingSyncPending, setReadingSyncPending] = useState(
    hasReadingEngagementPending,
  );
  const taskRefreshTimer = useRef<number | null>(null);

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

  const greeting = user
    ? `欢迎回来，${user.displayName ?? user.email}`
    : '欢迎回来';

  return (
    <section className={styles.page} aria-label="首页">
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>ZBRS · 本地工作台</span>
          <h1>{greeting}</h1>
          <p>阅读、工具、农场与小游戏都在这里，选择一个系统开始。</p>
        </div>
        <div className={styles.localStatus} aria-label="当前运行状态">
          <span className={styles.statusDot} aria-hidden="true" />
          <div>
            <strong>单机版已就绪</strong>
            <span>数据保存在你的专属空间</span>
          </div>
        </div>
      </header>

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

      <section className={styles.today} aria-labelledby="today-title">
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
