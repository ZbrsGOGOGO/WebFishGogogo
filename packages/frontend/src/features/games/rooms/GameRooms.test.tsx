import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { JSX } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArcadeGameView, PlayCatalog, PlayRoomView } from '@stealth-reader/shared';

import type { CommunityAuthUser } from '../../../api/community';
import { communityGameRoomsApi } from '../../../api/community-game-rooms';
import { CommunityApiError, setCommunitySessionTokens } from '../../../api/community-http';
import { resetCommunityAuthStoreForTests, useCommunityAuthStore } from '../../../app/store/community-auth-store';
import { ArcadeGameSurface } from './ArcadeGameSurface';
import { CommunityGamesPage } from './CommunityGamesPage';
import { CommunityGameRoomsPage } from './CommunityGameRoomsPage';
import { CommunityGameRoomPage } from './CommunityGameRoomPage';
import { CommunityGameLeaderboardPage } from './CommunityGameLeaderboardPage';
import { CommunityGameWorkspaceLayout } from './CommunityGameWorkspaceLayout';
import { CommunityLeaderboardsPage } from './CommunityLeaderboardsPage';
import { usePlayRoom } from './usePlayRoom';
import { GAME_NAMES } from './play-ui-state';
import { SnakeGamePage } from '../snake/SnakeGamePage';
import { TetrisGamePage } from '../tetris/TetrisGamePage';
import { TankBattlePage } from '../tank/TankBattlePage';

const user: CommunityAuthUser = { id: 'player-1', publicId: 'player-1', email: 'game-test@users.invalid', displayName: '当前玩家', accountStatus: 'active', onboardingCompleted: true, socialVerificationStatus: 'verified', battleProfession: 'developer' };
const catalog: PlayCatalog = {
  games: (Object.keys(GAME_NAMES) as Array<keyof typeof GAME_NAMES>).map((gameKey) => ({ gameKey, name: GAME_NAMES[gameKey], minPlayers: gameKey === 'undercover' ? 3 : 2, maxPlayers: 6, soloDescription: `${GAME_NAMES[gameKey]}单机规则`, roomDescription: `${GAME_NAMES[gameKey]}房间规则`, dailyChampionCoins: 100 })),
  rankingRules: '同一游戏的单机与玩家房间共享日榜。', rewardRules: '每款日冠军 100 办公币。', settlementTime: '次日北京时间 00:05 后结算', historyNotice: '经典练习与原命格录保留，不参与新的办公币奖励日榜。',
};
const baseGame = { version: 1 as const, mode: 'room' as const, phase: 'running' as const, startedAt: 1000, endsAt: Date.now() + 90000, serverNow: Date.now(), players: [{ id: 'player-1', displayName: '当前玩家', score: 10, finished: false, isBot: false }, { id: 'player-2', displayName: '另一玩家', score: 20, finished: false, isBot: false }], viewerId: 'player-1', instructions: '测试服务器规则' };
const snake: ArcadeGameView = { ...baseGame, gameKey: 'snake', board: { snake: [{ x: 2, y: 2 }, { x: 1, y: 2 }], food: { x: 8, y: 8 }, direction: 'right', status: 'running', width: 12, height: 12 } };
const draw: Extract<ArcadeGameView, { gameKey: 'draw' }> = { ...baseGame, gameKey: 'draw', board: { round: 2, totalRounds: 4, drawerId: 'player-2', roundEndsAt: Date.now() + 30000, strokes: [], wordLength: 2, word: null, guessedPlayerIds: [], messages: [], practicePartner: false } };
const undercover: Extract<ArcadeGameView, { gameKey: 'undercover' }> = { ...baseGame, gameKey: 'undercover', board: { round: 2, phase: 'describe', phaseEndsAt: Date.now() + 30000, word: '咖啡', alivePlayerIds: ['player-1', 'player-2'], descriptions: [], votedPlayerIds: [], myVote: null, eliminatedPlayerIds: [], outcome: null, reveals: [], practicePartner: false } };
function room(overrides: Partial<PlayRoomView> = {}): PlayRoomView {
  return { id: 'room-1', title: '午间协作组', gameKey: 'snake', mode: 'room', visibility: 'public', status: 'running', host: { publicId: 'player-1', username: null, displayName: '当前玩家' }, memberCount: 2, maxPlayers: 6, createdAt: '2026-09-08T00:00:00.000Z', version: 1, joinCode: 'TESTCODE', members: baseGame.players.map((player) => ({ publicId: player.id, displayName: player.displayName, username: null, ready: true, left: false, score: null, joinedAt: '2026-09-08T00:00:00.000Z' })), me: { publicId: 'player-1', isHost: true, ready: true, left: false, nextSequence: 1 }, game: snake, serverNow: new Date().toISOString(), expiresAt: new Date(Date.now() + 120000).toISOString(), leaderboardDate: null, rankingNotice: '已验证成绩参与当日日榜。', ...overrides };
}
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function CurrentPath(): JSX.Element { const location = useLocation(); return <output aria-label="当前路径">{location.pathname}{location.search}</output>; }
function RoomHarness(): JSX.Element { const state = usePlayRoom('room-1'); return <><span>{state.room?.title ?? '无房间'}</span><span>{state.room?.me.nextSequence}</span><button onClick={() => { void state.action({ kind: 'direction', payload: { direction: 'up' } }); }}>向上</button><button onClick={() => { void state.action({ kind: 'direction', payload: { direction: 'left' } }); }}>向左</button><button onClick={() => { void state.retryAction(); }}>重试动作</button>{state.error ? <p role="alert">{state.error}</p> : null}</>; }

