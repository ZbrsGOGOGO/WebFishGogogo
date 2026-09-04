import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { ArcadeAdapterProvider, type ArcadeAdapter } from '../ArcadeAdapter';
import { ZhesiGamePage } from './ZhesiGamePage';

function adapter(): ArcadeAdapter & {
  startRun: ReturnType<typeof vi.fn>;
  finishRun: ReturnType<typeof vi.fn>;
} {
  return {
    signedIn: true,
    restoreSession: vi.fn(),
    startRun: vi.fn().mockResolvedValue({
      runId: '11111111-1111-4111-8111-111111111111',
      gameKey: 'zhesi',
      startedAt: '2026-09-04T08:00:00.000Z',
      expiresAt: '2026-09-04T10:00:00.000Z',
    }),
    finishRun: vi.fn().mockResolvedValue({
      gameKey: 'zhesi',
      score: 12_345,
      bestScore: 12_345,
      isPersonalBest: true,
      rank: 1,
    }),
    getLeaderboard: vi.fn().mockResolvedValue({
      gameKey: 'zhesi',
      formulaVersion: 'arcade-score-v1',
      items: [],
    }),
  };
}

describe('ZhesiGamePage', () => {
  it('embeds the audited game and bridges a completed life into an account run', async () => {
    const community = adapter();
    render(
      <MemoryRouter>
        <ArcadeAdapterProvider adapter={community}>
          <ZhesiGamePage />
        </ArcadeAdapterProvider>
      </MemoryRouter>,
    );

    const frame = screen.getByTitle('遮司命格模拟游戏') as HTMLIFrameElement;
    expect(frame).toHaveAttribute('src', '/games/zhengdao/index.html?embedded=1');
    expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin');
    fireEvent.load(frame);
    expect(screen.getByText('游戏已就绪')).toBeInTheDocument();

    window.dispatchEvent(new MessageEvent('message', {
      origin: window.location.origin,
      source: frame.contentWindow,
      data: { type: 'momo.zhesi.run.started' },
    }));
    expect(community.startRun).toHaveBeenCalledWith('zhesi');

    const metrics = {
      realm: 12,
      aptitude: 65,
      physiqueTier: 'T2',
      hasWeapon: false,
      selfBodyWeapon: false,
      zizhan: false,
      renyuKilled: false,
      renyuBoai: false,
      renyuTongzheng: false,
      tianDi: false,
      secondLife: false,
      immortalGate: false,
      age: 180,
      grade: '黄',
      mode: 'hard',
    };
    window.dispatchEvent(new MessageEvent('message', {
      origin: window.location.origin,
      source: frame.contentWindow,
      data: { type: 'momo.zhesi.run.finished', score: 12_385, metrics },
    }));

    await waitFor(() => expect(community.finishRun).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      12_385,
      metrics,
    ));
    expect(screen.getByText('此世已结算')).toBeInTheDocument();
  });

  it('ignores forged messages that do not come from the embedded frame', () => {
    const community = adapter();
    render(
      <MemoryRouter>
        <ArcadeAdapterProvider adapter={community}>
          <ZhesiGamePage />
        </ArcadeAdapterProvider>
      </MemoryRouter>,
    );
    window.dispatchEvent(new MessageEvent('message', {
      origin: window.location.origin,
      data: { type: 'momo.zhesi.run.started' },
    }));
    expect(community.startRun).not.toHaveBeenCalled();
  });
});
