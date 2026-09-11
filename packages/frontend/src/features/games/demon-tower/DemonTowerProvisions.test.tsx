import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { DemonTowerProvisionsView } from '@stealth-reader/shared';
import { DemonTowerOfficeSupplies } from './DemonTowerOfficeSupplies';
import { DemonTowerExplorationStats } from './DemonTowerExplorationStats';
import { DemonTowerShop } from './DemonTowerShop';
import { DemonTowerGuide } from './DemonTowerGuide';
import { towerBattle, towerCatalog, towerProfile, TOWER_TEST_NOW } from './test-fixtures';

const provisions = (): DemonTowerProvisionsView => ({ version: 1, serviceDate: '2026-09-09', week: '2026-09-07', trackingStartedAt: TOWER_TEST_NOW,
  passes: 2, fragments: 12, ordinaryStarted: 12, passStarted: 0, passDailyLimit: 2,
  offers: [
    { offer: 'stamina', name: '办公体力补给', currency: 'office_coin', price: 60, limit: 2, limitPeriod: 'day', purchased: 0, remaining: 2, available: true, reason: null },
    { offer: 'star', name: '主手升星凭证', currency: 'office_coin', price: 150, limit: 1, limitPeriod: 'week', purchased: 0, remaining: 1, available: true, reason: null },
    { offer: 'permanent', attribute: 'STR', name: '力量永久补给', currency: 'office_coin', price: 300, limit: 5, limitPeriod: 'lifetime', purchased: 0, remaining: 5, available: true, reason: null },
  ],
  chest: { opened: 0, limit: 5, nextCost: 30, available: true, reason: null },
  skills: [{ skillId: 's6', name: '霆击', rarity: '精', requiredLevel: 16, cost: 6, owned: false, available: true, reason: null }], history: [],
});
const profile = () => towerProfile({ level: 16, stamina: 60, provisions: provisions(), availableActions: ['office_purchase', 'progressive_chest', 'fragment_select', 'explore_with_pass'] });
const props = () => ({ profile: profile(), disabled: false, balance: 500, balanceStale: false, now: TOWER_TEST_NOW, onAction: vi.fn().mockResolvedValue(true), onExplore: vi.fn(), onWorkshop: vi.fn() });

