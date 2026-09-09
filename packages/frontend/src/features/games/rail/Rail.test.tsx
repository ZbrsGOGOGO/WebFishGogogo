import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { JSX } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RailGameView, RailRoomView } from '@stealth-reader/shared';

import type { CommunityAuthUser } from '../../../api/community';
import { CommunityApiError, setCommunitySessionTokens } from '../../../api/community-http';
import { communityRailApi } from '../../../api/community-rail';
import { resetCommunityAuthStoreForTests, useCommunityAuthStore } from '../../../app/store/community-auth-store';
import { GamePrivacyProvider } from '../GamePrivacyContext';
import { CommunityGameWorkspaceLayout } from '../rooms/CommunityGameWorkspaceLayout';
import { RailGameSurface } from './RailGameSurface';
import { RailLobbyPage } from './RailLobbyPage';
import { RailRoomPage } from './RailRoomPage';
import { RailRoomChat } from './RailRoomChat';
import { RailLeaderboardPage } from './RailLeaderboardPage';
import { useRailRoom } from './useRailRoom';

const user: CommunityAuthUser = { id: 'person1', publicId: 'person1', email: 'rail-ui@users.invalid', displayName: '当前玩家', accountStatus: 'active', onboardingCompleted: true, socialVerificationStatus: 'verified', battleProfession: 'developer' };
const people = [{ id: 'person1', displayName: '当前玩家', isBot: false }, { id: 'person2', displayName: '另一玩家', isBot: false }, { id: 'person3', displayName: '第三玩家', isBot: false }];
const good = { id: 'good-1', kind: 'good' as const, title: '热心的维修员', description: '正在帮助邻居修好水管。' };
const bad = { id: 'bad-1', kind: 'bad' as const, title: '抢走外卖的人', description: '还假装不知道这件事。' };
const buff = { id: 'buff-1', kind: 'buff' as const, title: '还有一个秘密', description: '刚刚捐出了全部年终奖。' };
function game(overrides: Partial<RailGameView> = {}): RailGameView {
  return { gameKey: 'rail', phase: 'placement', round: 1, totalRounds: 3, roundToken: 'round-token-1', startedAt: 1000, deadlineAt: Date.now() + 60000, endsAt: Date.now() + 360000, serverNow: Date.now(), conductorId: 'person3', viewerRole: 'participant', players: people.map((person, index) => ({ ...person, seat: index, team: index === 2 ? null : index === 0 ? 'A' : 'B', left: false, placedGood: false, placedBad: false, placedBuff: false, rated: false, survived: 0, eligibleRounds: 0, rateBasisPoints: 0, demonTotal: 0, eligible: true })), tracks: { A: [], B: [] }, chosenTrack: null, automaticDecision: false, me: { id: 'person1', team: 'A', hand: { good: [good], bad: [bad], buff: [buff] }, availableActions: ['place_good', 'place_bad'], myRating: null }, roundResult: null, history: [], result: null, rules: '只显示服务器发给你的手牌。', ...overrides };
}
function room(overrides: Partial<RailRoomView> = {}): RailRoomView {
  return { id: 'rail-room-1', title: '午间轨道讨论组', mode: 'room', hasPassword: false, status: 'running', host: { publicId: 'person1', displayName: '当前玩家', username: null }, playerCount: 3, botCount: 0, spectatorCount: 0, maxPlayers: 6, createdAt: '2026-09-08T00:00:00.000Z', version: 1, members: people.map((person) => ({ publicId: person.id, displayName: person.displayName, username: null, role: 'participant', ready: true, left: false, joinedAt: '2026-09-08T00:00:00.000Z' })), bots: [], me: { publicId: 'person1', role: 'participant', ready: true, left: false, isHost: true, nextSequence: 1 }, game: game(), serverNow: new Date().toISOString(), expiresAt: new Date(Date.now() + 360000).toISOString(), leaderboardDate: null, rankingEligible: true, rankingNotice: '纯真人完整参与的有效成绩可计榜。', chatEnabled: true, chatCanWrite: true, ...overrides };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
function Location(): JSX.Element { const value = useLocation(); return <output aria-label="路径">{value.pathname}</output>; }
function Harness(): JSX.Element { const state = useRailRoom('rail-room-1'); return <><span>{state.room?.title ?? '没有房间'}</span><output aria-label="动作序号">{state.room?.me.nextSequence}</output><button onClick={() => { void state.action({ kind: 'place_good', payload: { roundToken: 'round-token-1', cardId: 'good-1' } }); }}>出善牌</button><button onClick={() => { void state.action({ kind: 'place_bad', payload: { roundToken: 'round-token-1', cardId: 'bad-1' } }); }}>出恶牌</button><button onClick={() => { void state.retry(); }}>重试动作</button>{state.error ? <p role="alert">{state.error}</p> : null}</>; }

describe('rail workspace', () => {
  beforeEach(() => {
    vi.restoreAllMocks(); resetCommunityAuthStoreForTests(); setCommunitySessionTokens('synthetic-rail-token'); useCommunityAuthStore.setState({ phase: 'active', user, sessionReady: true });
    vi.spyOn(communityRailApi, 'get').mockResolvedValue(room()); vi.spyOn(communityRailApi, 'list').mockResolvedValue({ items: [], activeRoom: null }); vi.spyOn(communityRailApi, 'chat').mockResolvedValue({ items: [], latestSequence: 0, hasMore: false });
  });
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it('does not request private rooms for guests and explains practice separately', () => {
    useCommunityAuthStore.setState({ phase: 'guest', user: null }); render(<MemoryRouter><RailLobbyPage /></MemoryRouter>);
    expect(screen.getByRole('link', { name: '登录账号' })).toBeInTheDocument(); expect(communityRailApi.list).not.toHaveBeenCalled();
  });
  it('creates explicit bot practice with a stable creation identity after a lost response', async () => {
    const create = vi.spyOn(communityRailApi, 'create').mockRejectedValueOnce(new CommunityApiError(0, 'offline')).mockResolvedValue(room({ mode: 'practice' }));
    render(<MemoryRouter><Location /><RailLobbyPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: '开始人机练习' })); await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: '开始人机练习' })); await waitFor(() => expect(screen.getByLabelText('路径')).toHaveTextContent('/games/rail/rooms/rail-room-1'));
    expect(create.mock.calls[0][0]).toMatchObject({ mode: 'practice', maxPlayers: 3, botCount: 2 });
    expect(create.mock.calls[0][0].clientRequestId).toBe(create.mock.calls[1][0].clientRequestId);
  });
  it('shows password rooms in the hall and asks a spectator for a password without codes', async () => {
    vi.mocked(communityRailApi.list).mockResolvedValue({ items: [room({ hasPassword: true })], activeRoom: null }); const join = vi.spyOn(communityRailApi, 'join').mockResolvedValue(room());
    render(<MemoryRouter><RailLobbyPage /></MemoryRouter>); fireEvent.click(await screen.findByRole('button', { name: '旁观' }));
    expect(join).not.toHaveBeenCalled(); expect(screen.queryByText(/邀请码/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('加入房间密码'), { target: { value: 'synthetic-lock' } }); fireEvent.click(screen.getByRole('button', { name: '确认旁观' }));
    await waitFor(() => expect(join).toHaveBeenCalledWith({ roomId: 'rail-room-1', role: 'spectator', password: 'synthetic-lock' }));
  });
  it('allows all 64 Unicode password characters without a 64 UTF-16-unit browser cutoff', async () => {
    vi.mocked(communityRailApi.list).mockResolvedValue({ items: [room({ hasPassword: true })], activeRoom: null });
    const join = vi.spyOn(communityRailApi, 'join').mockResolvedValue(room());
    render(<MemoryRouter><RailLobbyPage /></MemoryRouter>);
    expect(Number(screen.getByLabelText('房间密码（可选）').getAttribute('maxlength'))).toBeGreaterThanOrEqual(128);
    fireEvent.click(await screen.findByRole('button', { name: '旁观' }));
    const input = screen.getByLabelText('加入房间密码');
    expect(Number(input.getAttribute('maxlength'))).toBeGreaterThanOrEqual(128);
    const password = '🌱'.repeat(64);
    fireEvent.change(input, { target: { value: password } });
    fireEvent.click(screen.getByRole('button', { name: '确认旁观' }));
    await waitFor(() => expect(join).toHaveBeenCalledWith({ roomId: 'rail-room-1', role: 'spectator', password }));
  });
  it('sends only a server-issued hand card and current round token', async () => {
    const action = vi.fn().mockResolvedValue(true); render(<RailGameSurface view={game()} onAction={action} />);
    fireEvent.click(screen.getByRole('button', { name: /热心的维修员/ })); fireEvent.click(screen.getByRole('button', { name: '放置善牌' }));
    await waitFor(() => expect(action).toHaveBeenCalledWith({ kind: 'place_good', payload: { roundToken: 'round-token-1', cardId: 'good-1' } }));
    expect(action.mock.calls[0][0]).not.toHaveProperty('score'); expect(screen.getByText('只有你能看到')).toBeInTheDocument();
  });
  it('attaches a condition only to a selected unbuffed character', async () => {
    const base = game(); const action = vi.fn().mockResolvedValue(true);
    render(<RailGameSurface view={game({ phase: 'buff', tracks: { A: [{ id: 'placed-1', card: good, ownerId: 'person1', track: 'A', automatic: false, buff: null }], B: [] }, me: { ...base.me!, availableActions: ['place_buff'] } })} onAction={action} />);
    fireEvent.click(screen.getByRole('button', { name: /还有一个秘密/ })); expect(screen.getByRole('button', { name: '追加这一条件' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('条件牌目标'), { target: { value: 'placed-1' } }); fireEvent.click(screen.getByRole('button', { name: '追加这一条件' }));
    await waitFor(() => expect(action).toHaveBeenCalledWith({ kind: 'place_buff', payload: { roundToken: 'round-token-1', cardId: 'buff-1', targetId: 'placed-1' } }));
  });
  it('does not reveal hands or conductor controls to spectators', () => {
    render(<RailGameSurface view={game({ phase: 'decision', viewerRole: 'spectator', me: null })} onAction={vi.fn()} />);
    expect(screen.getByText('旁观中 · 无手牌')).toBeInTheDocument(); expect(screen.queryByLabelText('自己的手牌')).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: '列车经过 A 轨' })).not.toBeInTheDocument();
  });
  it('keeps long v2 card text intact in hand, track and target without submitting template metadata', async () => {
    const longBuff = { ...buff, id: 'r2:p0:buff:1', templateId: 'rail-v2-buff-09', deckVersion: 'rail-deck-20260909-v2', title: '愿意把豪华邮轮送给你，只要你能放过Ta', description: '仅是附加的虚构辩论条件，不改变发牌、胜负规则、现实资产或账号办公币。' };
    const longBad = { ...bad, title: '故意克扣饭菜还把餐费据为己有的食堂阿姨' };
    const action = vi.fn().mockResolvedValue(true);
    render(<RailGameSurface view={game({ phase: 'buff', tracks: { A: [{ id: 'long-target', card: longBad, ownerId: 'person1', track: 'A', automatic: false, buff: null }], B: [] }, me: { ...game().me!, hand: { good: [], bad: [], buff: [longBuff] }, availableActions: ['place_buff'] } })} onAction={action} />);
    const card = screen.getByRole('button', { name: new RegExp(longBuff.title) });
    expect(card.querySelector('strong')?.textContent).toBe(longBuff.title);
    expect(card.querySelector('span')?.textContent).toBe(longBuff.description);
    expect(screen.getByText(longBad.title, { selector: 'strong' })).toBeVisible();
    expect(screen.getByRole('option', { name: new RegExp(longBad.title) })).toHaveTextContent(longBad.title);
    fireEvent.click(card);
    fireEvent.change(screen.getByLabelText('条件牌目标'), { target: { value: 'long-target' } });
    fireEvent.click(screen.getByRole('button', { name: '追加这一条件' }));
    await waitFor(() => expect(action).toHaveBeenCalledWith({ kind: 'place_buff', payload: { roundToken: 'round-token-1', cardId: 'r2:p0:buff:1', targetId: 'long-target' } }));
  });
  it('requires a deliberate 1–10 rating and states that ratings do not pay coins', async () => {
    const action = vi.fn().mockResolvedValue(true); render(<RailGameSurface view={game({ phase: 'rating', me: { ...game().me!, availableActions: ['rate'] } })} onAction={action} />);
    expect(screen.getByRole('button', { name: '提交评分' })).toBeDisabled(); fireEvent.click(screen.getByRole('button', { name: '7' })); fireEvent.click(screen.getByRole('button', { name: '提交评分' }));
    await waitFor(() => expect(action).toHaveBeenCalledWith({ kind: 'rate', payload: { roundToken: 'round-token-1', value: 7 } })); expect(screen.getByText(/这项评分不发放办公币/)).toBeInTheDocument();
  });
  it.each([true, false])('distinguishes robot automation from human timeout (robot=%s)', (robot) => {
    const base = game();
    render(<RailGameSurface view={game({
      phase: 'round_end',
      players: base.players.map((player) => ({ ...player, isBot: robot })),
      tracks: { A: [{ id: 'automatic-card', card: good, ownerId: 'person1', track: 'A', automatic: true, buff: { card: buff, ownerId: 'person2', automatic: true } }], B: [] },
      roundResult: { round: 1, conductorId: 'person3', chosenTrack: 'A', automaticDecision: true, survivedPlayerIds: ['person2'], passedPlayerIds: ['person1'], ratings: [{ playerId: 'person1', value: robot ? 5 : null, automatic: true }], demonScore: robot ? 5 : 0 },
    })} onAction={vi.fn()} />);
    if (robot) {
      expect(screen.getAllByText(/机器人自动操作/)).toHaveLength(2);
      expect(screen.getByText(/机器人自动选择/)).toBeInTheDocument();
      expect(screen.queryByText(/超时/)).not.toBeInTheDocument();
      expect(screen.queryByText(/弃评/)).not.toBeInTheDocument();
    } else {
      expect(screen.getAllByText(/超时托管/)).toHaveLength(2);
      expect(screen.getByText(/超时自动选择/)).toBeInTheDocument();
      expect(screen.getByText(/超时未评分按弃评处理/)).toBeInTheDocument();
    }
  });
  it('ignores game actions while the existing workplace cover is active', () => {
    const action = vi.fn(); render(<GamePrivacyProvider value={{ covered: true, toggleCover: vi.fn() }}><RailGameSurface view={game()} onAction={action} /></GamePrivacyProvider>);
    expect(screen.getByRole('button', { name: /热心的维修员/ })).toBeDisabled(); fireEvent.click(screen.getByRole('button', { name: '放置善牌' })); expect(action).not.toHaveBeenCalled();
  });
  it('preserves mounted hand selections across the Esc notes cover', () => {
    useCommunityAuthStore.setState({ phase: 'guest', user: null, sessionReady: true }); render(<MemoryRouter><Routes><Route element={<CommunityGameWorkspaceLayout />}><Route index element={<RailGameSurface view={game()} onAction={vi.fn()} />} /></Route></Routes></MemoryRouter>);
    const card = screen.getByRole('button', { name: /热心的维修员/ }); fireEvent.click(card); fireEvent.keyDown(window, { key: 'Escape' }); expect(card).not.toBeVisible(); expect(screen.getByLabelText('便签内容')).toHaveFocus(); fireEvent.keyDown(window, { key: 'Escape' }); expect(card).toBeVisible(); expect(card).toHaveAttribute('aria-pressed', 'true');
  });
  it('waits for all humans to be ready and exposes host-only bot/password settings', async () => {
    const waiting = room({ status: 'waiting', game: null, members: room().members.map((member, index) => ({ ...member, ready: index === 0 })) }); vi.mocked(communityRailApi.get).mockResolvedValue(waiting);
    render(<MemoryRouter initialEntries={['/games/rail/rooms/rail-room-1']}><Routes><Route path="/games/rail/rooms/:roomId" element={<RailRoomPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole('button', { name: '开始本局' })).toBeDisabled(); expect(screen.getByLabelText('房间机器人数量')).toBeInTheDocument(); expect(screen.getByLabelText('更新房间密码')).toHaveAttribute('type', 'password');
  });
  it('lets spectators read player chat but write only in the spectator channel', async () => {
    const spectator = room({ me: { ...room().me, role: 'spectator', isHost: false } });
    vi.mocked(communityRailApi.chat).mockResolvedValue({ latestSequence: 1, hasMore: false, items: [{ id: 'message1', sequence: 1, channel: 'player', author: { publicId: 'person2', displayName: '另一玩家', username: null }, body: '<img src=x onerror=alert(1)>', status: 'visible', createdAt: '2026-09-08T00:00:00Z' }] });
    render(<RailRoomChat room={spectator} />); expect(screen.getByLabelText('观众讨论消息')).toBeInTheDocument(); fireEvent.click(screen.getByRole('tab', { name: '玩家讨论' }));
    expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeInTheDocument(); expect(screen.queryByRole('img')).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: '发送' })).not.toBeInTheDocument(); expect(screen.getByText(/当前频道只读/)).toBeInTheDocument();
  });
  it('shows equipped fixed-text titles in room discussion without changing author or message body', async () => {
    vi.mocked(communityRailApi.chat).mockResolvedValue({ latestSequence: 1, hasMore: false, items: [{ id: 'titled-message', sequence: 1, channel: 'player', author: { publicId: 'person2', displayName: '讨论同事', username: null, title: { key: 'farm_first', label: '工位园丁' } }, body: '完整保留的发言', status: 'visible', createdAt: '2026-09-08T00:00:00Z' }] });
    render(<RailRoomChat room={room()} />); expect(await screen.findByLabelText('佩戴称号：工位园丁')).toBeVisible(); expect(screen.getByText('完整保留的发言')).toBeVisible();
  });
  it('queries the selected channel instead of losing quiet messages behind an active channel', async () => {
    vi.mocked(communityRailApi.chat).mockImplementation(async (_id, query) => ({ latestSequence: 60, hasMore: false,
      items: query && typeof query === 'object' && query.channel === 'spectator' ? [{ id: 'quiet5', sequence: 5, channel: 'spectator',
        author: { publicId: 'person2', displayName: '安静观众', username: null }, body: '较早的观众看法', status: 'visible', createdAt: '2026-09-09T00:00:00Z' }] : [] }));
    render(<RailRoomChat room={room()} />);
    await waitFor(() => expect(communityRailApi.chat).toHaveBeenCalledWith('rail-room-1', { channel: 'player', limit: 50 }, expect.any(AbortSignal)));
    fireEvent.click(screen.getByRole('tab', { name: '观众讨论' }));
    expect(await screen.findByText('较早的观众看法')).toBeVisible();
    expect(screen.getByText(/最近 200 条/)).toBeVisible();
  });
  it('expands and re-reads the whole visible channel so earlier withdrawals are not cached', async () => {
    vi.useFakeTimers(); let withdrawn = false;
    vi.mocked(communityRailApi.chat).mockImplementation(async (_id, query) => {
      const expanded = typeof query === 'object' && query.limit === 100;
      return { latestSequence: 61, hasMore: !expanded, items: expanded ? [{ id: 'old-message', sequence: 1, channel: 'player',
        author: { publicId: 'person2', displayName: '同事', username: null }, body: withdrawn ? null : '很早的内容', status: withdrawn ? 'withdrawn' : 'visible', createdAt: '2026-09-09T00:00:00Z' }] : [] };
    });
    render(<RailRoomChat room={room()} />);
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByRole('button', { name: '查看本频道更早消息' }));
    await act(async () => { await Promise.resolve(); }); expect(screen.getByText('很早的内容')).toBeVisible();
    withdrawn = true; await act(async () => { await vi.advanceTimersByTimeAsync(1200); });
    expect(screen.queryByText('很早的内容')).toBeNull(); expect(screen.getByText('这条消息已撤回')).toBeVisible();
    expect(vi.mocked(communityRailApi.chat).mock.calls.at(-1)?.[1]).toEqual({ channel: 'player', limit: 100 });
  });
  it('ignores a late channel response and distinguishes loading or failed reads from empty history', async () => {
    const late = deferred<Awaited<ReturnType<typeof communityRailApi.chat>>>();
    vi.mocked(communityRailApi.chat).mockReturnValueOnce(late.promise).mockRejectedValue(new CommunityApiError(403, 'Forbidden'));
    render(<RailRoomChat room={room()} />);
    expect(screen.getByText('正在读取本频道消息…')).toBeVisible();
    fireEvent.click(screen.getByRole('tab', { name: '观众讨论' }));
    expect(await screen.findByText('暂时无法读取本频道消息。')).toBeVisible();
    await act(async () => { late.resolve({ latestSequence: 1, hasMore: false, items: [{ id: 'late', sequence: 1, channel: 'player', author: { publicId: 'person2', displayName: '同事', username: null }, body: '迟来的旧频道内容', status: 'visible', createdAt: '2026-09-09T00:00:00Z' }] }); });
    expect(screen.queryByText('迟来的旧频道内容')).toBeNull();
  });
  it('keeps uncertain retries identical and serializes later actions with the new server sequence', async () => {
    const next = room({ version: 2, me: { ...room().me, nextSequence: 2 } }); const action = vi.spyOn(communityRailApi, 'action').mockRejectedValueOnce(new CommunityApiError(0, 'offline')).mockResolvedValueOnce(next).mockResolvedValue(room({ version: 3, me: { ...room().me, nextSequence: 3 } }));
    render(<Harness />); await screen.findByText('午间轨道讨论组'); fireEvent.click(screen.getByText('出善牌')); await screen.findByRole('alert'); fireEvent.click(screen.getByText('出恶牌')); expect(action).toHaveBeenCalledOnce(); fireEvent.click(screen.getByText('重试动作'));
    await waitFor(() => expect(screen.getByLabelText('动作序号')).toHaveTextContent('2')); expect(action.mock.calls[1][1]).toEqual(action.mock.calls[0][1]); fireEvent.click(screen.getByText('出恶牌')); await waitFor(() => expect(action).toHaveBeenCalledTimes(3)); expect(action.mock.calls[2][1].sequence).toBe(2); expect(action.mock.calls[2][1].actionId).not.toBe(action.mock.calls[0][1].actionId);
  });
  it('retries an uncertain chat send with the same identity and applies a brief slow mode', async () => {
    const message = { id: 'm1', sequence: 1, channel: 'player' as const, author: { publicId: 'person1', displayName: '当前玩家', username: null }, body: '选择要有依据', status: 'visible' as const, createdAt: '2026-09-08T00:00:00Z' };
    const send = vi.spyOn(communityRailApi, 'sendChat').mockRejectedValueOnce(new CommunityApiError(0, 'offline')).mockResolvedValue(message);
    render(<RailRoomChat room={room()} />); expect(screen.getByLabelText('玩家讨论消息')).toHaveAttribute('maxlength', '600');
    fireEvent.change(screen.getByLabelText('玩家讨论消息'), { target: { value: message.body } }); fireEvent.click(screen.getByRole('button', { name: '发送' })); await screen.findByRole('alert'); fireEvent.click(screen.getByRole('button', { name: '发送' }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2)); expect(send.mock.calls[0][1]).toEqual(send.mock.calls[1][1]); expect(await screen.findByRole('button', { name: '请稍候…' })).toBeDisabled();
  });
  it('rechecks the latest chat window so an unchanged-sequence withdrawal removes the body', async () => {
    vi.useFakeTimers(); const message = { id: 'm1', sequence: 1, channel: 'player' as const, author: { publicId: 'person2', displayName: '另一玩家', username: null }, body: '即将撤回的内容', status: 'visible' as const, createdAt: '2026-09-08T00:00:00Z' };
    vi.mocked(communityRailApi.chat).mockResolvedValueOnce({ items: [message], latestSequence: 1, hasMore: false }).mockResolvedValue({ items: [{ ...message, body: null, status: 'withdrawn' }], latestSequence: 1, hasMore: false }); render(<RailRoomChat room={room()} />);
    await act(async () => { await Promise.resolve(); }); expect(screen.getByText(message.body)).toBeInTheDocument(); await act(async () => { await vi.advanceTimersByTimeAsync(1200); }); expect(screen.queryByText(message.body)).not.toBeInTheDocument(); expect(screen.getByText('这条消息已撤回')).toBeInTheDocument(); expect(vi.mocked(communityRailApi.chat).mock.calls[1][1]).toEqual({ channel: 'player', limit: 50 });
  });
  it('does not resurrect a locally withdrawn message from an older tail response', async () => {
    vi.useFakeTimers();
    const message = { id: 'm1', sequence: 1, channel: 'player' as const, author: { publicId: 'person1', displayName: '当前玩家', username: null }, body: '我的撤回内容', status: 'visible' as const, createdAt: '2026-09-08T00:00:00Z' };
    vi.mocked(communityRailApi.chat).mockResolvedValue({ items: [message], latestSequence: 1, hasMore: false }); vi.spyOn(communityRailApi, 'withdrawChat').mockResolvedValue({ ...message, body: null, status: 'withdrawn' }); render(<RailRoomChat room={room()} />);
    await act(async () => { await Promise.resolve(); }); await act(async () => { fireEvent.click(screen.getByRole('button', { name: '撤回' })); await Promise.resolve(); }); expect(screen.getByText('这条消息已撤回')).toBeInTheDocument(); expect(screen.queryByText(message.body)).not.toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(1200); }); expect(communityRailApi.chat).toHaveBeenCalledTimes(2); expect(screen.queryByText(message.body)).not.toBeInTheDocument();
  });
  it('drops late private responses after an account switch', async () => {
    const old = deferred<RailRoomView>(); vi.mocked(communityRailApi.get).mockReturnValueOnce(old.promise).mockResolvedValue(room({ title: '新账号房间', me: { ...room().me, publicId: 'person2' } })); render(<Harness />);
    act(() => { setCommunitySessionTokens('second-rail-token'); useCommunityAuthStore.setState({ user: { ...user, id: 'person2', publicId: 'person2' } }); });
    expect(await screen.findByText('新账号房间')).toBeInTheDocument(); await act(async () => { old.resolve(room({ title: '旧账号私密房间', version: 99 })); await old.promise; }); expect(screen.queryByText('旧账号私密房间')).not.toBeInTheDocument();
  });
  it('does not overlap polling while a room response is still in flight', async () => {
    vi.useFakeTimers(); const pending = deferred<RailRoomView>(); vi.mocked(communityRailApi.get).mockReturnValue(pending.promise); render(<Harness />);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); }); expect(communityRailApi.get).toHaveBeenCalledOnce();
    await act(async () => { pending.resolve(room()); await pending.promise; }); await act(async () => { await vi.advanceTimersByTimeAsync(1000); }); expect(communityRailApi.get).toHaveBeenCalledTimes(2);
  });
  it('shows the survival board and demon statistics as different measures', async () => {
    vi.spyOn(communityRailApi, 'leaderboard').mockResolvedValue({ date: '2026-09-08', dailyChampionCoins: 100, rules: '生存率优先，同分按有效回合与时间。', items: [{ publicId: 'person1', username: null, displayName: '当前玩家', rank: 1, survived: 2, eligibleRounds: 2, rateBasisPoints: 10000, demonTotal: 15, achievedAt: '2026-09-08T01:00:00Z' }], award: { status: 'pending', winner: null, coins: 100, awardedAt: null } });
    vi.spyOn(communityRailApi, 'stats').mockResolvedValue({ completedGames: 3, survived: 4, eligibleRounds: 6, rateBasisPoints: 6667, demonTotal: 22, demonMvpCount: 1, rankedGames: 2 }); render(<MemoryRouter><RailLeaderboardPage /></MemoryRouter>);
    expect(await screen.findByText(/每日冠军奖励 100 办公币/)).toBeInTheDocument(); expect(screen.getByText('100.0%')).toBeInTheDocument(); expect(screen.getByText(/00:05/)).toBeInTheDocument(); expect(screen.getByText(/仅趣味记录，不发币/)).toBeInTheDocument();
  });
});
