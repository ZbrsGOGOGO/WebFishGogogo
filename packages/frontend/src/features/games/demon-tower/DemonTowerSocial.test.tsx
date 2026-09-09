import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DemonTowerExpansionView, DemonTowerSocialView } from '@stealth-reader/shared';
import { DemonTowerSocial } from './DemonTowerSocial';
import { towerProfile } from './test-fixtures';

const api = vi.hoisted(() => ({ social: vi.fn() }));
vi.mock('../../../api/community-demon-tower', () => ({ communityDemonTowerApi: api, demonTowerReadErrorMessage: () => '稍后重试' }));
vi.mock('../../../api/community-http', () => ({ getCommunitySessionGeneration: () => 1 }));
const empty: DemonTowerSocialView = { enabled: true, serverNow: 1, opponents: [], squads: [] };
const expansion = (): DemonTowerExpansionView => ({ version: 1, skillPages: 0, essences: 0, weaponBoxes: 0, weaponBoxPity: 0, riftsToday: 0, meditationsToday: 0, weeklyBossAttempts: 0, week: '2026-09-07', claimedBossFloors: [], passageTokens: 0, titles: [], skin: 'field', unlockedSkins: ['field'], squadId: null, squadReadyToday: 0 });
const profile = () => towerProfile({ expansion: expansion(), availableActions: ['arena_enroll', 'arena_learn', 'arena_equip', 'arena_challenge', 'honor_exchange', 'squad_create', 'squad_join', 'squad_leave', 'squad_ready', 'squad_step', 'squad_claim'] });

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
});
