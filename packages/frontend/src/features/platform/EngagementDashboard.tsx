import {
  useCallback,
  useEffect,
  useState,
  type JSX,
} from 'react';
import { Link } from 'react-router-dom';

import {
  engagementApi,
  type DailyTask,
  type DailyTaskStatus,
  type EngagementReward,
  type RecentActivity,
  type RecentActivityResponse,
  type TodayTasksResponse,
} from '../../api/engagement';
import { Button, Card, EmptyState, Tag } from '../../components/ui';
import styles from './EngagementDashboard.module.css';

export interface EngagementDashboardProps {
  /** 外部事件需要重新拉取任务与活动时递增该值。 */
  refreshKey?: number;
  /** 任务奖励到账后通知首页刷新成长资产。 */
  onRewardClaimed?: () => void | Promise<void>;
  /** 可靠事件已写入、Worker 尚在投影时的短暂提示。 */
  readingSyncPending?: boolean;
}

const CURRENCY_LABELS: Record<string, string> = {
  officeCoin: '办公币',
  office_coin: '办公币',
  decorationCoin: '装饰币',
  decor_coin: '装饰币',
  water: '水滴',
  sunlight: '阳光',
  fertilizer: '肥料',
};

const ITEM_LABELS: Record<string, string> = {
  seed_wheat: '小麦种子',
  seed_strawberry: '草莓种子',
  seed_coffee: '咖啡种子',
};

const STATUS_META: Record<
  DailyTaskStatus,
  { label: string; color: 'neutral' | 'brand' | 'success' }
> = {
  in_progress: { label: '进行中', color: 'neutral' },
  claimable: { label: '可领取', color: 'brand' },
  claimed: { label: '已领取', color: 'success' },
};

const activityTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function readableError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

function rewardParts(reward: EngagementReward): string[] {
  const parts: string[] = [];
  if (reward.experience) {
    parts.push(`+${reward.experience} EXP`);
  }
  if (reward.energy) {
    parts.push(`+${reward.energy} 精力`);
  }
  for (const [key, value] of Object.entries(reward.currencies ?? {})) {
    if (value) {
      parts.push(`+${value} ${CURRENCY_LABELS[key] ?? key}`);
    }
  }
  for (const [key, value] of Object.entries(reward.items ?? {})) {
    if (value) {
      parts.push(`+${value} ${ITEM_LABELS[key] ?? key}`);
    }
  }
  return parts;
}

function taskDestination(
  task: DailyTask,
): { to: string; label: string } | null {
  if (task.eventType.startsWith('farm.')) {
    return { to: '/farm', label: '去农场' };
  }
  if (task.eventType.startsWith('arena.')) {
    return { to: '/games/arena', label: '去竞技场' };
  }
  if (task.eventType.startsWith('reading.')) {
    return { to: '/library', label: '去阅读' };
  }
  return null;
}

function activityIcon(eventType: string): string {
  if (eventType.startsWith('checkin.')) return '✓';
  if (eventType === 'farm.crop.harvested') return '穗';
  if (eventType.startsWith('farm.')) return '芽';
  if (eventType.startsWith('arena.')) return '战';
  if (eventType.startsWith('reading.')) return '阅';
  return '记';
}

function formatActivityTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '时间待同步'
    : activityTimeFormatter.format(date);
}

interface TaskItemProps {
  task: DailyTask;
  claiming: boolean;
  onClaim: (task: DailyTask) => void;
}

function TaskItem({
  task,
  claiming,
  onClaim,
}: TaskItemProps): JSX.Element {
  const status = STATUS_META[task.status];
  const target = Math.max(1, task.targetCount);
  const progress = Math.min(Math.max(0, task.progress), target);
  const progressPercent = Math.round((progress / target) * 100);
  const rewards = rewardParts(task.reward);
  const destination = taskDestination(task);

  return (
    <li className={styles.taskItem}>
      <div className={styles.taskHeading}>
        <div>
          <h3>{task.title}</h3>
          <p>{task.description}</p>
        </div>
        <Tag color={status.color}>{status.label}</Tag>
      </div>

      <div className={styles.taskProgress}>
        <div className={styles.progressMeta}>
          <span>任务进度</span>
          <strong>
            {progress} / {target}
          </strong>
        </div>
        <div
          className={styles.progressTrack}
          role="progressbar"
          aria-label={`${task.title}进度`}
          aria-valuemin={0}
          aria-valuemax={target}
          aria-valuenow={progress}
        >
          <span style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      <div className={styles.taskFooter}>
        <div className={styles.rewards} aria-label={`${task.title}奖励`}>
          <span className={styles.rewardLabel}>奖励</span>
          {rewards.length > 0 ? (
            rewards.map((reward) => <strong key={reward}>{reward}</strong>)
          ) : (
            <span>完成后发放</span>
          )}
        </div>

        {task.status === 'claimable' ? (
          <Button
            size="sm"
            loading={claiming}
            onClick={() => onClaim(task)}
          >
            领取奖励
          </Button>
        ) : task.status === 'claimed' ? (
          <span className={styles.claimed}>✓ 已领取</span>
        ) : destination ? (
          <Link className={styles.actionLink} to={destination.to}>
            {destination.label}
          </Link>
        ) : (
          <span className={styles.waiting}>完成上方签到后计入</span>
        )}
      </div>
    </li>
  );
}

function ActivityItem({
  activity,
}: {
  activity: RecentActivity;
}): JSX.Element {
  return (
    <li className={styles.activityItem}>
      <span className={styles.activityIcon} aria-hidden="true">
        {activityIcon(activity.eventType)}
      </span>
      <div className={styles.activityContent}>
        <div>
          <strong>{activity.title}</strong>
          <time dateTime={activity.occurredAt}>
            {formatActivityTime(activity.occurredAt)}
          </time>
        </div>
        {activity.description && <p>{activity.description}</p>}
      </div>
    </li>
  );
}

