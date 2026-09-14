import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWordFrontState, recruitWordFrontCards, replayWordFront, wordFrontHeroForLetters, type WordFrontAction } from '@stealth-reader/shared';

import { type CommunityAuthUser } from '../../../api/community';
import { finishArcadeRun, getArcadeLeaderboard, startArcadeRun } from '../../../api/community-arcade';
import { resetCommunityAuthStoreForTests, useCommunityAuthStore } from '../../../app/store/community-auth-store';
import { WordFrontPage } from './WordFrontPage';

vi.mock('../../../api/community-arcade', () => ({
  startArcadeRun: vi.fn(), finishArcadeRun: vi.fn(), getArcadeLeaderboard: vi.fn(),
}));

function user(publicId: string): CommunityAuthUser {
  return { id: publicId, publicId, email: `${publicId}@example.com`, displayName: publicId,
    accountStatus: 'active', onboardingCompleted: true, socialVerificationStatus: 'unverified' };
}

function openPage(): void {
  render(<MemoryRouter><WordFrontPage /></MemoryRouter>);
}

describe('WordFrontPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    window.localStorage.clear();
    resetCommunityAuthStoreForTests();
    useCommunityAuthStore.setState({ phase: 'active', user: user('member-a'), sessionReady: true, restoreSession: vi.fn() });
    vi.mocked(startArcadeRun).mockResolvedValue({ runId: 'run-a', gameKey: 'word_story', seed: 17,
      startedAt: '2026-09-14T00:00:00.000Z', expiresAt: '2026-09-14T02:00:00.000Z' });
    vi.mocked(getArcadeLeaderboard).mockResolvedValue({ gameKey: 'word_story', formulaVersion: 'word-front-v1', items: [] });
    vi.mocked(finishArcadeRun).mockResolvedValue({ gameKey: 'word_story', score: 0, bestScore: 0, isPersonalBest: false, rank: 1 });
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('keeps a clear original-tower exit and builds a seeded five-card team before combat', async () => {
    openPage();
    expect(screen.getByRole('heading', { name: '文字战线 · 赵云救阿斗' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '原工位塔防' })).toHaveAttribute('href', '/tower-defense');
    expect(screen.getByRole('button', { name: '开始防守' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: '开始防守' }));
    expect(screen.getByText('先组队并部署至少一位成员，再开始防守。')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '招募五张 · 10 点' }));
    await waitFor(() => expect(within(screen.getByRole('group', { name: '手中字卡' })).getAllByRole('button')).toHaveLength(5));
    expect(startArcadeRun).toHaveBeenCalledExactlyOnceWith('word_story');
    const drawn = recruitWordFrontCards(createWordFrontState('story', 1, 17));
    let first = 0, second = 1;
    outer: for (let i = 0; i < drawn.hand.length; i += 1) for (let j = i + 1; j < drawn.hand.length; j += 1) {
      if (wordFrontHeroForLetters(drawn.hand[i]!, drawn.hand[j]!)) { first = i; second = j; break outer; }
    }
    const cards = within(screen.getByRole('group', { name: '手中字卡' })).getAllByRole('button');
    fireEvent.click(cards[first]!); fireEvent.click(cards[second]!);
    fireEvent.click(screen.getByRole('button', { name: '1行1列，空白工位' }));
    expect(screen.getByRole('group', { name: '文字战线路线图' })).toHaveTextContent(/赵云|关羽|张飞|诸葛/);
    fireEvent.click(screen.getByRole('button', { name: '开始防守' }));
    expect(screen.getByText(/第一波来袭/)).toBeInTheDocument();
    expect(startArcadeRun).toHaveBeenCalledTimes(1);
  });

  it('separates story and endless drafts and never lets the next account see the previous hand', async () => {
    openPage();
    fireEvent.click(screen.getByRole('button', { name: '招募五张 · 10 点' }));
    await waitFor(() => expect(within(screen.getByRole('group', { name: '手中字卡' })).getAllByRole('button')).toHaveLength(5));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(screen.getByRole('button', { name: '无尽值班' }));
    expect(within(screen.getByRole('group', { name: '手中字卡' })).getAllByRole('button')).toHaveLength(5);
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: '无尽值班' }));
    expect(screen.getByText('还没有字卡，先招募一次。')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '剧情护送' }));
    expect(within(screen.getByRole('group', { name: '手中字卡' })).getAllByRole('button')).toHaveLength(5);
    await act(async () => useCommunityAuthStore.setState({ phase: 'active', user: user('member-b'), sessionReady: true }));
    expect(screen.getByText('还没有字卡，先招募一次。')).toBeInTheDocument();
    expect(window.localStorage.getItem('momo.word-front.v1.member-b.story')).not.toContain('"hand":["');
  });

  it('does not start or load a private draft when the signed-in account id is absent', () => {
    useCommunityAuthStore.setState({ phase: 'active', user: { ...user('member-a'), publicId: '' } });
    openPage();
    expect(screen.getByRole('link', { name: '前往登录' })).toHaveAttribute('href', '/login');
    expect(startArcadeRun).not.toHaveBeenCalled();
  });

  it('gives a guest a clear login path instead of an endless loading message', () => {
    useCommunityAuthStore.setState({ phase: 'guest', user: null, sessionReady: true });
    openPage();
    expect(screen.getByRole('link', { name: '前往登录' })).toHaveAttribute('href', '/login');
    expect(screen.queryByText('正在核对账号，暂不载入本机对局。')).not.toBeInTheDocument();
    expect(startArcadeRun).not.toHaveBeenCalled();
  });

  it('keeps a missing server seed playable only as an unranked local draft', async () => {
    vi.mocked(startArcadeRun).mockResolvedValue({ runId: 'unseeded', gameKey: 'word_story',
      startedAt: '2026-09-14T00:00:00.000Z', expiresAt: '2026-09-14T02:00:00.000Z' });
    openPage();
    fireEvent.click(screen.getByRole('button', { name: '招募五张 · 10 点' }));
    await waitFor(() => expect(within(screen.getByRole('group', { name: '手中字卡' })).getAllByRole('button')).toHaveLength(5));
    expect(screen.getByText(/本机草稿，不会提交在线榜/)).toBeInTheDocument();
  });

  it('never submits a legacy trace against a mistakenly returned v2 rules seed', async () => {
    vi.mocked(startArcadeRun).mockResolvedValue({ runId: 'wrong-rules', gameKey: 'word_story', rulesVersion: 2, seed: 17,
      startedAt: '2026-09-14T00:00:00.000Z', expiresAt: '2026-09-14T02:00:00.000Z' });
    openPage();
    fireEvent.click(screen.getByRole('button', { name: '招募五张 · 10 点' }));
    await waitFor(() => expect(screen.getByText(/本机草稿，不会提交在线榜/)).toBeInTheDocument());
    expect(finishArcadeRun).not.toHaveBeenCalled();
  });

  it('drops a late seed response after switching from account A to account B', async () => {
    let resolveRun!: (run: Awaited<ReturnType<typeof startArcadeRun>>) => void;
    vi.mocked(startArcadeRun).mockReturnValue(new Promise(resolve => { resolveRun = resolve; }));
    openPage();
    fireEvent.click(screen.getByRole('button', { name: '招募五张 · 10 点' }));
    expect(screen.getByRole('button', { name: '正在建立可验证对局…' })).toBeDisabled();
    await act(async () => useCommunityAuthStore.setState({ phase: 'active', user: user('member-b'), sessionReady: true }));
    await act(async () => resolveRun({ runId: 'late-a', gameKey: 'word_story', seed: 17,
      startedAt: '2026-09-14T00:00:00.000Z', expiresAt: '2026-09-14T02:00:00.000Z' }));
    expect(screen.getByText('还没有字卡，先招募一次。')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: '手中字卡' })).queryAllByRole('button')).toHaveLength(0);
  });

  it('submits an actual finished UI run with actions that replay to exactly the same score', async () => {
    openPage();
    fireEvent.click(screen.getByRole('button', { name: '招募五张 · 10 点' }));
    await waitFor(() => expect(within(screen.getByRole('group', { name: '手中字卡' })).getAllByRole('button')).toHaveLength(5));
    const drawn = recruitWordFrontCards(createWordFrontState('story', 1, 17));
    let first = 0, second = 1;
    outer: for (let i = 0; i < drawn.hand.length; i += 1) for (let j = i + 1; j < drawn.hand.length; j += 1) {
      if (wordFrontHeroForLetters(drawn.hand[i]!, drawn.hand[j]!)) { first = i; second = j; break outer; }
    }
    const cards = within(screen.getByRole('group', { name: '手中字卡' })).getAllByRole('button');
    fireEvent.click(cards[first]!); fireEvent.click(cards[second]!);
    fireEvent.click(screen.getByRole('button', { name: '1行1列，空白工位' }));
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: '开始防守' }));
    act(() => vi.advanceTimersByTime(180_000));
    vi.useRealTimers();
    await waitFor(() => expect(finishArcadeRun).toHaveBeenCalledTimes(1));
    const [runId, score, metrics] = vi.mocked(finishArcadeRun).mock.calls[0]!;
    expect(runId).toBe('run-a');
    expect(metrics).toMatchObject({ mode: 'story', chapter: 1, outcome: expect.stringMatching(/won|lost/) });
    const replayed = replayWordFront('story', 1, 17, metrics.actions as WordFrontAction[], metrics.finishTick as number);
    expect(replayed).not.toBeNull();
    expect(score).toBe(replayed!.score);
    expect(metrics).toMatchObject({ wave: replayed!.completedWaves, kills: replayed!.kills, coreHp: replayed!.coreHp, drawCount: replayed!.drawCount });
  });

  it('pauses without hidden ticks and a restart obtains a fresh online seed without finishing the abandoned run', async () => {
    openPage();
    fireEvent.click(screen.getByRole('button', { name: '招募五张 · 10 点' }));
    await waitFor(() => expect(within(screen.getByRole('group', { name: '手中字卡' })).getAllByRole('button')).toHaveLength(5));
    const drawn = recruitWordFrontCards(createWordFrontState('story', 1, 17));
    let first = 0, second = 1;
    outer: for (let i = 0; i < drawn.hand.length; i += 1) for (let j = i + 1; j < drawn.hand.length; j += 1) {
      if (wordFrontHeroForLetters(drawn.hand[i]!, drawn.hand[j]!)) { first = i; second = j; break outer; }
    }
    const cards = within(screen.getByRole('group', { name: '手中字卡' })).getAllByRole('button');
    fireEvent.click(cards[first]!); fireEvent.click(cards[second]!);
    fireEvent.click(screen.getByRole('button', { name: '1行1列，空白工位' }));
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: '开始防守' }));
    act(() => vi.advanceTimersByTime(2_550));
    fireEvent.click(screen.getByRole('button', { name: '暂停 / Esc' }));
    const savedBefore = JSON.parse(window.localStorage.getItem('momo.word-front.v1.member-a.story')!) as { tick: number };
    act(() => vi.advanceTimersByTime(8_500));
    const savedAfter = JSON.parse(window.localStorage.getItem('momo.word-front.v1.member-a.story')!) as { tick: number };
    expect(savedAfter.tick).toBe(savedBefore.tick);
    expect(finishArcadeRun).not.toHaveBeenCalled();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: '新开一局' }));
    expect(screen.getByText('还没有字卡，先招募一次。')).toBeInTheDocument();
    vi.useRealTimers();
    vi.mocked(startArcadeRun).mockResolvedValue({ runId: 'run-b', gameKey: 'word_story', seed: 33,
      startedAt: '2026-09-14T00:10:00.000Z', expiresAt: '2026-09-14T02:10:00.000Z' });
    fireEvent.click(screen.getByRole('button', { name: '招募五张 · 10 点' }));
    await waitFor(() => expect(startArcadeRun).toHaveBeenCalledTimes(2));
    expect(finishArcadeRun).not.toHaveBeenCalled();
  });
});
