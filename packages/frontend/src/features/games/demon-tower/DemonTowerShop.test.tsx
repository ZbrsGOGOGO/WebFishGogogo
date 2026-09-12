import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { DemonTowerEconomyView, DemonTowerShopOffer } from '@stealth-reader/shared';
import { DemonTowerShop, towerShopQuantityReason } from './DemonTowerShop';
import { towerCatalog, towerProfile, TOWER_TEST_NOW } from './test-fixtures';

const zero = () => ({ STR: 0, SPD: 0, AGI: 0, DEF: 0, LUCK: 0 });
const small: DemonTowerShopOffer = { id: 'stamina_small', name: '小体力包', currency: 'spirit_stone', price: 20, limit: 5, limitPeriod: 'day', purchased: 0, remaining: 5, description: '立即恢复 3 点体力，不囤积。', available: true, reason: null };
const offers = (): DemonTowerShopOffer[] => [
  { ...small },
  { ...small, id: 'stamina_large', name: '大体力包', price: 45, limit: 2, remaining: 2 },
  { ...small, id: 'heal', name: '疗伤符', price: 10, limit: 2, remaining: 2 },
  { ...small, id: 'pill_STR', name: '力量药丸', price: 15, limit: 3, remaining: 3, description: '今日力量 +5，北京时间零点失效。' },
  { ...small, id: 'permanent_STR', name: '力量永久丹', currency: 'soul', price: 30, limitPeriod: 'lifetime', description: '永久力量 +1，累计上限 +5。' },
  { ...small, id: 'fine_weapon_box', name: '精级武器箱', currency: 'soul', price: 8, limit: 1, remaining: 1, limitPeriod: 'week', description: 'Lv16 起每周折扣，不累计或消耗旧箱保底。' },
  { ...small, id: 'rune_box', name: '符文箱', currency: 'soul', price: 40, limit: 1, remaining: 1, limitPeriod: 'week', description: '获得 2 枚符文。' },
];
export function towerEconomy(overrides: Partial<DemonTowerEconomyView> = {}): DemonTowerEconomyView {
  return { version: 1, balance: 200, dailyEarned: 130, dailyCap: 200, bossEarned: 50, bossCap: 100,
    serviceDate: '2026-09-09', week: '2026-09-07', buffsExpiresAt: Date.parse('2026-09-09T16:00:00Z'), buffs: { ...zero(), STR: 5 }, permanent: { ...zero(), DEF: 2 },
    runes: { critical: 2, dodge: 1 }, offers: offers(), ledger: [], ...overrides };
}
const profile = () => towerProfile({ level: 16, stamina: 80, economy: towerEconomy(), materials: { ore: 30, herb: 20, soul: 100, clue: 3 },
  weapons: [{ id: 'w1', quality: 3, spareCopies: 0, affixes: ['leech'] }], availableActions: ['shop_purchase', 'use_rune', 'market'],
  expansion: { version: 1, skillPages: 30, essences: 10, weaponBoxes: 9, weaponBoxPity: 9, riftsToday: 0, meditationsToday: 0, weeklyBossAttempts: 0, week: '2026-09-07', claimedBossFloors: [], passageTokens: 0, titles: [], skin: 'field', unlockedSkins: ['field'] },
});
const props = () => ({ profile: profile(), catalog: towerCatalog(), now: TOWER_TEST_NOW, disabled: false, balance: 500, balanceStale: false, onAction: vi.fn().mockResolvedValue(true), onExplore: vi.fn(), onWorkshop: vi.fn() });
function RouteProbe() { const location = useLocation(); const navigate = useNavigate(); return <><output aria-label="物资位置">{location.search}</output><button onClick={() => navigate(-1)}>后退</button><button onClick={() => navigate(1)}>前进</button></>; }
const wrap = (value = props(), route = '/games/demon-tower?tab=shop') => render(<MemoryRouter initialEntries={[route]}><DemonTowerShop {...value} /><RouteProbe /></MemoryRouter>);

