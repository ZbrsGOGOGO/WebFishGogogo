import { useCallback, useEffect, useState, type JSX } from 'react';

import {
  platformApi,
  type PlatformBalances,
  type PlatformOverview,
} from '../../api/platform';
import { Button, Card } from '../../components/ui';
import styles from './PlatformOverviewCard.module.css';

export interface PlatformOverviewCardProps {
  className?: string;
  /** 外部资产变化后递增该值，组件会重新获取成长总览。 */
  refreshKey?: number;
  /** 每日签到与总览刷新都成功后触发。 */
  onCheckinComplete?: () => void | Promise<void>;
  /** 将最新总览同步给所在页面，用于编排跨系统的新手路线。 */
  onOverviewChange?: (overview: PlatformOverview) => void;
}

const BALANCE_ITEMS: ReadonlyArray<{
  key: keyof PlatformBalances;
  label: string;
}> = [
  { key: 'officeCoin', label: '办公币' },
];

const numberFormatter = new Intl.NumberFormat('zh-CN');

function readableError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

/**
 * 可嵌入首页或平台模块的成长概览卡片。
 *
 * 组件自行读取总览、处理签到及刷新，不依赖所在页面的数据加载流程。
 */
export function PlatformOverviewCard({
  className,
  refreshKey = 0,
  onCheckinComplete,
  onOverviewChange,
}: PlatformOverviewCardProps): JSX.Element {
  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkinError, setCheckinError] = useState<string | null>(null);

  const loadOverview = useCallback(async (): Promise<void> => {
    setLoading(true);
    setLoadError(null);

    try {
      const nextOverview = await platformApi.getOverview();
      setOverview(nextOverview);
      onOverviewChange?.(nextOverview);
    } catch (error) {
      setLoadError(readableError(error, '成长数据加载失败，请稍后重试。'));
    } finally {
      setLoading(false);
    }
  }, [onOverviewChange]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview, refreshKey]);

  const handleCheckin = async (): Promise<void> => {
    if (!overview || overview.checkin.checkedInToday || checkingIn) {
      return;
    }

    setCheckingIn(true);
    setCheckinError(null);

    try {
      await platformApi.checkInToday();
      const nextOverview = await platformApi.getOverview();
      setOverview(nextOverview);
      onOverviewChange?.(nextOverview);
      await onCheckinComplete?.();
    } catch (error) {
      setCheckinError(readableError(error, '签到失败，请稍后重试。'));
    } finally {
      setCheckingIn(false);
    }
  };

  if (loading && !overview) {
    return (
      <Card className={className} title="今日成长概览">
        <div className={styles.state} role="status" aria-live="polite">
          正在加载成长数据…
        </div>
      </Card>
    );
  }

  if (loadError && !overview) {
    return (
      <Card className={className} title="今日成长概览">
        <div className={styles.state} role="alert">
          <p>{loadError}</p>
          <Button size="sm" variant="secondary" onClick={() => void loadOverview()}>
            重新加载
          </Button>
        </div>
      </Card>
    );
  }

  if (!overview) {
    return (
      <Card className={className} title="今日成长概览">
        <div className={styles.state} role="alert">
          暂无成长数据
        </div>
      </Card>
    );
  }

  const { profile, balances, checkin } = overview;
  const expHint =
    profile.expToNextLevel == null
      ? '已达到当前最高等级'
      : `距升级还需 ${numberFormatter.format(profile.expToNextLevel)} EXP`;

  return (
    <Card
      className={className}
      bodyClassName={styles.body}
      title="今日成长概览"
      headerActions={
        <Button
          size="sm"
          onClick={() => void handleCheckin()}
          loading={checkingIn}
          disabled={checkin.checkedInToday}
        >
          {checkin.checkedInToday ? '今日已签到' : '今日签到'}
        </Button>
      }
    >
      <section className={styles.identity} aria-label="角色成长">
        <span className={styles.level}>Lv.{profile.level}</span>
        <div className={styles.identityText}>
          <strong>{profile.title}</strong>
          <span>
            {numberFormatter.format(profile.exp)} EXP · {expHint}
          </span>
        </div>
        <div className={styles.energy}>
          <span>体力</span>
          <strong>
            {numberFormatter.format(profile.energy)} /{' '}
            {numberFormatter.format(profile.energyCap)}
          </strong>
        </div>
      </section>

      <dl className={styles.balances} aria-label="平台资产">
        {BALANCE_ITEMS.map((item) => (
          <div className={styles.balanceItem} key={item.key}>
            <dt>{item.label}</dt>
            <dd>{numberFormatter.format(balances[item.key])}</dd>
          </div>
        ))}
      </dl>

      {checkinError && (
        <p className={styles.inlineError} role="alert">
          {checkinError}
        </p>
      )}
    </Card>
  );
}
