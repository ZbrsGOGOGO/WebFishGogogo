import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ArcadeLeaderboard } from './ArcadeLeaderboard';
import {
  ArcadeAdapterProvider,
  type ArcadeAdapter,
} from './ArcadeAdapter';
import { useArcadeRun } from './useArcadeRun';

function adapter(overrides: Partial<ArcadeAdapter> = {}): ArcadeAdapter {
  return {
    signedIn: true,
    restoreSession: vi.fn(),
    startRun: vi.fn().mockResolvedValue({
      runId: 'run-1',
      gameKey: 'tetris',
      startedAt: '2026-09-04T00:00:00.000Z',
      expiresAt: '2026-09-04T00:10:00.000Z',
    }),
    finishRun: vi.fn().mockResolvedValue({
      gameKey: 'tetris',
      score: 1200,
      bestScore: 1200,
      isPersonalBest: true,
      rank: 2,
    }),
    getLeaderboard: vi.fn().mockResolvedValue({
      gameKey: 'tetris',
      formulaVersion: 'v1',
      items: [{
        rank: 1,
        publicId: 'player-1',
        displayName: '方块同事',
        score: 1800,
        achievedAt: '2026-09-04T00:00:00.000Z',
      }],
    }),
    ...overrides,
  };
}

function ArcadeRunHarness() {
  const arcade = useArcadeRun('tetris');
  return (
    <div>
      <button type="button" onClick={arcade.begin}>开始本局</button>
      <button type="button" onClick={() => void arcade.finish(1200, { lines: 8 })}>结束本局</button>
      {arcade.notice ? <p role="status">{arcade.notice}</p> : null}
    </div>
  );
}

describe('optional arcade adapter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders a purely local public state without login copy or online calls', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    render(
      <MemoryRouter>
        <ArcadeLeaderboard gameKey="tetris" />
      </MemoryRouter>,
    );

    expect(screen.getByText('本机挑战')).toBeInTheDocument();
    expect(screen.getByText(/本局成绩不上传/)).toBeInTheDocument();
    expect(screen.queryByText('登录')).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('restores a community session and loads its injected leaderboard', async () => {
    const community = adapter({ signedIn: false });
    render(
      <MemoryRouter>
        <ArcadeAdapterProvider adapter={community}>
          <ArcadeLeaderboard gameKey="tetris" />
        </ArcadeAdapterProvider>
      </MemoryRouter>,
    );

    expect(community.restoreSession).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: '登录' })).toHaveAttribute('href', '/login');
    expect(await screen.findByText('方块同事')).toBeInTheDocument();
    expect(screen.getByText('1,800 分')).toBeInTheDocument();
    expect(community.getLeaderboard).toHaveBeenCalledWith('tetris');
  });

  it('starts and finishes through the injected adapter without changing game-page APIs', async () => {
    const community = adapter();
    render(
      <ArcadeAdapterProvider adapter={community}>
        <ArcadeRunHarness />
      </ArcadeAdapterProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: '开始本局' }));
    fireEvent.click(screen.getByRole('button', { name: '结束本局' }));

    await waitFor(() => expect(community.finishRun).toHaveBeenCalledWith(
      'run-1',
      1200,
      { lines: 8 },
    ));
    expect(community.startRun).toHaveBeenCalledWith('tetris');
    expect(await screen.findByText('新纪录！当前排名第 2 名。')).toBeInTheDocument();
  });
});
