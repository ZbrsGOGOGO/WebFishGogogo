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

describe('Demon tower first-stage menu integration', () => {
  beforeEach(() => {
    vi.mocked(useDemonTower).mockReturnValue(state());
    vi.spyOn(communityDemonTowerApi, 'contributions').mockResolvedValue({ serverNow: TOWER_TEST_NOW, floor: 1, entries: [], me: null, rewardDescription: '合成贡献档案' });
    vi.spyOn(communityDemonTowerApi, 'social').mockResolvedValue({ enabled: true, serverNow: TOWER_TEST_NOW, opponents: [], friends: [], squads: [] });
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it.each(['profile', 'explore', 'loadout', 'expansion', 'shop', 'world', 'journal'])('retains the stable %s deep link and unrelated supply/query parameters', async tab => {
    wrap(tab);
    await act(async () => {});
    expect(screen.getAllByRole('tab')).toHaveLength(7);
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', `tower-panel-${tab}`);
    expect(screen.getByLabelText('页面位置')).toHaveTextContent(`tab=${tab}&supply=ledger&keep=1`);
    expect(useDemonTower().act).not.toHaveBeenCalled();
  });

  it.each([
    [false, 1, '继续探索或修炼积累活跃'],
    [false, 3, '活跃目标已达成，前往探索页核验领取'],
    [true, 3, '活跃奖励已结算'],
  ] as const)('renders only one full daily panel; profile summary never claims implicitly (%s/%s)', (claimed, activity, label) => {
    const value = state();
    Object.assign(value.overview!.profile!.daily, { rewardClaimed: claimed, activity });
    vi.mocked(useDemonTower).mockReturnValue(value); wrap('profile');
    const summary = screen.getByLabelText('今日日常摘要');
    expect(summary).toHaveTextContent(label);
    expect(screen.queryByRole('heading', { name: '今日工作小结' })).toBeNull();
    expect(screen.getAllByRole('heading', { name: '今日工作小结', hidden: true })).toHaveLength(1);
    fireEvent.click(within(summary).getByRole('button', { name: '查看日常与领取' }));
    expect(screen.getByRole('heading', { name: '今日工作小结' })).toBeVisible();
    expect(value.act).not.toHaveBeenCalled();
    expect(screen.getByLabelText('页面位置')).toHaveTextContent('tab=explore&supply=ledger&keep=1');
  });

  it.each(['boss', 'passage', 'complete'] as const)('links every visible world segment in the %s phase without hiding or remounting content', async phase => {
    const value = state(); value.overview!.world = towerWorld({ phase });
    vi.mocked(useDemonTower).mockReturnValue(value); wrap('world');
    await act(async () => {});
    const navigation = screen.getByRole('navigation', { name: '协作世界分段导航' });
    const links = within(navigation).getAllByRole('button');
    expect(links).toHaveLength(phase === 'passage' ? 7 : 6);
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
    expect(within(navigation).getAllByRole('button')).toHaveLength(4);
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
    expect(within(weapon).getByRole('button', { name: '品质强化' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '前往升星与突破' }));
    expect(screen.getByRole('heading', { name: '星级与稀有度工坊' })).toBeVisible();
    expect(screen.getByRole('button', { name: '稀有度突破' })).toBeVisible();
    expect(value.act).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '前往装备强化' }));
    expect(screen.getByText('有未保存调整')).toBeVisible();
    expect(within(weapon).getByRole('button', { name: '当前主手' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '返回上一页' }));
    fireEvent.click(screen.getByRole('button', { name: '前往装备强化' }));
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
});