describe('Demon tower unified supply desk', () => {
  it('separates three currencies, declares daily limits, and shows only the selected inventory', () => {
    wrap(); expect(screen.getByRole('heading', { name: '内部物资申领单' })).toBeVisible();
    const balances = screen.getByLabelText('妖塔资源余额');
    expect(within(balances).getByText('200')).toBeVisible(); expect(within(balances).getByText('100')).toBeVisible(); expect(within(balances).getByText('500')).toBeVisible();
    expect(screen.getByText(/今日灵石 130\/200.*首领 50\/100.*总额内/)).toBeVisible();
    expect(screen.getByText(/不互兑、不转赠/)).toBeVisible();
    expect(screen.queryByRole('button', { name: '申领精级武器箱' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '残魂秘市' }));
    expect(screen.getByRole('button', { name: '申领精级武器箱' })).toBeVisible();
    expect(screen.getByRole('button', { name: '武器箱 · 12残魂' })).toBeVisible();
    expect(screen.getByText(/武器箱累计 9 个.*本轮 9\/10/)).toBeVisible();
    expect(screen.queryByRole('button', { name: '申领小体力包' })).toBeNull();
  });
  it('submits only a server-priced offer and checked quantity after explicit confirmation, without wallet or reward fields', async () => {
    const value = props(); wrap(value);
    fireEvent.click(screen.getByRole('button', { name: '申领小体力包' }));
    expect(value.onAction).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', { name: '确认物资申领' });
    fireEvent.change(within(dialog).getByRole('spinbutton', { name: '申领数量' }), { target: { value: '2' } });
    expect(within(dialog).getByText('合计：40 灵石')).toBeVisible();
    fireEvent.click(within(dialog).getByRole('button', { name: '确认申领' }));
    expect(value.onAction).toHaveBeenCalledExactlyOnceWith({ kind: 'shop_purchase', payload: { offerId: 'stamina_small', quantity: 2 } });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('resets quantity on cancel, another offer, and remounting for a new account', () => {
    const value = props(); const view = wrap(value);
    fireEvent.click(screen.getByRole('button', { name: '申领小体力包' }));
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '3' } }); fireEvent.click(screen.getByRole('button', { name: '取消' }));
    fireEvent.click(screen.getByRole('button', { name: '申领力量药丸' })); expect(screen.getByRole('spinbutton')).toHaveValue(1);
    view.rerender(<MemoryRouter><DemonTowerShop key="other-account-session" {...value} profile={{ ...value.profile, economy: towerEconomy({ balance: 0 }) }} /></MemoryRouter>);
    expect(screen.queryByRole('dialog')).toBeNull(); expect(value.onAction).not.toHaveBeenCalled();
  });
  it.each(['', '0', '-1', '1.5', '6'])('rejects invalid quantity %s without action', input => {
    const value = props(); wrap(value); fireEvent.click(screen.getByRole('button', { name: '申领小体力包' }));
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: input } });
    expect(screen.getByRole('button', { name: '确认申领' })).toBeDisabled(); expect(value.onAction).not.toHaveBeenCalled();
  });
  it('checks total affordability, full-stamina waste, healing batch size and limits before confirmation', () => {
    expect(towerShopQuantityReason(small, 5, { ...profile(), economy: towerEconomy({ balance: 90 }) })).toMatch(/灵石不足/);
    expect(towerShopQuantityReason(small, 2, { ...profile(), stamina: 95 })).toMatch(/体力空余 5.*需要 6/);
    expect(towerShopQuantityReason(offers()[2], 2, profile())).toMatch(/每次只能申领 1/);
    expect(towerShopQuantityReason({ ...small, remaining: 1 }, 2, profile())).toMatch(/还可申领 1/);
  });
  it('renders disabled server reasons, maintenance and updates an open confirmation when limits change', () => {
    const value = props(); value.profile.economy = towerEconomy({ offers: [{ ...small, available: false, reason: 'STAMINA_SPACE_REQUIRED' }] });
    const view = wrap(value); expect(screen.getByRole('button', { name: '申领小体力包' })).toBeDisabled(); expect(screen.getByText(/体力空余不足/)).toBeVisible();
    view.rerender(<MemoryRouter><DemonTowerShop {...props()} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: '申领小体力包' }));
    view.rerender(<MemoryRouter><DemonTowerShop {...props()} profile={{ ...profile(), economy: towerEconomy({ offers: [{ ...small, available: false, reason: 'SHOP_LIMIT_REACHED', remaining: 0, purchased: 5 }] }) }} /></MemoryRouter>);
    expect(screen.getByRole('button', { name: '确认申领' })).toBeDisabled(); expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('限购');
    view.rerender(<MemoryRouter><DemonTowerShop {...props()} disabled /></MemoryRouter>);
    expect(screen.getByRole('button', { name: '确认申领' })).toBeDisabled();
  });
  it('retains an uncertain confirmation, never auto-retries and stops simultaneous double clicks', async () => {
    let resolve!: (value: boolean) => void;
    const value = props(); value.onAction.mockImplementation(() => new Promise<boolean>(yes => { resolve = yes; })); wrap(value);
    fireEvent.click(screen.getByRole('button', { name: '申领小体力包' })); const confirm = screen.getByRole('button', { name: '确认申领' });
    fireEvent.click(confirm); fireEvent.click(confirm); expect(value.onAction).toHaveBeenCalledOnce();
    await act(async () => resolve(false)); expect(screen.getByRole('dialog')).toBeVisible(); expect(value.onAction).toHaveBeenCalledOnce();
  });
  it('uses history-preserving supply URLs without a redundant cross-tab return control', () => {
    const value = props(); wrap(value, '/games/demon-tower?tab=shop&supply=market&keep=1');
    expect(screen.getByRole('button', { name: '残魂秘市' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('button', { name: '收支记录' })); expect(screen.getByLabelText('物资位置')).toHaveTextContent('tab=shop&supply=ledger&keep=1');
    fireEvent.click(screen.getByRole('button', { name: '后退' })); expect(screen.getByRole('button', { name: '残魂秘市' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('button', { name: '前进' })); expect(screen.getByRole('button', { name: '收支记录' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('button', { name: '返回探索任务' })).toBeNull(); expect(value.onExplore).not.toHaveBeenCalled();
  });
  it('requires a named replacement for a full quality-unlocked rune slot and preserves unrelated affixes', async () => {
    const value = props(); wrap(value, '/games/demon-tower?tab=shop&supply=effects');
    expect(screen.getByRole('button', { name: '检查并装配符文' })).toBeDisabled();
    fireEvent.change(screen.getByRole('combobox', { name: '替换旧词条' }), { target: { value: 'leech' } });
    fireEvent.click(screen.getByRole('button', { name: '检查并装配符文' })); expect(value.onAction).not.toHaveBeenCalled();
    expect(within(screen.getByRole('dialog')).getByText(/旧词条不会返还/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '确认装配' }));
    expect(value.onAction).toHaveBeenCalledExactlyOnceWith({ kind: 'use_rune', payload: { rune: 'critical', itemId: 'w1', replace: 'leech' } });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('blocks zero-stock, duplicate and below-quality runes while allowing newly unlocked empty slots', () => {
    const value = props(); const view = wrap(value, '/games/demon-tower?tab=shop&supply=effects');
    fireEvent.change(screen.getByRole('combobox', { name: '使用符文' }), { target: { value: 'boss_damage' } });
    expect(screen.getByRole('button', { name: '检查并装配符文' })).toBeDisabled();
    fireEvent.change(screen.getByRole('combobox', { name: '使用符文' }), { target: { value: 'critical' } });
    view.rerender(<MemoryRouter><DemonTowerShop {...value} profile={{ ...value.profile, weapons: [{ id: 'w1', quality: 2, spareCopies: 0 }] }} /></MemoryRouter>);
    expect(screen.getByText(/武器至少 \+3 才能使用/)).toBeVisible(); expect(screen.getByRole('button', { name: '检查并装配符文' })).toBeDisabled();
    view.rerender(<MemoryRouter><DemonTowerShop {...value} profile={{ ...value.profile, weapons: [{ id: 'w1', quality: 6, spareCopies: 0, affixes: ['critical'] }] }} /></MemoryRouter>);
    expect(screen.getByText(/这件武器已有同名/)).toBeVisible();
    fireEvent.change(screen.getByRole('combobox', { name: '使用符文' }), { target: { value: 'dodge' } });
    expect(screen.getByRole('button', { name: '检查并装配符文' })).toBeEnabled();
  });
  it('marks expired buffs rather than extending them locally and distinguishes permanent points', () => {
    const value = props(); value.now = Date.parse('2026-09-09T16:00:01Z'); wrap(value, '/games/demon-tower?tab=shop&supply=effects');
    expect(screen.getByText(/已到期，等待服务器同步/)).toBeVisible(); expect(screen.getByText('永久 +2/5')).toBeVisible(); expect(screen.queryByText('今日 +5')).toBeNull();
  });
  it('describes ledger scope honestly and renders rune consumption without fake currency deductions', () => {
    const value = props(); value.profile.economy = towerEconomy({ ledger: [
      { id: '1', at: TOWER_TEST_NOW, kind: 'rune', description: '装配符文', amount: 0, balance: 100, currency: 'soul' },
      { id: '2', at: TOWER_TEST_NOW, kind: 'purchase', description: '小体力包 ×1', amount: -20, balance: 180, currency: 'spirit_stone' },
    ] }); wrap(value, '/games/demon-tower?tab=shop&supply=ledger');
    expect(screen.getByText(/传统残魂兑换、其他残魂来源不补录/)).toBeVisible();
    expect(screen.getByText('消耗符文 ×1')).toBeVisible(); expect(screen.getByText('-20 灵石')).toBeVisible(); expect(screen.queryByText('0 残魂')).toBeNull();
  });
});
