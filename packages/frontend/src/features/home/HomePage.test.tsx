import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  hasReadingEngagementPending,
  markReadingEngagementPending,
} from '../../app/engagement-sync';
import { HomePage } from './HomePage';

vi.mock('../../api/farm', () => ({
  farmApi: {
    getFarm: vi.fn().mockResolvedValue({
      serverTime: '2026-07-24T01:00:00.000Z',
      onboarding: {
        stage: 'choose_plot',
        quickGrowAvailable: true,
        quickGrowSeconds: 30,
        firstHarvestCompleted: false,
        firstHarvestBonusFarmExp: 40,
      },
      farm: { level: 1, experience: 0, expToNextLevel: 50, plotCount: 4 },
      assets: { water: 4, sunlight: 0, fertilizer: 0 },
      inventory: { wheatSeed: 4, strawberrySeed: 2, coffeeSeed: 1 },
      crops: [],
      plots: [],
    }),
  },
}));

vi.mock('../platform', () => ({
  PlatformOverviewCard: ({
    refreshKey,
  }: {
    refreshKey: number;
  }) => <div data-testid="overview" data-refresh-key={refreshKey} />,
  EngagementDashboard: ({
    refreshKey,
    readingSyncPending,
  }: {
    refreshKey: number;
    readingSyncPending: boolean;
  }) => (
    <div
      data-testid="engagement"
      data-refresh-key={refreshKey}
      data-reading-pending={String(readingSyncPending)}
    />
  ),
}));

describe('HomePage reading engagement synchronization', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    window.sessionStorage.clear();
  });

  it('shows pending state, waits for the worker and refreshes daily tasks', async () => {
    markReadingEngagementPending();

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('engagement')).toHaveAttribute(
      'data-reading-pending',
      'true',
    );
    expect(screen.getByTestId('engagement')).toHaveAttribute(
      'data-refresh-key',
      '0',
    );
    expect(hasReadingEngagementPending()).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(1_200);
      await Promise.resolve();
    });

    expect(screen.getByTestId('engagement')).toHaveAttribute(
      'data-reading-pending',
      'false',
    );
    expect(screen.getByTestId('engagement')).toHaveAttribute(
      'data-refresh-key',
      '1',
    );
    expect(hasReadingEngagementPending()).toBe(false);
  });

  it('also refreshes when an ending reading request completes after mount', async () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('engagement')).toHaveAttribute(
      'data-reading-pending',
      'false',
    );

    act(() => {
      markReadingEngagementPending();
    });
    expect(screen.getByTestId('engagement')).toHaveAttribute(
      'data-reading-pending',
      'true',
    );

    await act(async () => {
      vi.advanceTimersByTime(1_200);
      await Promise.resolve();
    });
    expect(screen.getByTestId('engagement')).toHaveAttribute(
      'data-refresh-key',
      '1',
    );
    expect(screen.getByTestId('engagement')).toHaveAttribute(
      'data-reading-pending',
      'false',
    );
  });

  it('把三分钟路线放在四个系统与成长面板之前', async () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText('30 秒种下并收获第一株')).toBeInTheDocument();
    const systemLinks = [
      screen.getByRole('link', { name: '进入阅读系统' }),
      screen.getByRole('link', { name: '进入工具系统' }),
      screen.getByRole('link', { name: '进入农场系统' }),
      screen.getByRole('link', { name: '进入小游戏系统' }),
    ];
    const overview = screen.getByTestId('overview');
    const firstPlayTitle = screen.getByRole('heading', {
      name: '先完成一条有结果的短循环',
    });

    for (const link of systemLinks) {
      expect(
        firstPlayTitle.compareDocumentPosition(link) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        link.compareDocumentPosition(overview) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    expect(screen.queryByText(/每页默认字符数/)).not.toBeInTheDocument();
    expect(screen.getByText('30 秒首收')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '去农场' })).toHaveAttribute(
      'href',
      '/farm',
    );
    expect(screen.getByText('农场 Lv.2 · 咖啡豆')).toBeInTheDocument();
  });
});