describe('community game workspace', () => {
  beforeEach(() => {
    vi.restoreAllMocks(); resetCommunityAuthStoreForTests(); setCommunitySessionTokens('test-game-token');
    useCommunityAuthStore.setState({ phase: 'active', user, sessionReady: true });
    vi.spyOn(communityGameRoomsApi, 'catalog').mockResolvedValue(catalog);
    vi.spyOn(communityGameRoomsApi, 'list').mockResolvedValue({ items: [], activeRoom: null });
    vi.spyOn(communityGameRoomsApi, 'get').mockResolvedValue(room());
  });
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it('separates six single-player challenges from classic local practice and links every daily board', async () => {
    render(<MemoryRouter><CommunityGamesPage /></MemoryRouter>);
    expect(await screen.findByText('你画我猜单机规则')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '开始挑战' })).toHaveLength(6);
    expect(screen.getAllByRole('link', { name: '日榜' })).toHaveLength(6);
    expect(screen.getByRole('link', { name: '玩家建房' })).toHaveAttribute('href', '/games/rooms');
    expect(screen.getByRole('link', { name: '遮司 · 原命格录' })).toHaveAttribute('href', '/games/zhesi');
    expect(screen.getByText(/每款日冠军 100 办公币/)).toBeInTheDocument();
  });

  it('keeps one creation identity when a single-player create response is uncertain', async () => {
    const create = vi.spyOn(communityGameRoomsApi, 'create').mockRejectedValueOnce(new Error('网络波动')).mockResolvedValue(room({ mode: 'solo' }));
    render(<MemoryRouter><CurrentPath /><CommunityGamesPage /></MemoryRouter>);
    fireEvent.click((await screen.findAllByRole('button', { name: '开始挑战' }))[0]);
    expect(await screen.findByRole('alert')).toHaveTextContent('网络波动');
    fireEvent.click(screen.getAllByRole('button', { name: '开始挑战' })[0]);
    await waitFor(() => expect(screen.getByLabelText('当前路径')).toHaveTextContent('/games/rooms/room-1'));
    expect(create.mock.calls[0][0].clientRequestId).toBe(create.mock.calls[1][0].clientRequestId);
    expect(create.mock.calls[0][0]).toMatchObject({ gameKey: 'snake', mode: 'solo' });
  });

  it('does not load private rooms for a guest', async () => {
    useCommunityAuthStore.setState({ phase: 'guest', user: null });
    render(<MemoryRouter><CommunityGameRoomsPage /></MemoryRouter>);
    expect(screen.getByRole('link', { name: '登录账号' })).toBeInTheDocument();
    expect(communityGameRoomsApi.list).not.toHaveBeenCalled();
  });

  it('uses an invitation code to join without inventing public player counts', async () => {
    const join = vi.spyOn(communityGameRoomsApi, 'join').mockResolvedValue(room());
    render(<MemoryRouter><CurrentPath /><CommunityGameRoomsPage /></MemoryRouter>);
    expect(await screen.findByText(/暂时没有公开房间/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('房间邀请码'), { target: { value: ' testcode ' } });
    fireEvent.click(screen.getByRole('button', { name: '加入房间' }));
    await waitFor(() => expect(join).toHaveBeenCalledWith({ code: 'TESTCODE' }));
    expect(screen.getByLabelText('当前路径')).toHaveTextContent('/games/rooms/room-1');
  });

  it('keeps an active room accessible and prevents accidentally creating a second one', async () => {
    vi.mocked(communityGameRoomsApi.list).mockResolvedValue({ items: [], activeRoom: room() });
    render(<MemoryRouter><CommunityGameRoomsPage /></MemoryRouter>);
    expect(await screen.findByRole('link', { name: /午间协作组 · 返回房间/ })).toHaveAttribute('href', '/games/rooms/room-1');
    expect(screen.getByRole('button', { name: '创建房间' })).toBeDisabled();
  });

  it('requires all members ready before the host can start', async () => {
    vi.mocked(communityGameRoomsApi.get).mockResolvedValue(room({ status: 'waiting', game: null, members: room().members.map((member, index) => ({ ...member, ready: index === 0 })) }));
    render(<MemoryRouter initialEntries={['/games/rooms/room-1']}><Routes><Route path="/games/rooms/:roomId" element={<CommunityGameRoomPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole('button', { name: '开始本局' })).toBeDisabled();
    expect(screen.getByText(/不会自动加入机器人/)).toBeInTheDocument();
  });

  it('submits drawing guesses with the current round and never reconstructs a missing secret', async () => {
    const action = vi.fn().mockResolvedValue(true);
    render(<ArcadeGameSurface view={draw} onAction={action} />);
    expect(screen.queryByText('只有你能看到本轮题目')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('猜词答案'), { target: { value: '雨伞' } });
    fireEvent.click(screen.getByRole('button', { name: '提交猜词' }));
    await waitFor(() => expect(action).toHaveBeenCalledWith({ kind: 'guess', payload: { text: '雨伞', round: 2 } }));
    expect(action.mock.calls[0][0]).not.toHaveProperty('score');
  });

  it('only gives drawing tools and the server-provided secret to the current drawer', () => {
    render(<ArcadeGameSurface view={{ ...draw, board: { ...draw.board, drawerId: 'player-1', word: '雨伞' } }} onAction={vi.fn()} />);
    expect(screen.getByText('雨伞')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '黑笔' })).toBeInTheDocument();
    expect(screen.queryByLabelText('猜词答案')).not.toBeInTheDocument();
  });

  it('labels single-player practice partners honestly', () => {
    render(<ArcadeGameSurface view={{ ...undercover, mode: 'solo', board: { ...undercover.board, practicePartner: true } }} onAction={vi.fn()} />);
    expect(screen.getByText(/另外 3 位为系统练习搭档，不是真人玩家/)).toBeInTheDocument();
    expect(screen.queryByText('平民阵营获胜')).not.toBeInTheDocument();
    expect(screen.queryByText('卧底阵营获胜')).not.toBeInTheDocument();
  });

  it('limits undercover descriptions to 80 characters and includes the current round', async () => {
    const action = vi.fn().mockResolvedValue(true); render(<ArcadeGameSurface view={undercover} onAction={action} />);
    expect(screen.getByLabelText('你的描述')).toHaveAttribute('maxlength', '80');
    fireEvent.change(screen.getByLabelText('你的描述'), { target: { value: '上班时会喝' } });
    fireEvent.click(screen.getByRole('button', { name: '提交描述' }));
    await waitFor(() => expect(action).toHaveBeenCalledWith({ kind: 'describe', payload: { text: '上班时会喝', round: 2 } }));
  });

  it('does not let an eliminated undercover player describe or vote', () => {
    render(<ArcadeGameSurface view={{ ...undercover, board: { ...undercover.board, alivePlayerIds: ['player-2'] } }} onAction={vi.fn()} />);
    expect(screen.getByText(/你已出局/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '提交描述' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /另一玩家/ })).not.toBeInTheDocument();
  });

  it('only sends the fair short-game choice and turn, never legacy zhesi progress', () => {
    const action = vi.fn().mockResolvedValue(true);
    render(<ArcadeGameSurface view={{ ...baseGame, gameKey: 'zhesi', board: { turn: 3, maxTurns: 10, health: 90, energy: 5, power: 12, enemyHealth: 80, enemyIntent: 'attack', chosen: false, turnEndsAt: Date.now() + 6000, log: [], status: 'running' } }} onAction={action} />);
    fireEvent.click(screen.getByRole('button', { name: /守势/ }));
    expect(action).toHaveBeenCalledWith({ kind: 'choice', payload: { choice: 'guard', turn: 3 } });
    expect(screen.getByText(/不读取旧存档/)).toBeInTheDocument();
  });

  it('renders mixed solo and room entries on one per-game daily board', async () => {
    vi.spyOn(communityGameRoomsApi, 'leaderboard').mockResolvedValue({ gameKey: 'snake', date: '2026-09-08', dailyChampionCoins: 100, rules: '次日自动结算，同分先到优先。', items: [{ publicId: 'p1', username: null, displayName: '单机玩家', rank: 1, score: 100, mode: 'solo', achievedAt: '2026-09-08T01:00:00Z' }, { publicId: 'p2', username: null, displayName: '房间玩家', rank: 2, score: 80, mode: 'room', achievedAt: '2026-09-08T02:00:00Z' }], award: { status: 'pending', winner: null, coins: 100, awardedAt: null } });
    render(<MemoryRouter initialEntries={['/games/leaderboards/snake']}><Routes><Route path="/games/leaderboards/:gameKey" element={<CommunityGameLeaderboardPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByText('单机玩家')).toBeInTheDocument(); expect(screen.getByText('房间玩家')).toBeInTheDocument();
    expect(screen.getByText(/奖励待结算/)).toHaveTextContent('00:05');
    expect(screen.getByRole('link', { name: '谁是卧底' })).toHaveAttribute('href', '/games/leaderboards/undercover');
  });

  it('bounds keyboard repeat below the server action budget and preserves browser shortcuts', () => {
    const action = vi.fn().mockResolvedValue(true);
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
    render(<ArcadeGameSurface view={snake} onAction={action} />);
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    now.mockReturnValue(1033);
    fireEvent.keyDown(window, { key: 'ArrowUp', repeat: true });
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'w', metaKey: true });
    expect(action).toHaveBeenCalledOnce();
    now.mockReturnValue(1100);
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(action).toHaveBeenCalledTimes(2);
  });

  it('covers the mounted game and ignores keyboard actions until restored', async () => {
    useCommunityAuthStore.setState({ phase: 'guest', user: null, sessionReady: true });
    const action = vi.fn().mockResolvedValue(true);
    render(<MemoryRouter><Routes><Route element={<CommunityGameWorkspaceLayout />}><Route index element={<ArcadeGameSurface view={snake} onAction={action} />} /></Route></Routes></MemoryRouter>);
    const board = screen.getByRole('img', { name: /贪食蛇棋盘/ });
    fireEvent.keyDown(window, { key: 'ArrowUp' }); expect(action).toHaveBeenCalledOnce();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('textbox', { name: '便签内容' })).toHaveFocus();
    expect(board).not.toBeVisible();
    fireEvent.change(screen.getByRole('textbox', { name: '便签内容' }), { target: { value: '本地临时内容' } });
    fireEvent.keyDown(window, { key: 'ArrowLeft' }); expect(action).toHaveBeenCalledOnce();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(board).toBeVisible(); expect(screen.getByRole('img', { name: /贪食蛇棋盘/ })).toBe(board);
    fireEvent.keyDown(window, { key: 'Escape' }); expect(screen.getByLabelText('便签内容')).toHaveValue('本地临时内容');
  });

  it('serializes inputs against acknowledged sequences', async () => {
    const first = deferred<PlayRoomView>(); const action = vi.spyOn(communityGameRoomsApi, 'action').mockReturnValueOnce(first.promise).mockResolvedValue(room({ version: 3, me: { ...room().me, nextSequence: 3 } }));
    render(<RoomHarness />); expect(await screen.findByText('午间协作组')).toBeInTheDocument();
    fireEvent.click(screen.getByText('向上')); fireEvent.click(screen.getByText('向左'));
    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect(action.mock.calls[0][1].sequence).toBe(1);
    await act(async () => { first.resolve(room({ version: 2, me: { ...room().me, nextSequence: 2 } })); });
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    expect(action.mock.calls[1][1].sequence).toBe(2);
  });

  it('retries an uncertain action with identical ID, sequence and payload', async () => {
    const action = vi.spyOn(communityGameRoomsApi, 'action').mockRejectedValueOnce(new CommunityApiError(0, 'offline')).mockResolvedValue(room({ version: 2, me: { ...room().me, nextSequence: 2 } }));
    render(<RoomHarness />); await screen.findByText('午间协作组');
    fireEvent.click(screen.getByText('向上'));
    expect(await screen.findByRole('alert')).toHaveTextContent('送达状态待确认');
    fireEvent.click(screen.getByText('向左')); expect(action).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByText('重试动作'));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    expect(action.mock.calls[1][1]).toEqual(action.mock.calls[0][1]);
  });

  it('clears private room state on account change and discards old responses', async () => {
    const old = deferred<PlayRoomView>(); vi.mocked(communityGameRoomsApi.get).mockReturnValueOnce(old.promise).mockResolvedValue(room({ title: '新账号房间', me: { ...room().me, publicId: 'player-new' } }));
    render(<RoomHarness />);
    await act(async () => { setCommunitySessionTokens('new-account-token'); useCommunityAuthStore.setState({ phase: 'active', user: { ...user, id: 'player-new', publicId: 'player-new' } }); });
    expect(await screen.findByText('新账号房间')).toBeInTheDocument();
    await act(async () => { old.resolve(room({ title: '旧账号私有房间' })); });
    expect(screen.queryByText('旧账号私有房间')).not.toBeInTheDocument();
  });

  it('does not let an older poll overwrite an acknowledged newer action', async () => {
    vi.useFakeTimers(); const late = deferred<PlayRoomView>();
    vi.mocked(communityGameRoomsApi.get).mockResolvedValueOnce(room()).mockReturnValueOnce(late.promise);
    vi.spyOn(communityGameRoomsApi, 'action').mockResolvedValue(room({ title: '新状态', version: 3, me: { ...room().me, nextSequence: 2 } }));
    render(<RoomHarness />); await act(async () => { await Promise.resolve(); });
    await act(async () => { vi.advanceTimersByTime(801); });
    fireEvent.click(screen.getByText('向上')); await act(async () => { await Promise.resolve(); });
    expect(screen.getByText('新状态')).toBeInTheDocument();
    await act(async () => { late.resolve(room({ title: '过期状态', version: 2 })); });
    expect(screen.queryByText('过期状态')).not.toBeInTheDocument();
  });

  it('aborts an in-flight private read and never schedules another poll after unmount', async () => {
    vi.useFakeTimers(); const read = deferred<PlayRoomView>(); vi.mocked(communityGameRoomsApi.get).mockReturnValue(read.promise);
    const mounted = render(<RoomHarness />);
    const signal = vi.mocked(communityGameRoomsApi.get).mock.calls[0][1];
    mounted.unmount(); expect(signal?.aborted).toBe(true);
    await act(async () => { read.resolve(room()); });
    await act(async () => { vi.advanceTimersByTime(10000); });
    expect(communityGameRoomsApi.get).toHaveBeenCalledOnce();
  });

  it('drops queued actions when the room is unmounted before the first reply', async () => {
    const first = deferred<PlayRoomView>(); const action = vi.spyOn(communityGameRoomsApi, 'action').mockReturnValue(first.promise);
    const mounted = render(<RoomHarness />); await screen.findByText('午间协作组');
    fireEvent.click(screen.getByText('向上')); fireEvent.click(screen.getByText('向左'));
    await waitFor(() => expect(action).toHaveBeenCalledOnce()); mounted.unmount();
    await act(async () => { first.resolve(room({ version: 2, me: { ...room().me, nextSequence: 2 } })); });
    expect(action).toHaveBeenCalledOnce();
  });

  it('does not clear a new drawing-round guess when the old round request completes late', async () => {
    const first = deferred<boolean>(); const action = vi.fn().mockReturnValue(first.promise);
    const mounted = render(<ArcadeGameSurface view={draw} onAction={action} />);
    fireEvent.change(screen.getByLabelText('猜词答案'), { target: { value: '旧猜测' } });
    fireEvent.click(screen.getByRole('button', { name: '提交猜词' }));
    mounted.rerender(<ArcadeGameSurface view={{ ...draw, board: { ...draw.board, round: 3 } }} onAction={action} />);
    fireEvent.change(screen.getByLabelText('猜词答案'), { target: { value: '新猜测' } });
    await act(async () => { first.resolve(true); });
    expect(screen.getByLabelText('猜词答案')).toHaveValue('新猜测');
  });

  it('separates the current balance board from rewarded game daily boards', async () => {
    vi.spyOn(communityGameRoomsApi, 'officeCoinsLeaderboard').mockResolvedValue({ items: [{ publicId: 'player-1', username: null, displayName: '当前玩家', rank: 1, balance: 1280 }], me: { rank: 1, balance: 1280 }, updatedAt: '2026-09-08T02:00:00Z', rules: '余额相同按公开账号标识稳定排序。' });
    render(<MemoryRouter><CommunityLeaderboardsPage /></MemoryRouter>);
    expect(await screen.findByText('1,280 办公币')).toBeInTheDocument();
    expect(screen.getByText(/余额榜只展示积累，不额外发奖/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '小游戏每日榜' }));
    expect(screen.getAllByRole('link', { name: /查看.*日榜/ })).toHaveLength(6);
    expect(screen.getByRole('link', { name: '查看谁是卧底日榜 →' })).toHaveAttribute('href', '/games/leaderboards/undercover');
  });

  it('does not read the private office coin board when opening the games tab', async () => {
    const coins = vi.spyOn(communityGameRoomsApi, 'officeCoinsLeaderboard');
    render(<MemoryRouter initialEntries={['/leaderboards?tab=games']}><CommunityLeaderboardsPage /></MemoryRouter>);
    expect(await screen.findByRole('link', { name: '查看遮司日榜 →' })).toBeInTheDocument();
    expect(coins).not.toHaveBeenCalled();
  });

  it('keeps an office coin loading failure distinct from a zero balance or empty board', async () => {
    vi.spyOn(communityGameRoomsApi, 'officeCoinsLeaderboard').mockRejectedValue(new Error('余额服务暂时离线'));
    render(<MemoryRouter><CommunityLeaderboardsPage /></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent('余额服务暂时离线');
    expect(screen.queryByText('暂无可展示的办公币排名。')).not.toBeInTheDocument();
    expect(screen.queryByText('0 办公币')).not.toBeInTheDocument();
  });

  it('unlocks input when an uncertain retry receives a definitive rejection', async () => {
    const action = vi.spyOn(communityGameRoomsApi, 'action').mockRejectedValueOnce(new CommunityApiError(0, 'offline')).mockRejectedValueOnce(new CommunityApiError(400, 'Bad Request', { code: 'PLAY_STALE_ROUND' })).mockResolvedValue(room({ version: 2, me: { ...room().me, nextSequence: 2 } }));
    render(<RoomHarness />); await screen.findByText('午间协作组');
    fireEvent.click(screen.getByText('向上')); await screen.findByRole('alert');
    fireEvent.click(screen.getByText('重试动作'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('下一轮'));
    fireEvent.click(screen.getByText('向左'));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(3));
    expect(action.mock.calls[2][1].actionId).not.toBe(action.mock.calls[0][1].actionId);
  });

  it.each([['贪食蛇', SnakeGamePage], ['俄罗斯方块', TetrisGamePage], ['坦克大战', TankBattlePage]] as const)('covers and pauses classic %s without letting hidden keys restart it', async (_name, Game) => {
    useCommunityAuthStore.setState({ phase: 'guest', user: null, sessionReady: true });
    render(<MemoryRouter><Routes><Route element={<CommunityGameWorkspaceLayout />}><Route index element={<Game />} /></Route></Routes></MemoryRouter>);
    const begin = screen.getAllByRole('button').find((button) => /开始/.test(button.textContent ?? ''))!;
    fireEvent.click(begin);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByLabelText('便签内容')).toHaveFocus();
    fireEvent.keyDown(window, { key: 'p' }); fireEvent.keyDown(window, { key: 'r' }); fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getAllByText(/暂停/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button').some((button) => /继续/.test(button.textContent ?? ''))).toBe(true);
  });
});
