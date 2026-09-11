import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { DemonTowerExpansionView, DemonTowerSocialView } from '@stealth-reader/shared';
import { DemonTowerSocial } from './DemonTowerSocial';
import { towerProfile } from './test-fixtures';

const api = vi.hoisted(() => ({ social: vi.fn() }));
vi.mock('../../../api/community-demon-tower', () => ({ communityDemonTowerApi: api, demonTowerReadErrorMessage: () => '稍后重试' }));
vi.mock('../../../api/community-http', () => ({ getCommunitySessionGeneration: () => 1 }));
const empty: DemonTowerSocialView = { enabled: true, serverNow: 1, opponents: [], squads: [] };
const expansion = (): DemonTowerExpansionView => ({ version: 1, skillPages: 0, essences: 0, weaponBoxes: 0, weaponBoxPity: 0, riftsToday: 0, meditationsToday: 0, weeklyBossAttempts: 0, week: '2026-09-07', claimedBossFloors: [], passageTokens: 0, titles: [], skin: 'field', unlockedSkins: ['field'], squadId: null, squadReadyToday: 0 });
const profile = () => towerProfile({ expansion: expansion(), availableActions: ['arena_enroll', 'arena_learn', 'arena_equip', 'arena_challenge', 'honor_exchange', 'squad_create', 'squad_join', 'squad_leave', 'squad_ready', 'squad_step', 'squad_claim'] });
const arenaProfile = () => {
  const current = profile();
  current.expansion!.arena = { enabled: true, rating: 1000, rank: '青铜', honor: 0, skillPoints: 0, learned: [], loadout: [], attemptsToday: 0, winsToday: 0, lastReport: null, skinUnlocked: false };
  return current;
};
const friend = { publicId: 'friend-b', displayName: '真实好友乙', level: 16, rating: 1000, rank: '青铜' as const, isFriend: true as const, challengedToday: false };
const stranger = { publicId: 'stranger-c', displayName: '公开玩家丙', level: 20, rating: 1000, rank: '青铜' as const, isFriend: false, challengedToday: false };

