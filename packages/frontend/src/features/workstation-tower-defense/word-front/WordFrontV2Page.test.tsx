import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { replayWordFrontV2, type WordFrontV2Action } from '@stealth-reader/shared';
import { type CommunityAuthUser } from '../../../api/community';
import { finishArcadeRun, getArcadeLeaderboard, startArcadeRun } from '../../../api/community-arcade';
import { resetCommunityAuthStoreForTests, useCommunityAuthStore } from '../../../app/store/community-auth-store';
import { WordFrontV2Page } from './WordFrontV2Page';

vi.mock('../../../api/community-arcade', () => ({ startArcadeRun: vi.fn(), finishArcadeRun: vi.fn(), getArcadeLeaderboard: vi.fn() }));
function user(publicId: string): CommunityAuthUser {
  return { id: publicId, publicId, email: `${publicId}@example.com`, displayName: publicId,
    accountStatus: 'active', onboardingCompleted: true, socialVerificationStatus: 'unverified' };
}
function page(): void { render(<MemoryRouter><WordFrontV2Page /></MemoryRouter>); }

describe('WordFrontV2Page', () => {
  beforeEach(() => {
    vi.resetAllMocks(); window.localStorage.clear(); resetCommunityAuthStoreForTests();
    useCommunityAuthStore.setState({ phase: 'active', user: user('member-a'), sessionReady: true, restoreSession: vi.fn() });
    vi.mocked(startArcadeRun).mockResolvedValue({ runId: 'run-v2', gameKey: 'word_story_v2', rulesVersion: 2, chapter: 1, seed: 17,
      startedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 2 * 60 * 60_000).toISOString() });
    vi.mocked(getArcadeLeaderboard).mockResolvedValue({ gameKey: 'word_story_v2', formulaVersion: 'word-front-v2', items: [] });
    vi.mocked(finishArcadeRun).mockResolvedValue({ gameKey: 'word_story_v2', score: 0, bestScore: 0, isPersonalBest: false, rank: 1 });
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('keeps the play board before recruitment/ranking on mobile and gives cards distinct spoken positions', async () => {
    page();
    const boardPanel = screen.getByLabelText('文字战线对局');
    const recruitPanel = screen.getByLabelText('招募与编队');
    const rankingPanel = screen.getByLabelText('文字战线成绩与规则');
    expect(boardPanel.compareDocumentPosition(recruitPanel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(recruitPanel.compareDocumentPosition(rankingPanel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const css = readFileSync(resolve(process.cwd(), 'src/features/workstation-tower-defense/word-front/WordFrontV2Page.module.css'), 'utf8');
    expect(css).toContain('.boardViewport{max-width:100%;overflow-x:auto}');
    expect(css).toContain('.mainPanel,.sidePanel,.rankingPanel{grid-column:auto;grid-row:auto}');
    expect(css).toContain('.board{min-width:440px;gap:3px;padding:4px}');
    // 440px board, 4px inner padding, 3px gaps and borders: about 51px per cell.
    expect((440 - 8 - 2 - 7 * 3) / 8).toBeGreaterThanOrEqual(44);
    fireEvent.click(screen.getByRole('button', { name: '招募五张 · 10 点' }));
    await waitFor(() => expect(within(screen.getByRole('group', { name: '手中字卡' })).getAllByRole('button').length).toBeGreaterThanOrEqual(4));
    const labels = within(screen.getByRole('group', { name: '手中字卡' })).getAllByRole('button').map(button => button.getAttribute('aria-label'));
    labels.forEach((label, index) => expect(label).toMatch(new RegExp(`^第 ${index + 1} 张字卡：.`)));
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('shows six chapters, a legacy draft route, a separate v2 leaderboard and explicitly requests rules v2', async () => {
    page();
    expect(screen.getByRole('link', { name: '旧版草稿' })).toHaveAttribute('href', '/tower-defense/word-front/legacy');
    expect(screen.getByText(/窄屏可横向滑动地图/)).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(6);
    expect(screen.getByRole('button', { name: '剧情护送' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('得分')).toBeInTheDocument();
    expect(getArcadeLeaderboard).toHaveBeenCalledWith('word_story_v2');
    fireEvent.click(screen.getByRole('button', { name: '招募五张 · 10 点' }));
    await waitFor(() => expect(within(screen.getByRole('group', { name: '手中字卡' })).getAllByRole('button').length).toBeGreaterThanOrEqual(4));
    expect(startArcadeRun).toHaveBeenCalledExactlyOnceWith('word_story_v2', 2, 1);
    const cards = within(screen.getByRole('group', { name: '手中字卡' })).getAllByRole('button');
    fireEvent.click(cards[0]!); fireEvent.click(cards[1]!);
    fireEvent.click(screen.getByRole('button', { name: '1行1列，空白工位' }));
    expect(screen.getByRole('button', { name: /1行1列，(赵云|关羽|张飞|黄忠|马超)1阶/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /1行1列，(赵云|关羽|张飞|黄忠|马超)1阶/ }));
    expect(screen.getByRole('button', { name: /1行1列，(赵云|关羽|张飞|黄忠|马超)1阶/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps endless mode and its leaderboard isolated from story', async () => {
    vi.mocked(startArcadeRun).mockResolvedValue({ runId: 'run-endless-v2', gameKey: 'word_endless_v2', rulesVersion: 2, chapter: 1, seed: 17,
      startedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 2 * 60 * 60_000).toISOString() });
    page(); fireEvent.click(screen.getByRole('button', { name: '无尽守卫' }));
    expect(screen.getByRole('button', { name: '无尽守卫' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(getArcadeLeaderboard).toHaveBeenCalledWith('word_endless_v2'));
    fireEvent.click(screen.getByRole('button', { name: '招募五张 · 10 点' }));
    await waitFor(() => expect(startArcadeRun).toHaveBeenCalledWith('word_endless_v2', 2, 1));
  });

  it('uses the chapter bound to a reused online run and ignores a late response after account switch', async () => {
    let resolveRun!: (run: Awaited<ReturnType<typeof startArcadeRun>>) => void;
    vi.mocked(startArcadeRun).mockReturnValue(new Promise(resolve => { resolveRun = resolve; }));
    page();
    fireEvent.change(screen.getByRole('combobox', { name: '章节' }), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: '招募五张 · 10 点' }));
    expect(startArcadeRun).toHaveBeenCalledWith('word_story_v2', 2, 2);
    await act(async () => resolveRun({ runId: 'old-chapter', gameKey: 'word_story_v2', rulesVersion: 2, chapter: 1, seed: 17,
      startedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 2 * 60 * 60_000).toISOString() }));
    expect(screen.getByText(/本局固定第 1 章/)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: '章节' })).toHaveValue('1');

    vi.mocked(startArcadeRun).mockReturnValue(new Promise(resolve => { resolveRun = resolve; }));
    fireEvent.click(screen.getByRole('button', { name: '新开一局' }));
    fireEvent.click(screen.getByRole('button', { name: '招募五张 · 10 点' }));
    await act(async () => useCommunityAuthStore.setState({ phase: 'active', user: user('member-b'), sessionReady: true }));
    await act(async () => resolveRun({ runId: 'late-a', gameKey: 'word_story_v2', rulesVersion: 2, chapter: 1, seed: 18,
      startedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 2 * 60 * 60_000).toISOString() }));
    expect(screen.getByText('暂无字卡，先招募一次。')).toBeInTheDocument();
    expect(window.localStorage.getItem('momo.word-front.v2.member-b.story')).not.toContain('"hand":["');
  });

  it('keeps a v2 game local when an old API ignores the version request', async () => {
    vi.mocked(startArcadeRun).mockResolvedValue({ runId: 'old-api', gameKey: 'word_story_v2', seed: 17,
      startedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 2 * 60 * 60_000).toISOString() });
    page();
    fireEvent.click(screen.getByRole('button', { name: '招募五张 · 10 点' }));
    await waitFor(() => expect(screen.getByText(/不提交排行榜/)).toBeInTheDocument());
    expect(finishArcadeRun).not.toHaveBeenCalled();
  });

  it('keeps a v2 game local when an old API rejects the new game key', async () => {
    vi.mocked(startArcadeRun).mockRejectedValue(new Error('ARCADE_GAME_INVALID'));
    page();
    fireEvent.click(screen.getByRole('button', { name: '招募五张 · 10 点' }));
    await waitFor(() => expect(screen.getByText(/不提交排行榜/)).toBeInTheDocument());
    expect(within(screen.getByRole('group', { name: '手中字卡' })).getAllByRole('button').length).toBeGreaterThanOrEqual(4);
    expect(finishArcadeRun).not.toHaveBeenCalled();
  });

  it('does not promise a ranked game when a reused run has under five minutes left', async () => {
    vi.mocked(startArcadeRun).mockResolvedValue({ runId: 'nearly-expired', gameKey: 'word_story_v2', rulesVersion: 2, chapter: 1, seed: 17,
      startedAt: new Date(Date.now() - 115 * 60_000).toISOString(), expiresAt: new Date(Date.now() + 4 * 60_000).toISOString() });
    page(); fireEvent.click(screen.getByRole('button', { name: '招募五张 · 10 点' }));
    await waitFor(() => expect(screen.getByText(/不提交排行榜/)).toBeInTheDocument());
    expect(finishArcadeRun).not.toHaveBeenCalled();
  });

  it('submits a real terminal UI trace that the v2 engine replays exactly', async () => {
    page(); fireEvent.click(screen.getByRole('button', { name: '招募五张 · 10 点' }));
    await waitFor(() => expect(within(screen.getByRole('group', { name: '手中字卡' })).getAllByRole('button').length).toBeGreaterThanOrEqual(4));
    const cards = within(screen.getByRole('group', { name: '手中字卡' })).getAllByRole('button');
    fireEvent.click(cards[0]!); fireEvent.click(cards[1]!);
    fireEvent.click(screen.getByRole('button', { name: '1行1列，空白工位' }));
    vi.useFakeTimers(); fireEvent.click(screen.getByRole('button', { name: '开始防守' }));
    act(() => vi.advanceTimersByTime(180_000)); vi.useRealTimers();
    await waitFor(() => expect(finishArcadeRun).toHaveBeenCalledTimes(1));
    const [, score, metrics] = vi.mocked(finishArcadeRun).mock.calls[0]!;
    const replay = replayWordFrontV2('story', 1, 17, metrics.actions as WordFrontV2Action[], metrics.finishTick as number);
    expect(replay).not.toBeNull(); expect(score).toBe(replay!.score);
    expect(metrics).toMatchObject({ wave: replay!.completedWaves, kills: replay!.kills, coreHp: replay!.coreHp, drawCount: replay!.drawCount });
  });
});