export function EngagementDashboard({
  refreshKey = 0,
  onRewardClaimed,
  readingSyncPending = false,
}: EngagementDashboardProps): JSX.Element {
  const [tasksData, setTasksData] = useState<TodayTasksResponse | null>(null);
  const [activityData, setActivityData] =
    useState<RecentActivityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimingKey, setClaimingKey] = useState<string | null>(null);

  const loadDashboard = useCallback(async (): Promise<void> => {
    setLoading(true);
    setLoadError(null);

    try {
      const [nextTasks, nextActivity] = await Promise.all([
        engagementApi.getTodayTasks(),
        engagementApi.getRecentActivity(),
      ]);
      setTasksData(nextTasks);
      setActivityData(nextActivity);
    } catch (error) {
      setLoadError(
        readableError(error, '今日任务与最近活动加载失败，请稍后重试。'),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard, refreshKey]);

  const handleClaim = async (task: DailyTask): Promise<void> => {
    if (claimingKey || task.status !== 'claimable') {
      return;
    }

    setClaimingKey(task.key);
    setClaimError(null);
    try {
      await engagementApi.claimTask(task.key);
      setTasksData((current) =>
        current
          ? {
              ...current,
              summary: {
                ...current.summary,
                claimableCount: Math.max(
                  0,
                  current.summary.claimableCount - 1,
                ),
              },
              tasks: current.tasks.map((item) =>
                item.key === task.key
                  ? {
                      ...item,
                      status: 'claimed',
                      claimedAt: new Date().toISOString(),
                    }
                  : item,
              ),
            }
          : current,
      );
      await onRewardClaimed?.();
      await loadDashboard();
    } catch (error) {
      setClaimError(
        readableError(error, `“${task.title}”奖励领取失败，请稍后重试。`),
      );
    } finally {
      setClaimingKey(null);
    }
  };

  const hasData = tasksData != null && activityData != null;

  if (loading && !hasData) {
    return (
      <Card className={styles.dashboard} title="今日任务与最近活动">
        <div className={styles.pageState} role="status" aria-live="polite">
          正在加载今日安排…
        </div>
      </Card>
    );
  }

  if (loadError && !hasData) {
    return (
      <Card className={styles.dashboard} title="今日任务与最近活动">
        <div className={styles.pageState} role="alert">
          <p>{loadError}</p>
          <Button variant="secondary" onClick={() => void loadDashboard()}>
            重新加载
          </Button>
        </div>
      </Card>
    );
  }

  if (!tasksData || !activityData) {
    return (
      <Card className={styles.dashboard} title="今日任务与最近活动">
        <div className={styles.pageState} role="alert">
          暂无可展示的数据
        </div>
      </Card>
    );
  }

  const summary = tasksData.summary;
  const overallPercent =
    summary.totalCount > 0
      ? Math.round((summary.completedCount / summary.totalCount) * 100)
      : 0;

  return (
    <section className={styles.dashboard} aria-label="每日任务与最近活动">
      {readingSyncPending && (
        <p className={styles.syncNotice} role="status" aria-live="polite">
          阅读任务正在同步，通常几秒内完成。
        </p>
      )}
      {loadError && (
        <div className={styles.refreshWarning} role="alert">
          <span>{loadError} 当前仍展示上次成功加载的数据。</span>
          <Button
            size="sm"
            variant="secondary"
            loading={loading}
            onClick={() => void loadDashboard()}
          >
            重试
          </Button>
        </div>
      )}

      {claimError && (
        <p className={styles.claimError} role="alert">
          {claimError}
        </p>
      )}

      <div className={styles.layout}>
        <Card
          className={styles.panel}
          title="每日任务"
          headerActions={
            <Button
              size="sm"
              variant="ghost"
              loading={loading}
              onClick={() => void loadDashboard()}
              aria-label="刷新每日任务与最近活动"
            >
              刷新
            </Button>
          }
        >
          <div className={styles.summary}>
            <div>
              <span>今日已完成</span>
              <strong>
                {summary.completedCount} / {summary.totalCount}
              </strong>
            </div>
            <div
              className={styles.overallTrack}
              role="progressbar"
              aria-label="今日任务总进度"
              aria-valuemin={0}
              aria-valuemax={Math.max(1, summary.totalCount)}
              aria-valuenow={summary.completedCount}
            >
              <span style={{ width: `${overallPercent}%` }} />
            </div>
            {summary.claimableCount > 0 && (
              <Tag color="brand">{summary.claimableCount} 项待领取</Tag>
            )}
          </div>

          {tasksData.tasks.length > 0 ? (
            <ul className={styles.taskList}>
              {tasksData.tasks.map((task) => (
                <TaskItem
                  key={task.key}
                  task={task}
                  claiming={claimingKey === task.key}
                  onClaim={(item) => void handleClaim(item)}
                />
              ))}
            </ul>
          ) : (
            <EmptyState
              className={styles.empty}
              icon="☀"
              title="今天很轻松"
              message="今日暂无任务，稍后再回来看看。"
            />
          )}
        </Card>

        <Card className={styles.panel} title="最近活动">
          {activityData.activities.length > 0 ? (
            <ol className={styles.activityList}>
              {activityData.activities.map((activity) => (
                <ActivityItem key={activity.id} activity={activity} />
              ))}
            </ol>
          ) : (
            <EmptyState
              className={styles.empty}
              icon="⌁"
              title="等待第一条记录"
              message="签到、阅读、收获或竞技后，活动记录会出现在这里。"
            />
          )}
        </Card>
      </div>
    </section>
  );
}
