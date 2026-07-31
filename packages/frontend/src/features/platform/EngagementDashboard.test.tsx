import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  engagementApi,
  type RecentActivityResponse,
  type TodayTasksResponse,
} from '../../api/engagement';
import { EngagementDashboard } from './EngagementDashboard';

const ACTIVITY: RecentActivityResponse = {
  activities: [
    {
      id: 'activity-1',
      eventType: 'checkin.completed',
      title: '完成今日签到',
      description: '领取了今日签到奖励',
      sourceType: 'checkin',
      sourceId: '2026-07-25',
      localDate: '2026-07-25',
      metadata: {},
      occurredAt: '2026-07-25T02:00:00.000Z',
    },
  ],
};

const TASKS: TodayTasksResponse = {
  serverTime: '2026-07-25T02:00:00.000Z',
  localDate: '2026-07-25',
  summary: {
    completedCount: 2,
    totalCount: 3,
    claimableCount: 1,
  },
  tasks: [
    {
      key: 'daily_checkin',
      title: '今日签到',
      description: '完成一次每日签到',
      eventType: 'checkin.completed',
      progress: 0,
      targetCount: 1,
      status: 'in_progress',
      reward: { experience: 10 },
      completedAt: null,
      claimedAt: null,
    },
    {
      key: 'daily_harvest',
      title: '收获作物',
      description: '在小农场收获一次成熟作物',
      eventType: 'farm.crop.harvested',
      progress: 1,
      targetCount: 1,
      status: 'claimable',
      reward: {
        experience: 15,
        energy: 1,
        currencies: { office_coin: 3 },
      },
      completedAt: '2026-07-25T02:00:00.000Z',
      claimedAt: null,
    },
    {
      key: 'daily_arena',
      title: '参加竞技',
      description: '在午休斗技场完成一场战斗',
      eventType: 'arena.battle.completed',
      progress: 1,
      targetCount: 1,
      status: 'claimed',
      reward: { experience: 20 },
      completedAt: '2026-07-25T02:00:00.000Z',
      claimedAt: '2026-07-25T02:01:00.000Z',
    },
  ],
};

function renderDashboard(props: {
  onRewardClaimed?: () => void | Promise<void>;
} = {}): void {
  render(
    <MemoryRouter>
      <EngagementDashboard {...props} />
    </MemoryRouter>,
  );
}

describe('EngagementDashboard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders server task states, progress, rewards, actions and activity', async () => {
    vi.spyOn(engagementApi, 'getTodayTasks').mockResolvedValue(TASKS);
    vi.spyOn(engagementApi, 'getRecentActivity').mockResolvedValue(ACTIVITY);

    renderDashboard();

    expect(screen.getByRole('status')).toHaveTextContent('正在加载今日安排');
    expect(await screen.findByText('收获作物')).toBeInTheDocument();
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    expect(screen.getByText('1 项待领取')).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: '收获作物进度' }),
    ).toHaveAttribute('aria-valuenow', '1');
    expect(screen.getByText('+15 EXP')).toBeInTheDocument();
    expect(screen.getByText('+1 精力')).toBeInTheDocument();
    expect(screen.getByText('+3 办公币')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '领取奖励' }),
    ).toBeEnabled();
    expect(screen.getByText('完成今日签到')).toBeInTheDocument();
    expect(screen.getByText('领取了今日签到奖励')).toBeInTheDocument();
    expect(screen.getByText('完成上方签到后计入')).toBeInTheDocument();
  });

  it('links an in-progress reading task back to the document library', async () => {
    const readingTasks: TodayTasksResponse = {
      ...TASKS,
      tasks: [
        ...TASKS.tasks,
        {
          key: 'daily_reading',
          title: '专注阅读',
          description: '累计完成 10 分钟有效阅读',
          eventType: 'reading.session.completed',
          progress: 0,
          targetCount: 1,
          status: 'in_progress',
          reward: { experience: 15 },
          completedAt: null,
          claimedAt: null,
        },
      ],
    };
    vi.spyOn(engagementApi, 'getTodayTasks').mockResolvedValue(readingTasks);
    vi.spyOn(engagementApi, 'getRecentActivity').mockResolvedValue(ACTIVITY);

    renderDashboard();

    expect(await screen.findByText('专注阅读')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '去阅读' })).toHaveAttribute(
      'href',
      '/library',
    );
    expect(
      screen.getByRole('progressbar', { name: '专注阅读进度' }),
    ).toHaveAttribute('aria-valuenow', '0');
  });

  it('claims by stable task key, refreshes data and notifies the overview', async () => {
    const claimed: TodayTasksResponse = {
      ...TASKS,
      summary: { ...TASKS.summary, claimableCount: 0 },
      tasks: TASKS.tasks.map((task) =>
        task.key === 'daily_harvest'
          ? {
              ...task,
              status: 'claimed' as const,
              claimedAt: '2026-07-25T02:02:00.000Z',
            }
          : task,
      ),
    };
    const tasksSpy = vi
      .spyOn(engagementApi, 'getTodayTasks')
      .mockResolvedValueOnce(TASKS)
      .mockResolvedValueOnce(claimed);
    vi.spyOn(engagementApi, 'getRecentActivity').mockResolvedValue(ACTIVITY);
    const claimSpy = vi.spyOn(engagementApi, 'claimTask').mockResolvedValue({
      taskKey: 'daily_harvest',
      claimed: true,
      alreadyClaimed: false,
      reward: { experience: 15, energy: 1 },
    });
    const onRewardClaimed = vi.fn();

    renderDashboard({ onRewardClaimed });
    fireEvent.click(
      await screen.findByRole('button', { name: '领取奖励' }),
    );

    await waitFor(() =>
      expect(claimSpy).toHaveBeenCalledWith('daily_harvest'),
    );
    await waitFor(() => expect(tasksSpy).toHaveBeenCalledTimes(2));
    expect(onRewardClaimed).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('1 项待领取')).not.toBeInTheDocument();
  });

  it('keeps loaded data and restores the action after a claim error', async () => {
    vi.spyOn(engagementApi, 'getTodayTasks').mockResolvedValue(TASKS);
    vi.spyOn(engagementApi, 'getRecentActivity').mockResolvedValue(ACTIVITY);
    vi.spyOn(engagementApi, 'claimTask').mockRejectedValue(
      new Error('奖励服务暂时不可用'),
    );

    renderDashboard();
    fireEvent.click(
      await screen.findByRole('button', { name: '领取奖励' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '奖励服务暂时不可用',
    );
    expect(screen.getByText('收获作物')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '领取奖励' }),
    ).toBeEnabled();
  });

  it('shows a retryable initial load error', async () => {
    const tasksSpy = vi
      .spyOn(engagementApi, 'getTodayTasks')
      .mockRejectedValueOnce(new Error('任务接口不可用'))
      .mockResolvedValueOnce(TASKS);
    vi.spyOn(engagementApi, 'getRecentActivity').mockResolvedValue(ACTIVITY);

    renderDashboard();

    expect(await screen.findByRole('alert')).toHaveTextContent('任务接口不可用');
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }));
    expect(await screen.findByText('收获作物')).toBeInTheDocument();
    expect(tasksSpy).toHaveBeenCalledTimes(2);
  });
});