describe('Demon tower explicit office-coin supplies', () => {
  it('requires explicit consent and sends no client price, wallet, user, reward or quantity', async () => {
    const value = props(); render(<DemonTowerOfficeSupplies {...value} />);
    fireEvent.click(screen.getByRole('button', { name: '兑换办公体力补给' })); expect(value.onAction).not.toHaveBeenCalled();
    expect(within(screen.getByRole('dialog')).getByText('本次扣除：60 办公币')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '确认扣除 60 办公币' }));
    expect(value.onAction).toHaveBeenCalledExactlyOnceWith({ kind: 'office_purchase', payload: { offer: 'stamina' } }, { expectedVersion: value.profile.version, serviceDate: '2026-09-09' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('names current main-hand and preserves existing free star routes before buying', () => {
    const value = props(); render(<DemonTowerOfficeSupplies {...value} />); fireEvent.click(screen.getByRole('button', { name: '兑换主手升星凭证' }));
    const dialog = screen.getByRole('dialog'); expect(within(dialog).getByText(/当前主手.*确定提升 1 星.*免费熟练度与残魂/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '取消' })); expect(value.onAction).not.toHaveBeenCalled();
  });
  it('sends a specific permanent dimension and explains the shared lifetime cap', async () => {
    const value = props(); render(<DemonTowerOfficeSupplies {...value} />); fireEvent.click(screen.getByRole('button', { name: '兑换力量永久补给' }));
    expect(within(screen.getByRole('dialog')).getByText(/共用每维 \+5/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '确认扣除 300 办公币' }));
    expect(value.onAction).toHaveBeenCalledExactlyOnceWith({ kind: 'office_purchase', payload: { offer: 'permanent', attribute: 'STR' } }, { expectedVersion: value.profile.version, serviceDate: '2026-09-09' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it.each([null, 0, 29])('blocks paid actions with insufficient or unknown wallet %s', balance => {
    render(<DemonTowerOfficeSupplies {...props()} balance={balance} />);
    expect(screen.getByRole('button', { name: '兑换办公体力补给' })).toBeDisabled(); expect(screen.getByRole('button', { name: '检查开箱 · 30 办公币' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '自选霆击' })).toBeEnabled();
  });
  it('does not charge a changed chest quote or changed main-hand version after polling', () => {
    const value = props(); const view = render(<DemonTowerOfficeSupplies {...value} />); fireEvent.click(screen.getByRole('button', { name: '检查开箱 · 30 办公币' }));
    const next = { ...value.profile, version: value.profile.version + 1, provisions: { ...provisions(), chest: { ...provisions().chest, opened: 1, nextCost: 55 } } };
    view.rerender(<DemonTowerOfficeSupplies {...value} profile={next} />);
    expect(screen.getByRole('alert')).toHaveTextContent('已经变化'); expect(screen.getByRole('button', { name: '确认扣除 30 办公币' })).toBeDisabled(); expect(value.onAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '取消' })); fireEvent.click(screen.getByRole('button', { name: '检查开箱 · 55 办公币' }));
    expect(screen.getByRole('button', { name: '确认扣除 55 办公币' })).toBeEnabled();
  });
  it('invalidates yesterday quote even when midnight GET keeps the same profile version', () => {
    const value = props(); const view = render(<DemonTowerOfficeSupplies {...value} />); fireEvent.click(screen.getByRole('button', { name: '检查开箱 · 30 办公币' }));
    view.rerender(<DemonTowerOfficeSupplies {...value} now={Date.parse('2026-09-09T16:00:00Z')} profile={{ ...value.profile, provisions: { ...provisions(), serviceDate: '2026-09-10' } }} />);
    expect(screen.getByRole('button', { name: '确认扣除 30 办公币' })).toBeDisabled(); expect(screen.getByRole('alert')).toHaveTextContent('已经变化'); expect(value.onAction).not.toHaveBeenCalled();
  });
  it('uses an empty server-priced chest payload and prevents double-click/uncertain automatic retries', async () => {
    const value = props(); let finish!: (ok: boolean) => void; value.onAction.mockImplementation(() => new Promise<boolean>(resolve => { finish = resolve; }));
    render(<DemonTowerOfficeSupplies {...value} />); fireEvent.click(screen.getByRole('button', { name: '检查开箱 · 30 办公币' }));
    const confirm = screen.getByRole('button', { name: '确认扣除 30 办公币' }); fireEvent.click(confirm); fireEvent.click(confirm);
    expect(value.onAction).toHaveBeenCalledExactlyOnceWith({ kind: 'progressive_chest', payload: {} }, { expectedVersion: value.profile.version, serviceDate: '2026-09-09' });
    await act(async () => finish(false)); expect(screen.getByRole('dialog')).toBeVisible(); expect(value.onAction).toHaveBeenCalledOnce();
  });
  it('shows public probabilities, no rebate loop, and preserves old pages when choosing a new fragment skill', async () => {
    const value = props(); render(<DemonTowerOfficeSupplies {...value} />);
    const odds = screen.getByLabelText('阶梯宝箱公开概率'); for (const text of ['40%', '35%', '20%', '5%']) expect(within(odds).getByText(text)).toBeVisible();
    expect(screen.getByText(/明日重置价格；不返办公币/)).toBeVisible(); fireEvent.click(screen.getByRole('button', { name: '自选霆击' }));
    expect(within(screen.getByRole('dialog')).getByText(/消耗 6 枚技能碎片.*不消耗旧残页/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '确认兑换' })); expect(value.onAction).toHaveBeenCalledExactlyOnceWith({ kind: 'fragment_select', payload: { skillId: 's6' } }, { expectedVersion: value.profile.version, serviceDate: '2026-09-09' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it.each(['disabled', 'stale', 'battle', 'midnight'] as const)('blocks unsafe actions during %s', condition => {
    const value = props(); render(<DemonTowerOfficeSupplies {...value} disabled={condition === 'disabled'} balanceStale={condition === 'stale'} now={condition === 'midnight' ? Date.parse('2026-09-09T16:00:00Z') : value.now} profile={condition === 'battle' ? { ...value.profile, battle: towerBattle() } : value.profile} />);
    expect(screen.getByRole('button', { name: '兑换办公体力补给' })).toBeDisabled(); expect(screen.getByRole('button', { name: '检查开箱 · 30 办公币' })).toBeDisabled();
  });
  it('resets drafts on account-key remount and supplies section is directly deep-linkable', () => {
    const value = props(); const view = render(<DemonTowerOfficeSupplies key="account-a" {...value} />); fireEvent.click(screen.getByRole('button', { name: '检查开箱 · 30 办公币' }));
    view.rerender(<DemonTowerOfficeSupplies key="account-b" {...value} balance={0} />); expect(screen.queryByRole('dialog')).toBeNull(); view.unmount();
    render(<MemoryRouter initialEntries={['/games/demon-tower?tab=shop&supply=office']}><DemonTowerShop {...value} catalog={towerCatalog()} /></MemoryRouter>);
    expect(screen.getByRole('button', { name: '办公币补给' })).toHaveAttribute('aria-current', 'page'); expect(screen.getByRole('heading', { name: '阶梯宝箱' })).toBeVisible();
  });
});

describe('Demon tower exploration records and coherent guidance', () => {
  it('keeps ordinary exploration over ten and uses a pass only after manual confirmation', async () => {
    const value = props(); render(<DemonTowerExplorationStats {...value} onSupplies={vi.fn()} />);
    expect(screen.getByText(/普通探索 12 次/)).toBeVisible(); expect(screen.getByText(/普通探索没有每日 10 次硬上限/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '使用探索符' })); expect(value.onAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '确认探索' })); expect(value.onAction).toHaveBeenCalledExactlyOnceWith({ kind: 'explore_with_pass', payload: {} }, { expectedVersion: value.profile.version, serviceDate: '2026-09-09' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('rejects a pass when the floor/profile changed while its dialog was open', () => {
    const value = props(); const view = render(<DemonTowerExplorationStats {...value} onSupplies={vi.fn()} />); fireEvent.click(screen.getByRole('button', { name: '使用探索符' }));
    view.rerender(<DemonTowerExplorationStats {...value} profile={{ ...value.profile, version: value.profile.version + 1, selectedFloor: 2 }} onSupplies={vi.fn()} />);
    expect(screen.getByRole('button', { name: '确认探索' })).toBeDisabled(); expect(screen.getByRole('alert')).toHaveTextContent('区域状态已变化'); expect(value.onAction).not.toHaveBeenCalled();
  });
  it.each(['empty', 'daily', 'battle', 'auto', 'date'] as const)('blocks invalid pass use: %s', condition => {
    const value = props(); render(<DemonTowerExplorationStats {...value} disabled={condition === 'auto'} now={condition === 'date' ? Date.parse('2026-09-09T16:00:00Z') : value.now} profile={{ ...value.profile, battle: condition === 'battle' ? towerBattle() : null, provisions: { ...provisions(), passes: condition === 'empty' ? 0 : 2, passStarted: condition === 'daily' ? 2 : 0 } }} onSupplies={vi.fn()} />);
    expect(screen.getByRole('button', { name: '使用探索符' })).toBeDisabled(); expect(value.onAction).not.toHaveBeenCalled();
  });
  it('renders current level requirements and distinguishes actual stat effects from proposed extra turns', () => {
    render(<DemonTowerGuide profile={profile()} />); expect(screen.getByRole('heading', { name: '养成手册' })).toBeVisible();
    fireEvent.click(screen.getByText('升级需求与九层门槛')); expect(screen.getByText('200 经验')).toBeVisible(); expect(screen.getByText('Lv.110')).toBeVisible();
    fireEvent.click(screen.getByText('五维如何影响个人探索战斗')); expect(screen.getByText(/先手不等于凭速度差额外行动/)).toBeVisible();
    expect(screen.getByText(/失败不降星/)).toBeVisible();
  });
});
