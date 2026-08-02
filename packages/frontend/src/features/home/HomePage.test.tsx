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

  it('places the four product systems before growth and removes prototype copy', () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    const systemLinks = [
      screen.getByRole('link', { name: '进入阅读系统' }),
      screen.getByRole('link', { name: '进入工具系统' }),
      screen.getByRole('link', { name: '进入农场系统' }),
      screen.getByRole('link', { name: '进入小游戏系统' }),
    ];
    const overview = screen.getByTestId('overview');

    for (const link of systemLinks) {
      expect(
        link.compareDocumentPosition(overview) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    expect(screen.queryByText(/每页默认字符数/)).not.toBeInTheDocument();
    expect(screen.getByText('单机版已就绪')).toBeInTheDocument();
  });
});
