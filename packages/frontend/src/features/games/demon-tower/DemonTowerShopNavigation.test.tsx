import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DemonTowerEconomyView } from '@stealth-reader/shared';
import { DemonTowerPage } from './DemonTowerPage';
import { useDemonTower, type DemonTowerState } from './useDemonTower';
import { TOWER_TEST_NOW, towerBattle, towerCatalog, towerOverview, towerProfile } from './test-fixtures';

vi.mock('./useDemonTower', () => ({ useDemonTower: vi.fn() }));
vi.mock('./DemonTowerExpansion', async importOriginal => ({ ...await importOriginal<typeof import('./DemonTowerExpansion')>(), demonTowerExpansionUIEnabled: true }));
const economy = (): DemonTowerEconomyView => ({ version: 1, balance: 200, dailyEarned: 0, dailyCap: 200, bossEarned: 0, bossCap: 100, serviceDate: '2026-09-09', week: '2026-09-07', buffsExpiresAt: TOWER_TEST_NOW + 3600_000,
  buffs: { STR: 0, SPD: 0, AGI: 0, DEF: 0, LUCK: 0 }, permanent: { STR: 0, SPD: 0, AGI: 0, DEF: 0, LUCK: 0 }, runes: {}, ledger: [],
  offers: [{ id: 'stamina_small', name: '小体力包', currency: 'spirit_stone', price: 20, limit: 5, limitPeriod: 'day', purchased: 0, remaining: 5, description: '立即恢复3体力。', available: true, reason: null }],
});
function state(): DemonTowerState {
  return { ownerId: 'tower-user-a', displayName: '合成成员甲', catalog: towerCatalog(), overview: towerOverview({ profile: towerProfile({ stamina: 0, economy: economy(), availableActions: ['shop_purchase', 'explore', 'expedition', 'market'],
    expansion: { version: 1, skillPages: 0, essences: 0, weaponBoxes: 0, weaponBoxPity: 0, riftsToday: 0, meditationsToday: 0, weeklyBossAttempts: 0, week: '2026-09-07', claimedBossFloors: [], passageTokens: 0, titles: [], skin: 'field', unlockedSkins: ['field'] },
  }) }), receipt: null, loading: false, refreshing: false, busy: false, pending: false, stale: false, error: null, now: TOWER_TEST_NOW,
  act: vi.fn().mockResolvedValue(true), retry: vi.fn(), refresh: vi.fn(), dismissReceipt: vi.fn(), observeOverview: vi.fn() };
}
function Probe() { const location = useLocation(); const navigate = useNavigate(); return <><output aria-label="主页面位置">{location.search}</output><button onClick={() => navigate(-1)}>上一页</button><button onClick={() => navigate(1)}>下一页</button></>; }
const wrap = (route = '/games/demon-tower') => render(<MemoryRouter initialEntries={[route]}><DemonTowerPage /><Probe /></MemoryRouter>);

describe('Demon tower supply navigation and account boundaries', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(useDemonTower).mockReturnValue(state()); });
  it('opens deep-linked supply sections and keeps tab and section on browser back/forward', () => {
    wrap('/games/demon-tower?tab=shop&supply=market&keep=1');
    expect(screen.getByRole('tab', { name: '物资申领' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: '武器箱 · 12残魂' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '收支记录' }));
    expect(screen.getByLabelText('主页面位置')).toHaveTextContent('tab=shop&supply=ledger&keep=1');
    fireEvent.click(screen.getByRole('tab', { name: '探索任务' })); expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'tower-panel-explore');
    fireEvent.click(screen.getByRole('button', { name: '上一页' })); expect(screen.getByRole('heading', { name: '最近收支登记' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '上一页' })); expect(screen.getByRole('button', { name: '武器箱 · 12残魂' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '下一页' })); expect(screen.getByRole('heading', { name: '最近收支登记' })).toBeVisible();
  });
  it('places a direct replenish-and-return path beside insufficient exploration stamina without duplicated shops', () => {
    wrap(); fireEvent.click(screen.getByRole('button', { name: '前往物资库补充体力' }));
    expect(screen.getByRole('heading', { name: '内部物资申领单' })).toBeVisible();
    expect(screen.getByLabelText('主页面位置')).toHaveTextContent('tab=shop&supply=supplies');
    fireEvent.click(screen.getByRole('button', { name: '返回探索任务' })); expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'tower-panel-explore');
    fireEvent.click(screen.getByRole('tab', { name: '秘境工坊' })); expect(screen.queryByRole('button', { name: '武器箱 · 12残魂' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '前往物资申领' })); expect(screen.getByRole('heading', { name: '内部物资申领单' })).toBeVisible();
  });
  it('returns from a saved expedition to its battle and only redirects after a confirmed launch', async () => {
    const value = state(); value.overview!.profile!.stamina = 100; vi.mocked(value.act).mockResolvedValueOnce(false).mockResolvedValueOnce(true); vi.mocked(useDemonTower).mockReturnValue(value);
    const view = wrap('/games/demon-tower?tab=expansion');
    fireEvent.click(screen.getByRole('button', { name: '进入小秘境' })); await act(async () => {}); expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'tower-panel-expansion');
    fireEvent.click(screen.getByRole('button', { name: '进入小秘境' })); await waitFor(() => expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'tower-panel-explore'));
    vi.mocked(useDemonTower).mockReturnValue({ ...value, overview: towerOverview({ profile: { ...value.overview!.profile!, battle: towerBattle(), availableActions: ['attack'] } }) });
    view.rerender(<MemoryRouter><DemonTowerPage /><Probe /></MemoryRouter>);
    fireEvent.click(screen.getByRole('tab', { name: '物资申领' })); expect(screen.getByRole('button', { name: '申领小体力包' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '返回进行中探索' })); expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'tower-panel-explore');
  });
  it('drops account-owned purchase and rune form state when the account changes but retains harmless navigation', () => {
    const value = state(); const view = wrap('/games/demon-tower?tab=shop');
    fireEvent.click(screen.getByRole('button', { name: '申领小体力包' })); fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '3' } });
    vi.mocked(useDemonTower).mockReturnValue({ ...value, ownerId: 'tower-user-b', displayName: '合成成员乙' });
    view.rerender(<MemoryRouter><DemonTowerPage /><Probe /></MemoryRouter>);
    expect(screen.queryByRole('dialog')).toBeNull(); expect(screen.getByRole('tab', { name: '物资申领' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('button', { name: '申领小体力包' })); expect(screen.getByRole('spinbutton')).toHaveValue(1); expect(value.act).not.toHaveBeenCalled();
  });
  it('falls back from unrecognized tabs without taking any action', () => {
    wrap('/games/demon-tower?tab=unknown&supply=not-real'); expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'tower-panel-explore'); expect(useDemonTower().act).not.toHaveBeenCalled();
  });
});
