import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { communityDemonTowerApi } from '../../../api/community-demon-tower';
import { DemonTowerPage } from './DemonTowerPage';
import { useDemonTower, type DemonTowerState } from './useDemonTower';
import { TOWER_TEST_NOW, towerCatalog, towerOverview, towerProfile, towerWorld } from './test-fixtures';

vi.mock('./useDemonTower', () => ({ useDemonTower: vi.fn() }));
vi.mock('./DemonTowerExpansion', async importOriginal => ({ ...await importOriginal<typeof import('./DemonTowerExpansion')>(), demonTowerExpansionUIEnabled: true }));

function state(): DemonTowerState {
  return {
    ownerId: 'tower-user-a', displayName: '合成寻道者', catalog: towerCatalog(),
    overview: towerOverview({ profile: towerProfile({ expansion: {
      version: 1, skillPages: 0, essences: 0, weaponBoxes: 0, weaponBoxPity: 0,
      riftsToday: 0, meditationsToday: 0, weeklyBossAttempts: 0, week: '2026-09-07',
      claimedBossFloors: [], passageTokens: 0, titles: [], skin: 'field', unlockedSkins: ['field'],
    } }) }),
    receipt: null, loading: false, refreshing: false, busy: false, pending: false, stale: false,
    error: null, now: TOWER_TEST_NOW, act: vi.fn().mockResolvedValue(true), retry: vi.fn(),
    refresh: vi.fn(), dismissReceipt: vi.fn(), observeOverview: vi.fn(),
  };
}
function LocationProbe() {
  const location = useLocation(), navigate = useNavigate();
  return <><output aria-label="页面位置">{location.search}</output><button onClick={() => navigate(-1)}>返回上一页</button></>;
}
function wrap(tab: string) {
  return render(<MemoryRouter initialEntries={[`/games/demon-tower?tab=${tab}&supply=ledger&keep=1`]}><DemonTowerPage /><LocationProbe /></MemoryRouter>);
}

