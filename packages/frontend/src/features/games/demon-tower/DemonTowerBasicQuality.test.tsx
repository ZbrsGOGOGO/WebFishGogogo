import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DemonTowerPage } from './DemonTowerPage';
import { useDemonTower, type DemonTowerState } from './useDemonTower';
import { TOWER_TEST_NOW, towerCatalog, towerOverview } from './test-fixtures';

vi.mock('./useDemonTower', () => ({ useDemonTower: vi.fn() }));
vi.mock('./DemonTowerExpansion', async importOriginal => ({ ...await importOriginal<typeof import('./DemonTowerExpansion')>(), demonTowerExpansionUIEnabled: false }));

function LocationProbe() { return <output aria-label="页面位置">{useLocation().search}</output>; }
function wrap(tab: string) {
  return render(<MemoryRouter initialEntries={[`/games/demon-tower?tab=${tab}&keep=1`]}><DemonTowerPage /><LocationProbe /></MemoryRouter>);
}

describe('Demon tower basic cultivation with expansion UI disabled', () => {
  let state: DemonTowerState;
  beforeEach(() => {
    state = {
      ownerId: 'tower-user-a', displayName: '合成寻道者', catalog: towerCatalog(), overview: towerOverview(),
      receipt: null, loading: false, refreshing: false, busy: false, pending: false, stale: false,
      error: null, now: TOWER_TEST_NOW, act: vi.fn().mockResolvedValue(true), retry: vi.fn(),
      refresh: vi.fn(), dismissReceipt: vi.fn(), observeOverview: vi.fn(),
    };
    vi.mocked(useDemonTower).mockReturnValue(state);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('keeps the stable cultivation deep link, legacy upgrade, and confirmation while hiding advanced-only supply', async () => {
    wrap('expansion&item=w5');
    expect(screen.getAllByRole('tab').map(tab => tab.querySelector('span')?.textContent)).toEqual(['成长', '探索', '装备', '养成', '协作']);
    expect(screen.getByRole('tab', { name: '养成' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'tower-panel-expansion');
    expect(screen.getByRole('combobox', { name: '成长工坊物品' })).toHaveValue('w5');
    expect(screen.getByRole('heading', { name: '养成工坊 · 基础品质强化' })).toBeVisible();
    expect(screen.queryByRole('button', { name: '残魂升星 · 40残魂' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '品质强化 +N' }));
    expect(state.act).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '确认强化至 +2' }));
    expect(state.act).toHaveBeenCalledExactlyOnceWith({ kind: 'upgrade', payload: { itemType: 'weapon', itemId: 'w5' } });
    await act(async () => {});
  });

  it('provides the sole cultivation route from owned equipment without saving or discarding a loadout draft', () => {
    wrap('loadout');
    const name = state.catalog!.weapons.find(item => item.id === 'w5')!.name;
    const weapon = screen.getByRole('heading', { name: `${name} +1` }).closest('article')!;
    fireEvent.click(within(weapon).getByRole('button', { name: '选作主手' }));
    expect(screen.getByText('有未保存调整')).toBeVisible();
    expect(within(weapon).queryByRole('button', { name: /品质强化/ })).toBeNull();
    fireEvent.click(within(weapon).getByRole('button', { name: '去养成' }));
    expect(screen.getByLabelText('页面位置')).toHaveTextContent('tab=expansion&keep=1&item=w5');
    expect(screen.getByRole('button', { name: '品质强化 +N' })).toBeEnabled();
    fireEvent.click(screen.getByRole('tab', { name: '装备' }));
    expect(screen.getByText('有未保存调整')).toBeVisible();
    expect(within(weapon).getByRole('button', { name: '当前主手' })).toBeVisible();
    expect(state.act).not.toHaveBeenCalled();
  });
});
