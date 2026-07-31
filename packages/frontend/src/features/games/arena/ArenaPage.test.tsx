import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  arenaApi,
  type ArenaBattleResult,
  type ArenaBootstrap,
} from '../../../api/arena';
import { ArenaPage } from './ArenaPage';

const BOOTSTRAP: ArenaBootstrap = {
  serverTime: '2026-07-24T02:00:00.000Z',
  unlocked: true,
  unlockLevel: 3,
  profile: {
    level: 15,
    title: '准职业打工人',
    energy: 8,
    energyCap: 15,
    battleClass: '产品经理',
    attributes: {
      focus: 28,
      inspiration: 24,
      mindset: 36,
      slacking: 31,
      execution: 27,
    },
  },
  offers: [
    {
      id: 'easy-1',
      tier: 'easy',
      opponentName: '摸鱼实习生',
      opponentLevel: 13,
      power: 820,
      expiresAt: '2026-07-24T02:10:00.000Z',
    },
    {
      id: 'even-1',
      tier: 'even',
      opponentName: '需求评审员',
      opponentLevel: 15,
      power: 1050,
      expiresAt: '2026-07-24T02:10:00.000Z',
    },
    {
      id: 'risky-1',
      tier: 'risky',
      opponentName: '周五上线负责人',
      opponentLevel: 18,
      power: 1420,
      expiresAt: '2026-07-24T02:10:00.000Z',
    },
  ],
  recentBattles: [
    {
      id: 'previous-battle',
      result: 'loss',
      opponentName: '周报审阅人',
      createdAt: '2026-07-23T07:30:00.000Z',
    },
  ],
};

const BATTLE_RESULT: ArenaBattleResult = {
  battle: {
    id: 'battle-1',
    winnerSide: 'player',
    result: 'win',
    roundsPlayed: 3,
    logs: [
      '第 1 回合：你发动「需求重排」，对方输出降低。',
      { round: 2, text: '对手使用「代码提交」，造成稳定伤害。' },
      { round: 3, text: '你守住了下班前最后的平静。' },
    ],
  },
  reward: {
    experience: 18,
    currencies: { officeCoin: 12 },
  },
  energy: 7,
};