describe('Demon tower six-workspace menu integration', () => {
  beforeEach(() => {
    vi.mocked(useDemonTower).mockReturnValue(state());
    vi.spyOn(communityDemonTowerApi, 'contributions').mockResolvedValue({ serverNow: TOWER_TEST_NOW, floor: 1, entries: [], me: null, rewardDescription: '合成贡献档案' });
    vi.spyOn(communityDemonTowerApi, 'social').mockResolvedValue({ enabled: true, serverNow: TOWER_TEST_NOW, opponents: [], friends: [], squads: [] });
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it.each(['profile', 'explore', 'loadout', 'expansion', 'shop', 'world', 'journal'])('retains the stable %s deep link and unrelated supply/query parameters', async tab => {
    wrap(tab);
    await act(async () => {});
    expect(screen.getAllByRole('tab')).toHaveLength(6);
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', `tower-panel-${tab === 'journal' ? 'world' : tab}`);
    expect(screen.getByLabelText('页面位置')).toHaveTextContent(`tab=${tab === 'journal' ? 'world' : tab}&supply=ledger&keep=1`);
    if (tab === 'journal') {
      expect(screen.getByLabelText('页面位置')).toHaveTextContent('worldSection=journal');
      expect(screen.getByRole('region', { name: '行动战报' })).toHaveFocus();
    }
    expect(useDemonTower().act).not.toHaveBeenCalled();
  });

  it.each([
    [false, 1, '继续积累活跃'],
    [false, 3, '领取活跃奖励'],
    [true, 3, '今日已领取'],
  ] as const)('keeps a single compact daily card after the tabs on every workspace (%s/%s)', async (claimed, activity, label) => {
    const value = state();
    Object.assign(value.overview!.profile!.daily, { rewardClaimed: claimed, activity });
    vi.mocked(useDemonTower).mockReturnValue(value); wrap('profile');
    const summary = screen.getByRole('region', { name: '今日工作小结' });
    expect(within(summary).getByRole('button', { name: label })).toBeVisible();
    expect(screen.getByRole('tablist').nextElementSibling).toBe(summary);
    for (const tab of screen.getAllByRole('tab')) {
      fireEvent.click(tab);
      await act(async () => {});
      expect(screen.getByRole('region', { name: '今日工作小结' })).toBe(summary);
      expect(screen.getAllByRole('heading', { name: '今日工作小结', hidden: true })).toHaveLength(1);
    }
    expect(screen.queryByLabelText('今日日常摘要')).toBeNull();
    expect(value.act).not.toHaveBeenCalled();
  });

  it.each(['boss', 'passage', 'complete'] as const)('links every visible world segment in the %s phase without hiding or remounting content', async phase => {
    const value = state(); value.overview!.world = towerWorld({ phase });
    vi.mocked(useDemonTower).mockReturnValue(value); wrap('world');
    await act(async () => {});
    const navigation = screen.getByRole('navigation', { name: '协作世界分段导航' });
    const links = within(navigation).getAllByRole('button');
    expect(links).toHaveLength(phase === 'passage' ? 8 : 7);
    expect(within(navigation).queryByRole('button', { name: '通道建设' }) !== null).toBe(phase === 'passage');
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
    const scrolled: string[] = [];
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: function (this: HTMLElement) { scrolled.push(this.id); } });
    try {
      for (const link of links) {
        const id = link.getAttribute('aria-controls')!;
        const target = document.getElementById(id)!;
        expect(target).toBeVisible();
        fireEvent.click(link);
        expect(target).toHaveFocus();
        expect(document.getElementById(id)).toBe(target);
        expect(scrolled.at(-1)).toBe(id);
      }
    } finally {
      if (original) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', original);
      else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
    }
    expect(communityDemonTowerApi.contributions).toHaveBeenCalledTimes(1);
    expect(communityDemonTowerApi.social).toHaveBeenCalledTimes(1);
    expect(value.act).not.toHaveBeenCalled();
    expect(screen.getByLabelText('页面位置')).toHaveTextContent('tab=world&supply=ledger&keep=1');
  });

  it('does not advertise missing expansion segments and preserves an edited construction form when jumping', async () => {
    const value = state(); value.overview!.profile!.expansion = undefined; value.overview!.world.phase = 'passage';
    vi.mocked(useDemonTower).mockReturnValue(value); wrap('world');
    await act(async () => {});
    const navigation = screen.getByRole('navigation', { name: '协作世界分段导航' });
    expect(within(navigation).getAllByRole('button')).toHaveLength(5);
    expect(within(navigation).queryByRole('button', { name: '论道与好友' })).toBeNull();
    const amount = screen.getByRole('textbox', { name: '提交数量' });
    fireEvent.change(amount, { target: { value: '2' } });
    fireEvent.click(within(navigation).getByRole('button', { name: '贡献档案' }));
    fireEvent.click(within(navigation).getByRole('button', { name: '通道建设' }));
    expect(screen.getByRole('textbox', { name: '提交数量' })).toBe(amount);
    expect(amount).toHaveValue('2'); expect(value.act).not.toHaveBeenCalled();
  });

  it('clarifies cultivation without losing an unsaved loadout across the workshop round trip or browser back', () => {
    const value = state(); vi.mocked(useDemonTower).mockReturnValue(value); wrap('loadout');
    const weapon = screen.getByRole('heading', { name: `${value.catalog!.weapons.find(item => item.id === 'w5')!.name} +1` }).closest('article')!;
    fireEvent.click(within(weapon).getByRole('button', { name: '选作主手' }));
    expect(screen.getByText('有未保存调整')).toBeVisible();
    expect(within(weapon).queryByRole('button', { name: '品质强化' })).toBeNull();
    fireEvent.click(within(weapon).getByRole('button', { name: '去养成' }));
    expect(screen.getByRole('heading', { name: '养成工坊 · 星级 / 稀有度 / 品质' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: '成长工坊物品' })).toHaveValue('w5');
    expect(screen.getByLabelText('页面位置')).toHaveTextContent('tab=expansion&supply=ledger&keep=1&item=w5');
    expect(screen.getByRole('button', { name: '稀有度突破' })).toBeVisible();
    expect(value.act).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('tab', { name: '装备' }));
    expect(screen.getByText('有未保存调整')).toBeVisible();
    expect(within(weapon).getByRole('button', { name: '当前主手' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '返回上一页' }));
    expect(screen.getByRole('combobox', { name: '成长工坊物品' })).toHaveValue('w5');
    fireEvent.click(screen.getByRole('tab', { name: '装备' }));
    expect(within(weapon).getByRole('button', { name: '当前主手' })).toBeVisible();
    expect(screen.getByLabelText('页面位置')).toHaveTextContent('tab=loadout&supply=ledger&keep=1');
    expect(value.act).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '保存配装' }));
    expect(value.act).toHaveBeenCalledExactlyOnceWith({ kind: 'equip', payload: { ...value.overview!.profile!.loadout, mainHand: 'w5' } });
  });

  it('uses an intrinsic profile grid and shrinkable content rather than viewport-only columns or clipping', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/features/games/demon-tower/DemonTower.module.css'), 'utf8');
    const profileRule = css.match(/\.profileLayout\s*\{([^}]+)\}/)![1];
    expect(profileRule).toContain('repeat(auto-fit, minmax(min(100%, 400px), 1fr))');
    expect(profileRule).toContain('min-width: 0');
    expect(profileRule).not.toMatch(/overflow:\s*(hidden|clip)|contain:/);
    expect(css).toContain('.profileLayout .itemGrid { grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr))');
    expect(css).toContain('.profileLayout .attributeLabel { flex-wrap: wrap');
    expect(css).toContain('.profileLayout .wallet { flex-wrap: wrap');
    expect(css).toContain('.profileLayout .panelHeading { flex-wrap: wrap');
    wrap('profile');
    const layout = screen.getByRole('tabpanel').firstElementChild!;
    expect(layout.className).toMatch(/profileLayout/);
    expect(layout.className).not.toMatch(/\blayout\b/);
    expect(screen.getAllByRole('button', { name: /分配 1 点/ })).toHaveLength(5);
  });

  it('labels exactly six stable main destinations and never adds a seventh journal tab', () => {
    wrap('profile');
    expect(screen.getAllByRole('tab').map(tab => tab.querySelector('span')?.textContent)).toEqual(['成长', '探索', '装备', '养成', '物资', '协作']);
    expect(screen.queryByRole('tab', { name: '行动战报' })).toBeNull();
    expect(document.getElementById('tower-panel-journal')).toBeNull();
  });

  it('lands a legacy journal link on its report section after asynchronous profile loading without scrolling back to the tabs', async () => {
    const value = state(); vi.mocked(useDemonTower).mockReturnValue({ ...value, overview: null, loading: true });
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
    const scrolled: string[] = [];
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: function(this: HTMLElement) { scrolled.push(this.id); } });
    try {
      const view = wrap('journal');
      await act(async () => {});
      expect(screen.getByLabelText('页面位置')).toHaveTextContent('tab=world&supply=ledger&keep=1&worldSection=journal');
      expect(scrolled).toEqual([]);
      vi.mocked(useDemonTower).mockReturnValue(value);
      view.rerender(<MemoryRouter><DemonTowerPage /><LocationProbe /></MemoryRouter>);
      await act(async () => {});
      expect(scrolled.at(-1)).toBe('tower-world-journal');
      expect(screen.getByRole('region', { name: '行动战报' })).toHaveFocus();
    } finally {
      if (original) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', original);
      else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
    }
  });

  it.each([320, 390])('reveals the collaboration tab horizontally at %s px while a delayed legacy journal link stays on the report', async width => {
    const value = state(); vi.mocked(useDemonTower).mockReturnValue({ ...value, overview: null, loading: true });
    const originalWidth = window.innerWidth;
    const originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
    const originalBounds = HTMLElement.prototype.getBoundingClientRect;
    const scrolled: string[] = [];
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: function(this: HTMLElement) { scrolled.push(this.id); } });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function(this: HTMLElement) {
      if (this.matches('[role="tablist"]')) return { left: 12, right: width - 12, top: 670, width: width - 24, height: 60, bottom: 730 } as DOMRect;
      if (this.id === 'tower-tab-world') {
        const offset = this.closest<HTMLElement>('[role="tablist"]')!.scrollLeft;
        return { left: 430 - offset, right: 500 - offset, width: 70, height: 44, top: 680, bottom: 724 } as DOMRect;
      }
      return originalBounds.call(this);
    });
    try {
      const view = wrap('journal'); await act(async () => {});
      expect(scrolled).toEqual([]);
      vi.mocked(useDemonTower).mockReturnValue(value);
      view.rerender(<MemoryRouter><DemonTowerPage /><LocationProbe /></MemoryRouter>);
      await act(async () => {});
      const strip = screen.getByRole('tablist'), selected = screen.getByRole('tab', { name: '协作' });
      expect(strip.scrollLeft).toBe(500 - (width - 12));
      expect(selected.getBoundingClientRect().right).toBeLessThanOrEqual(strip.getBoundingClientRect().right);
      expect(selected.getBoundingClientRect().left).toBeGreaterThanOrEqual(strip.getBoundingClientRect().left);
      expect(selected).toHaveAttribute('aria-selected', 'true');
      expect(scrolled).toEqual(['tower-world-journal']);
      expect(screen.getByRole('region', { name: '行动战报' })).toHaveFocus();
      expect(screen.getByLabelText('页面位置')).toHaveTextContent('tab=world&supply=ledger&keep=1&worldSection=journal');
      view.rerender(<MemoryRouter><DemonTowerPage /><LocationProbe /></MemoryRouter>);
      expect(scrolled).toEqual(['tower-world-journal']);
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
      if (originalScroll) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScroll);
      else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
    }
  });

  it('groups all three expedition entry points in exploration without changing their actions', async () => {
    const value = state(); value.overview!.profile!.availableActions.push('expedition');
    vi.mocked(useDemonTower).mockReturnValue(value); wrap('expansion');
    expect(screen.queryByRole('button', { name: '进入小秘境' })).toBeNull();
    expect(screen.queryByRole('button', { name: '前往灵气点' })).toBeNull();
    expect(screen.queryByRole('button', { name: '挑战周常守关者' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: '探索' }));
    expect(screen.getByRole('button', { name: '进入小秘境' })).toBeVisible();
    expect(screen.getByRole('button', { name: '挑战周常守关者' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '前往灵气点' }));
    expect(value.act).toHaveBeenCalledExactlyOnceWith({ kind: 'expedition', payload: { mode: 'meditate' } });
    await act(async () => {});
  });

  it('resolves weapon and skill cultivation deep links safely, preserves extra query, and submits only after confirmation', async () => {
    const value = state(); value.overview!.profile!.level = 31;
    vi.mocked(useDemonTower).mockReturnValue(value); wrap('expansion&item=s1');
    expect(screen.getByRole('combobox', { name: '成长工坊物品' })).toHaveValue('s1');
    expect(value.act).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '品质强化 +N' }));
    const modal = screen.getByRole('dialog');
    expect(modal).toHaveTextContent('回春术');
    expect(value.act).not.toHaveBeenCalled();
    fireEvent.click(within(modal).getByRole('button', { name: '确认强化至 +2' }));
    expect(value.act).toHaveBeenCalledExactlyOnceWith({ kind: 'upgrade', payload: { itemType: 'skill', itemId: 's1' } });
    await act(async () => {});
    fireEvent.change(screen.getByRole('combobox', { name: '成长工坊物品' }), { target: { value: 'w5' } });
    expect(screen.getByLabelText('页面位置')).toHaveTextContent('tab=expansion&item=w5&supply=ledger&keep=1');
    expect(value.act).toHaveBeenCalledTimes(1);
  });

  it('does not act on arbitrary item query values and clearly falls back to owned inventory', () => {
    wrap('expansion&item=https%3A%2F%2Finvalid.test%2Fitem');
    expect(screen.getByText(/链接中的物品尚未拥有或已变化/)).toBeVisible();
    expect(screen.getByRole('combobox', { name: '成长工坊物品' })).toHaveValue('w1');
    expect(useDemonTower().act).not.toHaveBeenCalled();
  });

  it('unmounts contribution and social polling when leaving collaboration, but keeps forms while jumping to reports or squad', async () => {
    vi.useFakeTimers();
    try {
      const value = state(); value.overview!.world.phase = 'passage'; vi.mocked(useDemonTower).mockReturnValue(value); wrap('world');
      await act(async () => {});
      const amount = screen.getByRole('textbox', { name: '提交数量' });
      fireEvent.change(amount, { target: { value: '3' } });
      const nav = screen.getByRole('navigation', { name: '协作世界分段导航' });
      for (const name of ['行动战报', '同心小队', '通道建设']) fireEvent.click(within(nav).getByRole('button', { name }));
      expect(screen.getByRole('textbox', { name: '提交数量' })).toBe(amount); expect(amount).toHaveValue('3');
      const contributions = vi.mocked(communityDemonTowerApi.contributions).mock.calls.length;
      const social = vi.mocked(communityDemonTowerApi.social).mock.calls.length;
      fireEvent.click(screen.getByRole('tab', { name: '装备' }));
      await act(async () => vi.advanceTimersByTimeAsync(35_000));
      expect(communityDemonTowerApi.contributions).toHaveBeenCalledTimes(contributions);
      expect(communityDemonTowerApi.social).toHaveBeenCalledTimes(social);
      expect(value.act).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it('removes generic back-to-explore/workshop buttons while keeping the top-level tabs', () => {
    wrap('shop');
    expect(screen.queryByRole('button', { name: /返回探索|返回进行中探索|前往成长工坊|前往物资申领/ })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: '养成' }));
    expect(screen.queryByRole('button', { name: /前往装备强化|前往物资申领/ })).toBeNull();
    expect(screen.getAllByRole('tab')).toHaveLength(6);
    expect(useDemonTower().act).not.toHaveBeenCalled();
  });

  it('bounds the equipment DOM with six accessible cards and compact intrinsic CSS instead of vertical clipping', () => {
    wrap('loadout'); fireEvent.click(screen.getByRole('button', { name: '查看完整图鉴' }));
    expect(screen.getAllByRole('article')).toHaveLength(6);
    expect(screen.getByRole('navigation', { name: '物品档案分页' })).toBeVisible();
    expect(screen.getByText('收集与培养说明')).toBeVisible();
    const css = readFileSync(resolve(process.cwd(), 'src/features/games/demon-tower/DemonTowerInventory.module.css'), 'utf8');
    expect(css).toContain('minmax(min(100%, 210px), 1fr)');
    expect(css).toContain('.cardHeading h3 { font-size: 13px');
    expect(css).toContain('.cardActions > button { min-height: 32px');
    expect(css).not.toMatch(/max-height|overflow(?:-y)?:\s*(?:hidden|clip)/);
  });
});