describe('Demon tower explicit social consent UI', () => {
  beforeEach(() => { api.social.mockReset(); api.social.mockResolvedValue(empty); });
  it('requires opt-in confirmation before publishing a build to the async opponent pool', async () => {
    const onAction = vi.fn().mockResolvedValue(true); render(<DemonTowerSocial profile={profile()} ownerId="alice" disabled={false} onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: '自愿加入论道池' })); expect(onAction).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog'); expect(within(dialog).getByText(/公开昵称、等级、段位/)).toBeVisible();
    fireEvent.click(within(dialog).getByRole('button', { name: '确认' }));
    await waitFor(() => expect(onAction).toHaveBeenCalledExactlyOnceWith({ kind: 'arena_enroll', payload: { enabled: true } }));
  });
  it('never submits a ready snapshot or another user ID from the browser, only explicit ready consent', async () => {
    const current = profile(); current.expansion!.squadId = 'squad-one'; current.stamina = 10; current.hp = 100;
    api.social.mockResolvedValue({ ...empty, squads: [{ id: 'squad-one', ownerPublicId: 'alice', floor: 1, status: 'waiting', round: 0, boss: { hp: 0, maxHp: 0, minions: 0 }, members: [{ publicId: 'alice', displayName: '阿甲', ready: false, hp: 0, maxHp: 0, damage: 0, claimed: false }], log: [], expiresAt: 999999 }] });
    const onAction = vi.fn().mockResolvedValue(true); render(<DemonTowerSocial profile={current} ownerId="alice" disabled={false} onAction={onAction} />);
    await screen.findByText('阿甲'); fireEvent.click(screen.getByRole('button', { name: '准备 · 3体力' }));
    expect(onAction).not.toHaveBeenCalled(); const dialog = screen.getByRole('dialog'); expect(within(dialog).getByText(/冻结当前配装与生命快照/)).toBeVisible();
    fireEvent.click(within(dialog).getByRole('button', { name: '确认' }));
    await waitFor(() => expect(onAction).toHaveBeenCalledExactlyOnceWith({ kind: 'squad_ready', payload: {} }));
  });
  it('drops a previous-account response after switching identity and never displays old private party data', async () => {
    let resolveOld!: (value: DemonTowerSocialView) => void;
    api.social.mockImplementationOnce(() => new Promise<DemonTowerSocialView>(resolve => { resolveOld = resolve; })).mockResolvedValue(empty);
    const { rerender } = render(<DemonTowerSocial profile={profile()} ownerId="alice" disabled={false} onAction={vi.fn()} />);
    rerender(<DemonTowerSocial profile={profile()} ownerId="bob" disabled={false} onAction={vi.fn()} />);
    await act(async () => resolveOld({ ...empty, squads: [{ id: 'old', ownerPublicId: 'alice', floor: 1, status: 'waiting', round: 0, boss: { hp: 0, maxHp: 0, minions: 0 }, members: [{ publicId: 'alice', displayName: '不应显示旧账号', ready: true, hp: 1, maxHp: 2, damage: 3, claimed: false }], log: [], expiresAt: 999999 }] }));
    expect(screen.queryByText(/不应显示旧账号/)).toBeNull();
  });
  it('shows errors as stale data rather than auto-joining or reissuing mutations', async () => {
    api.social.mockRejectedValue(new Error('offline')); const onAction = vi.fn(); render(<DemonTowerSocial profile={profile()} ownerId="alice" disabled onAction={onAction} />);
    await screen.findByRole('status'); expect(screen.getByRole('button', { name: '自愿加入论道池' })).toBeDisabled(); expect(onAction).not.toHaveBeenCalled();
  });
  it('separates actual friends from the public pool and explicitly confirms the friend-only action', async () => {
    api.social.mockResolvedValue({ ...empty, opponents: [friend, stranger], friends: [friend] });
    const onAction = vi.fn().mockResolvedValue(true);
    render(<DemonTowerSocial profile={arenaProfile()} ownerId="alice" disabled={false} onAction={onAction} />);
    await screen.findByText('公开玩家丙');
    fireEvent.click(screen.getByRole('button', { name: /^好友切磋/ }));
    expect(screen.queryByText('公开玩家丙')).toBeNull(); expect(screen.getByText('真实好友乙')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '与好友切磋' })); expect(onAction).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog'); expect(within(dialog).getByText(/真实好友乙.*好友切磋/)).toBeVisible();
    expect(within(dialog).getByText(/不发普通经验或办公币/)).toBeVisible();
    fireEvent.click(within(dialog).getByRole('button', { name: '确认' }));
    await waitFor(() => expect(onAction).toHaveBeenCalledExactlyOnceWith({ kind: 'arena_challenge', payload: { opponentPublicId: 'friend-b', friendOnly: true } }));
  });
  it('keeps the public challenge payload unchanged and does not imply a friendship', async () => {
    api.social.mockResolvedValue({ ...empty, opponents: [stranger], friends: [] }); const onAction = vi.fn().mockResolvedValue(true);
    render(<DemonTowerSocial profile={arenaProfile()} ownerId="alice" disabled={false} onAction={onAction} />);
    await screen.findByText('公开玩家丙'); fireEvent.click(screen.getByRole('button', { name: '公开切磋' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '确认' }));
    await waitFor(() => expect(onAction).toHaveBeenCalledExactlyOnceWith({ kind: 'arena_challenge', payload: { opponentPublicId: 'stranger-c' } }));
  });
  it('disables the same already-challenged player in either list and explains the shared daily cap', async () => {
    api.social.mockResolvedValue({ ...empty, opponents: [{ ...friend, challengedToday: true }], friends: [{ ...friend, challengedToday: true }] });
    render(<DemonTowerSocial profile={arenaProfile()} ownerId="alice" disabled={false} onAction={vi.fn()} />);
    await screen.findByText('真实好友乙'); expect(screen.getByRole('button', { name: '今日已切磋' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /^好友切磋/ })); expect(screen.getByRole('button', { name: '今日已切磋' })).toBeDisabled();
    expect(screen.getByText(/公开论道与好友切磋共享每日5名不同对手/)).toBeVisible();
  });
  it('does not reveal unjoined friend profiles and offers the existing friends page when empty', async () => {
    api.social.mockResolvedValue({ ...empty, opponents: [stranger], friends: [] });
    render(<MemoryRouter><DemonTowerSocial profile={arenaProfile()} ownerId="alice" disabled={false} onAction={vi.fn()} /></MemoryRouter>);
    await screen.findByText('公开玩家丙'); fireEvent.click(screen.getByRole('button', { name: /^好友切磋/ }));
    expect(screen.getByText(/暂无可切磋的好友/)).toBeVisible(); expect(screen.getByRole('link', { name: '前往好友列表' })).toHaveAttribute('href', '/friends');
    expect(screen.queryByText('公开玩家丙')).toBeNull();
  });
  it('requires opting in and a remaining daily attempt before a friend challenge', async () => {
    api.social.mockResolvedValue({ ...empty, opponents: [], friends: [friend] }); const current = arenaProfile(); current.expansion!.arena!.enabled = false;
    const { rerender } = render(<DemonTowerSocial profile={current} ownerId="alice" disabled={false} onAction={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^好友切磋/ })).toHaveTextContent('1'));
    fireEvent.click(screen.getByRole('button', { name: /^好友切磋/ })); expect(screen.getByRole('button', { name: '与好友切磋' })).toBeDisabled();
    expect(screen.getByText('请先自愿加入论道池')).toBeVisible();
    const exhausted = arenaProfile(); exhausted.expansion!.arena!.attemptsToday = 5;
    rerender(<DemonTowerSocial profile={exhausted} ownerId="alice" disabled={false} onAction={vi.fn()} />);
    expect(screen.getByText('今日五次切磋已用完')).toBeVisible(); expect(screen.getByRole('button', { name: '与好友切磋' })).toBeDisabled();
  });
  it('invalidates an open friend confirmation when the refreshed relationship disappears', async () => {
    api.social.mockResolvedValue({ ...empty, opponents: [], friends: [friend] }); const onAction = vi.fn();
    render(<MemoryRouter><DemonTowerSocial profile={arenaProfile()} ownerId="alice" disabled={false} onAction={onAction} /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('button', { name: /^好友切磋/ })).toHaveTextContent('1'));
    fireEvent.click(screen.getByRole('button', { name: /^好友切磋/ })); fireEvent.click(screen.getByRole('button', { name: '与好友切磋' }));
    api.social.mockResolvedValue({ ...empty, opponents: [], friends: [] }); fireEvent.click(screen.getByRole('button', { name: '刷新同伴' }));
    await screen.findByText('对手资料已变化，请关闭窗口并刷新对手列表。');
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: '确认' })).toBeDisabled(); expect(onAction).not.toHaveBeenCalled();
  });
  it('drops old confirmations on account switch and a late save cannot close the next account modal', async () => {
    api.social.mockResolvedValue({ ...empty, opponents: [], friends: [friend] }); let resolveOld!: (ok: boolean) => void;
    const onAction = vi.fn().mockImplementation(() => new Promise<boolean>(resolve => { resolveOld = resolve; }));
    const { rerender } = render(<DemonTowerSocial profile={arenaProfile()} ownerId="alice" disabled={false} onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: '退出公开论道池' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '确认' }));
    rerender(<DemonTowerSocial profile={arenaProfile()} ownerId="bob" disabled={false} onAction={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '退出公开论道池' }));
    await act(async () => resolveOld(true)); expect(screen.getByRole('dialog')).toBeVisible();
  });
  it('retains failed confirmations with a visible uncertainty notice and does not retry automatically', async () => {
    const onAction = vi.fn().mockResolvedValue(false);
    render(<DemonTowerSocial profile={arenaProfile()} ownerId="alice" disabled={false} onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: '退出公开论道池' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '确认' }));
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('未自动重试');
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