describe('ArenaPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('未达到等级时展示锁定状态', async () => {
    vi.spyOn(arenaApi, 'getBootstrap').mockResolvedValue({
      ...BOOTSTRAP,
      unlocked: false,
      profile: { ...BOOTSTRAP.profile, level: 2 },
      offers: [],
    });

    render(<ArenaPage />);

    expect(screen.getByRole('status')).toHaveTextContent('正在加载斗技场');
    expect(
      await screen.findByRole('heading', { name: 'Lv.3 解锁' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/当前 Lv.2/)).toBeInTheDocument();
  });

  it('展示角色属性和三档对手，默认选择均势对手', async () => {
    vi.spyOn(arenaApi, 'getBootstrap').mockResolvedValue(BOOTSTRAP);

    render(<ArenaPage />);

    expect(await screen.findByText('准职业打工人')).toBeInTheDocument();
    expect(screen.getByText('8 / 15')).toBeInTheDocument();
    expect(screen.getByLabelText('可挑战对手').children).toHaveLength(3);
    expect(
      screen.getByRole('button', { name: /需求评审员/ }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('专注')).toBeInTheDocument();
    expect(screen.getByText('执行')).toBeInTheDocument();
    expect(screen.getByText('最近战绩')).toBeInTheDocument();
    expect(screen.getByText('周报审阅人')).toBeInTheDocument();
  });

  it('职业为空时显示综合型，不暴露未完成占位', async () => {
    vi.spyOn(arenaApi, 'getBootstrap').mockResolvedValue({
      ...BOOTSTRAP,
      profile: { ...BOOTSTRAP.profile, battleClass: '   ' },
    });

    render(<ArenaPage />);

    expect(await screen.findByText('Lv.15 · 综合型')).toBeInTheDocument();
  });

  it('精力不足时禁用挑战并提供农场补充入口', async () => {
    vi.spyOn(arenaApi, 'getBootstrap').mockResolvedValue({
      ...BOOTSTRAP,
      profile: { ...BOOTSTRAP.profile, energy: 0 },
    });

    render(<ArenaPage />);

    expect(
      await screen.findByRole('button', { name: '精力不足' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('link', { name: '去农场收获咖啡补充精力' }),
    ).toHaveAttribute('href', '/farm');
  });

  it('本轮倒计时结束后自动刷新对手', async () => {
    vi.useFakeTimers();
    const serverTime = new Date('2026-07-24T02:00:00.000Z');
    vi.setSystemTime(serverTime);

    const expiringBootstrap: ArenaBootstrap = {
      ...BOOTSTRAP,
      serverTime: serverTime.toISOString(),
      offers: BOOTSTRAP.offers.map((offer) => ({
        ...offer,
        expiresAt: new Date(serverTime.getTime() + 2_000).toISOString(),
      })),
    };
    const refreshedBootstrap: ArenaBootstrap = {
      ...BOOTSTRAP,
      serverTime: new Date(serverTime.getTime() + 2_000).toISOString(),
      offers: [
        {
          ...BOOTSTRAP.offers[1],
          id: 'fresh-even',
          opponentName: '新一轮评审员',
          expiresAt: new Date(serverTime.getTime() + 602_000).toISOString(),
        },
      ],
    };
    const bootstrapSpy = vi
      .spyOn(arenaApi, 'getBootstrap')
      .mockResolvedValueOnce(expiringBootstrap)
      .mockResolvedValueOnce(refreshedBootstrap);

    render(<ArenaPage />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText('刷新倒计时 00:02')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(bootstrapSpy).toHaveBeenCalledTimes(2);
    expect(screen.getByText('新一轮评审员')).toBeInTheDocument();
  });

  it('可以切换对手并开始较量，显示战报和奖励后刷新', async () => {
    const bootstrapSpy = vi
      .spyOn(arenaApi, 'getBootstrap')
      .mockResolvedValue(BOOTSTRAP);
    const battleSpy = vi
      .spyOn(arenaApi, 'startBattle')
      .mockResolvedValue(BATTLE_RESULT);

    render(<ArenaPage />);
    fireEvent.click(
      await screen.findByRole('button', { name: /周五上线负责人/ }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: '消耗 1 精力开始较量' }),
    );

    await waitFor(() =>
      expect(battleSpy).toHaveBeenCalledWith('risky-1'),
    );
    expect(
      await screen.findByRole('dialog', { name: '较量胜利' }),
    ).toBeInTheDocument();
    expect(screen.getByText('+18 EXP')).toBeInTheDocument();
    expect(screen.getByText('+12 办公币')).toBeInTheDocument();
    expect(
      screen.getByText(/对手使用「代码提交」/),
    ).toBeInTheDocument();
    expect(bootstrapSpy).toHaveBeenCalledTimes(2);
  });

  it('加载失败时展示错误并允许重试', async () => {
    const bootstrapSpy = vi
      .spyOn(arenaApi, 'getBootstrap')
      .mockRejectedValueOnce(new Error('斗技服务暂时不可用'))
      .mockResolvedValueOnce(BOOTSTRAP);

    render(<ArenaPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '斗技服务暂时不可用',
    );
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }));

    expect(await screen.findByText('准职业打工人')).toBeInTheDocument();
    expect(bootstrapSpy).toHaveBeenCalledTimes(2);
  });

  it('战斗失败时保留对手并显示独立错误', async () => {
    vi.spyOn(arenaApi, 'getBootstrap').mockResolvedValue(BOOTSTRAP);
    vi.spyOn(arenaApi, 'startBattle').mockRejectedValue(
      new Error('精力不足'),
    );

    render(<ArenaPage />);
    fireEvent.click(
      await screen.findByRole('button', {
        name: '消耗 1 精力开始较量',
      }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('精力不足');
    expect(screen.getByText('已选择：需求评审员')).toBeInTheDocument();
  });

  it('战斗后刷新失败时保留结果和旧数据，并提供重新同步入口', async () => {
    const bootstrapSpy = vi
      .spyOn(arenaApi, 'getBootstrap')
      .mockResolvedValueOnce(BOOTSTRAP)
      .mockRejectedValueOnce(new Error('同步超时'))
      .mockResolvedValueOnce(BOOTSTRAP);
    vi.spyOn(arenaApi, 'startBattle').mockResolvedValue(BATTLE_RESULT);

    render(<ArenaPage />);
    fireEvent.click(
      await screen.findByRole('button', {
        name: '消耗 1 精力开始较量',
      }),
    );

    expect(
      await screen.findByRole('dialog', { name: '较量胜利' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      '最新状态刷新失败',
    );
    expect(screen.getByText('准职业打工人')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '重新同步' }));
    await waitFor(() => expect(bootstrapSpy).toHaveBeenCalledTimes(3));
    await waitFor(() =>
      expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
    );
  });
});
