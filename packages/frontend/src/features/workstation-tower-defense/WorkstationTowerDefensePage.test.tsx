import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkstationTowerDefensePage, type WorkstationTowerDefenseCharacter } from './WorkstationTowerDefensePage';
import * as engine from './tower-defense-logic';
import styles from './WorkstationTowerDefensePage.module.css';

const OLD_SETTINGS_KEY = 'momo.workstation-tower-defense.settings.v1';
const SETTINGS_KEY = 'momo.workstation-tower-defense.settings.v2';

function renderPage(character?: WorkstationTowerDefenseCharacter) {
  return render(<WorkstationTowerDefensePage character={character} />);
}
function coins(): number { return Number(screen.getByLabelText('局内金币').textContent?.replace(/\D/g, '')); }
function buyStarterTower(): void {
  for (const slot of [1, 2, 3]) {
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`购买第 ${slot} 格订书机零件`) }));
  }
}
function useInitialState(overrides: Partial<engine.TowerDefenseState>): void {
  const initial = engine.createTowerDefenseState();
  vi.spyOn(engine, 'createTowerDefenseState').mockReturnValue({ ...initial, ...overrides });
}

describe('WorkstationTowerDefensePage merging edition', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.spyOn(Math, 'random').mockReturnValue(0.314159); window.localStorage.clear(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('renders one hero, 96 board cells, five shop slots and all office tower silhouettes without network access', () => {
    const fetchSpy = vi.fn(); vi.stubGlobal('fetch', fetchSpy);
    renderPage();
    expect(screen.getByRole('heading', { name: /工位合成塔防/ })).toBeInTheDocument();
    const board = screen.getByRole('group', { name: /工位塔防地图/ });
    expect(board.querySelectorAll(`.${styles.cell}`)).toHaveLength(96);
    expect(board.querySelectorAll(`.${styles.hero}`)).toHaveLength(1);
    expect(within(screen.getByLabelText('五格零件商店')).getAllByRole('button')).toHaveLength(5);
    for (const type of ['single', 'slow', 'splash', 'push', 'shred']) expect(document.querySelector(`svg[data-art="${type}"]`)).not.toBeNull();
    expect(screen.getByText('游客同事 · 工位守卫')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '开始工位塔防' })).toBeEnabled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('shows the injected identity, including a complete emoji mark', () => {
    renderPage({ displayName: '小张', avatarKey: 'green', avatarMark: '🌱' });
    expect(screen.getByText('小张 · 工位守卫')).toBeInTheDocument();
    expect(document.querySelector('[data-avatar="green"]')).not.toBeNull();
    expect(document.querySelector(`.${styles.hero} text`)?.textContent).toBe('🌱');
  });

  it('buys a plant with local coins and only earns income while running', () => {
    renderPage(); const initialCoins = coins();
    fireEvent.click(screen.getByRole('button', { name: '购买办公桌绿植' }));
    expect(coins()).toBe(initialCoins - engine.plantUpgradeCost(0));
    expect(screen.getByLabelText('绿植产币')).toHaveTextContent(`+${engine.plantIncomePerPayout(1)} G`);
    act(() => vi.advanceTimersByTime(60_000));
    expect(coins()).toBe(initialCoins - engine.plantUpgradeCost(0));
    fireEvent.click(screen.getByRole('button', { name: '开始工位塔防' }));
    act(() => vi.advanceTimersByTime(engine.TOWER_PLANT_INCOME_INTERVAL * engine.TOWER_DEFENSE_TICK_MS));
    expect(coins()).toBe(initialCoins - engine.plantUpgradeCost(0) + engine.plantIncomePerPayout(1));
  });

  it('buys three starter parts, auto-merges, deploys a second-tier tower, and sells it', () => {
    renderPage(); fireEvent.click(screen.getByRole('button', { name: '购买办公桌绿植' }));
    fireEvent.click(screen.getByRole('button', { name: /购买第 1 格订书机零件/ }));
    expect(screen.getByRole('button', { name: '待合成订书机 1 阶' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /购买第 2 格订书机零件/ }));
    expect(screen.getAllByRole('button', { name: '待合成订书机 1 阶' })).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: /购买第 3 格订书机零件/ }));
    expect(screen.queryByRole('button', { name: '待合成订书机 1 阶' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('自动合成为 2 阶');
    expect(screen.getByLabelText('背包容量')).toHaveTextContent('1/12');
    const beforeDeploy = coins();
    fireEvent.click(screen.getByRole('button', { name: '选择部署订书机 2 阶' }));
    expect(screen.getByRole('button', { name: '选择部署订书机 2 阶' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: '空塔位 1' }));
    expect(screen.getByRole('button', { name: '塔位 1，订书机 2 阶' })).toBeInTheDocument();
    expect(screen.getByLabelText('背包容量')).toHaveTextContent('0/12');
    expect(coins()).toBe(beforeDeploy);
    fireEvent.click(screen.getByRole('button', { name: '卖出防御塔' }));
    expect(screen.getByRole('button', { name: '空塔位 1' })).toBeInTheDocument();
    expect(coins()).toBeGreaterThan(beforeDeploy);
    expect(within(screen.getByLabelText('五格零件商店')).getAllByRole('button')).toHaveLength(5);
  });

  it('refreshes exactly five shop slots for the displayed local-coin cost', () => {
    renderPage(); const initial = coins();
    const originalOffers = within(screen.getByLabelText('五格零件商店')).getAllByRole('button');
    fireEvent.click(screen.getByRole('button', { name: /刷新零件商店/ }));
    expect(coins()).toBe(initial - engine.TOWER_SHOP_REFRESH_COST);
    expect(within(screen.getByLabelText('五格零件商店')).getAllByRole('button')).toHaveLength(5);
    expect(originalOffers.every((offer) => !offer.isConnected)).toBe(true);
    expect(screen.getByRole('status')).toHaveTextContent('刷新零件');
    expect(screen.getByLabelText('商店可用局内金币')).toHaveTextContent(String(coins()));
  });

  it('prevents unaffordable purchases and upgrades without changing the balance', () => {
    useInitialState({ credits: 0 }); renderPage();
    expect(screen.getByRole('button', { name: '购买办公桌绿植' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /刷新零件商店/ })).toBeDisabled();
    for (const button of within(screen.getByLabelText('五格零件商店')).getAllByRole('button')) expect(button).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /刷新零件商店/ }));
    expect(coins()).toBe(0);
    // The hero remains a recovery path; spending badly must not lock the run.
    expect(screen.getByRole('button', { name: '开始工位塔防' })).toBeEnabled();
  });

  it('explains a full backpack without charging for a rejected purchase', () => {
    useInitialState({ inventory: Array.from({ length: engine.TOWER_INVENTORY_CAPACITY }, (_, index) => ({
      id: `full-${index}`, type: 'single', tier: 3, invested: 162,
    })) });
    renderPage(); const before = coins();
    fireEvent.click(screen.getByRole('button', { name: /购买第 1 格订书机零件/ }));
    expect(screen.getByRole('status')).toHaveTextContent('背包已满');
    expect(coins()).toBe(before);
    expect(screen.getByLabelText('背包容量')).toHaveTextContent('12/12');
  });

  it('retains selected inventory and explains a blocked deployment without spending resources', () => {
    const initial = engine.createTowerDefenseState();
    useInitialState({ hero: { ...initial.hero, ...engine.TOWER_SLOTS[0] } });
    renderPage(); buyStarterTower(); const before = coins();
    fireEvent.click(screen.getByRole('button', { name: '选择部署订书机 2 阶' }));
    fireEvent.click(screen.getByRole('button', { name: '空塔位 1' }));
    expect(screen.getByRole('status')).toHaveTextContent('角色正站在这个工位');
    expect(screen.getByRole('button', { name: '选择部署订书机 2 阶' })).toHaveAttribute('aria-pressed', 'true');
    expect(coins()).toBe(before);
    fireEvent.click(screen.getByRole('button', { name: '空塔位 2' }));
    expect(screen.getByRole('button', { name: '塔位 2，订书机 2 阶' })).toBeInTheDocument();
  });

  it('merges a deployed second-tier tower with two matching backpack towers without charging coins', () => {
    useInitialState({
      towers: [{ id: 'deployed', slotIndex: 0, type: 'single', level: 2, cooldown: 0, invested: 54 }],
      inventory: [{ id: 'spare-1', type: 'single', tier: 2, invested: 54 }, { id: 'spare-2', type: 'single', tier: 2, invested: 54 }],
    });
    renderPage(); const before = coins();
    fireEvent.click(screen.getByRole('button', { name: '塔位 1，订书机 2 阶' }));
    fireEvent.click(screen.getByRole('button', { name: '合成升阶' }));
    expect(screen.getByRole('button', { name: '塔位 1，订书机 3 阶' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '合成升阶' })).toBeDisabled();
    expect(screen.getByLabelText('背包容量')).toHaveTextContent('0/12');
    expect(coins()).toBe(before);
  });

  it('does not spend coins to upgrade when merge materials are missing', () => {
    renderPage(); buyStarterTower();
    fireEvent.click(screen.getByRole('button', { name: '选择部署订书机 2 阶' }));
    fireEvent.click(screen.getByRole('button', { name: '空塔位 1' }));
    const before = coins(); fireEvent.click(screen.getByRole('button', { name: '合成升阶' }));
    expect(coins()).toBe(before);
    expect(screen.getByRole('button', { name: '塔位 1，订书机 2 阶' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('2');
  });

  it('supports touch-only item deployment, movement and range preview', () => {
    vi.stubGlobal('innerWidth', 390); renderPage(); buyStarterTower();
    fireEvent.click(screen.getByRole('button', { name: '选择部署订书机 2 阶' }));
    fireEvent.click(screen.getByRole('button', { name: '空塔位 1' }));
    const board = screen.getByRole('group', { name: /工位塔防地图/ });
    expect(board.querySelectorAll('[data-in-range="true"]').length).toBeGreaterThan(0);
    const heroCell = board.querySelector(`.${styles.hero}`)?.parentElement;
    fireEvent.click(screen.getByRole('button', { name: '向右移动' }));
    expect(board.querySelector(`.${styles.hero}`)?.parentElement).not.toBe(heroCell);
    fireEvent.click(screen.getByRole('button', { name: '显示守卫射程' }));
    expect(screen.getByRole('button', { name: '隐藏守卫射程' })).toHaveAttribute('aria-pressed', 'true');
    expect(board.querySelectorAll(`.${styles.hero}`)).toHaveLength(1);
  });

  it('returns focus from real clicked game buttons so keyboard movement remains usable', () => {
    renderPage();
    const board = screen.getByRole('group', { name: /工位塔防地图/ });
    const startButton = screen.getByRole('button', { name: '开始工位塔防' });
    startButton.focus(); fireEvent.click(startButton);
    expect(board).toHaveFocus();
    const before = board.querySelector(`.${styles.hero}`)?.parentElement;
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    expect(board.querySelector(`.${styles.hero}`)?.parentElement).not.toBe(before);
    const left = screen.getByRole('button', { name: '向左移动' });
    left.focus(); fireEvent.click(left); expect(board).toHaveFocus();
    const slot = screen.getByRole('button', { name: '空塔位 1' });
    slot.focus(); fireEvent.click(slot); expect(board).toHaveFocus();
    const pause = screen.getByRole('button', { name: '暂停战斗' });
    pause.focus(); fireEvent.click(pause); expect(board).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'p' });
    expect(screen.queryByText('工位塔防已暂停')).not.toBeInTheDocument();
  });

  it('pauses and resumes with P and freezes income and all management while paused', () => {
    renderPage(); fireEvent.click(screen.getByRole('button', { name: '购买办公桌绿植' }));
    fireEvent.click(screen.getByRole('button', { name: '开始工位塔防' }));
    fireEvent.keyDown(window, { key: 'p' });
    const before = coins(); expect(screen.getByText('工位塔防已暂停')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /刷新零件商店/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: '升级办公桌绿植' })).toBeDisabled();
    act(() => vi.advanceTimersByTime(60_000)); expect(coins()).toBe(before);
    fireEvent.keyDown(window, { key: 'p' });
    expect(screen.queryByText('工位塔防已暂停')).not.toBeInTheDocument();
  });

  it('ignores typing shortcuts and auto-pauses on blur or hidden document', () => {
    const clearInterval = vi.spyOn(window, 'clearInterval'); renderPage();
    fireEvent.click(screen.getByRole('button', { name: '开始工位塔防' }));
    const input = document.createElement('textarea'); document.body.append(input);
    const heroCell = document.querySelector(`.${styles.hero}`)?.parentElement;
    fireEvent.keyDown(input, { key: 'ArrowRight' });
    expect(document.querySelector(`.${styles.hero}`)?.parentElement).toBe(heroCell);
    fireEvent(window, new Event('blur'));
    expect(screen.getByText('已为你自动暂停')).toBeInTheDocument(); expect(clearInterval).toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'p' });
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    fireEvent(document, new Event('visibilitychange'));
    expect(screen.getByText('已为你自动暂停')).toBeInTheDocument(); input.remove();
  });

  it('keeps the old high score separate and tolerates a corrupt new record', () => {
    window.localStorage.setItem(OLD_SETTINGS_KEY, JSON.stringify({ bestScore: 999999 }));
    window.localStorage.setItem(SETTINGS_KEY, '{broken');
    renderPage();
    expect(screen.getByText('合成版 · 本机最高分').nextElementSibling).toHaveTextContent('0');
    expect(window.localStorage.getItem(OLD_SETTINGS_KEY)).toBe(JSON.stringify({ bestScore: 999999 }));
    expect(screen.getByRole('button', { name: '开始工位塔防' })).toBeEnabled();
  });

  it('saves a finished merging run only to the new local record key', () => {
    window.localStorage.setItem(OLD_SETTINGS_KEY, JSON.stringify({ bestScore: 999999 }));
    useInitialState({ status: 'won', score: 1234 }); renderPage();
    expect(window.localStorage.getItem(SETTINGS_KEY)).toBe(JSON.stringify({ bestScore: 1234 }));
    expect(window.localStorage.getItem(OLD_SETTINGS_KEY)).toBe(JSON.stringify({ bestScore: 999999 }));
    expect(screen.getByText('守住工位，准点下班！')).toBeInTheDocument();
  });

  it('renders attack effects and keeps a single hero while releasing a pulse', () => {
    const base = engine.createTowerDefenseState();
    useInitialState({
      status: 'running', spawnQueue: [],
      enemies: [{ id: 'nearby', name: '待办', pathIndex: 10, hp: 100, maxHp: 100, speedTicks: 100, slowTicks: 0, shredTicks: 0, shredStacks: 0, reward: 1, score: 1, coreDamage: 1, boss: false }],
      hero: { ...base.hero, x: 7, y: 6 },
    });
    renderPage(); fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    expect(screen.getByRole('status')).toHaveTextContent('专注脉冲');
    expect(screen.getByRole('button', { name: '释放专注脉冲' })).toBeDisabled();
    expect(document.querySelector(`.${styles.battleEffects} [data-source="pulse"]`)).not.toBeNull();
    expect(document.querySelectorAll(`.${styles.hero}`)).toHaveLength(1);
  });

  it('cleans up the battle interval on unmount and resets the whole run explicitly', () => {
    const clearInterval = vi.spyOn(window, 'clearInterval'); const { unmount } = renderPage();
    fireEvent.click(screen.getByRole('button', { name: '购买办公桌绿植' }));
    fireEvent.click(screen.getByRole('button', { name: '开始工位塔防' }));
    fireEvent.click(screen.getByRole('button', { name: '重新开局' }));
    expect(screen.getByRole('button', { name: '购买办公桌绿植' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '开始工位塔防' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: '开始工位塔防' }));
    unmount(); expect(clearInterval).toHaveBeenCalled();
  });
});
