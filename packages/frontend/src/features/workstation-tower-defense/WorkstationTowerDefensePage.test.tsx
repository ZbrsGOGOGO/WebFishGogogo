import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TOWER_TAUNTS, WorkstationTowerDefensePage, type WorkstationTowerDefenseCharacter } from './WorkstationTowerDefensePage';
import * as engine from './tower-defense-logic';
import styles from './WorkstationTowerDefensePage.module.css';

const OLD_SETTINGS_KEY = 'momo.workstation-tower-defense.settings.v1';
const MERGE_SETTINGS_KEY = 'momo.workstation-tower-defense.settings.v2';
const ROUND_SETTINGS_KEY = 'momo.workstation-tower-defense.settings.v3';
const SETTINGS_KEY = 'momo.workstation-tower-defense.settings.v4';

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
  const initial = engine.createTowerDefenseState(1972);
  vi.spyOn(engine, 'createTowerDefenseState').mockReturnValue({ ...initial, ...overrides });
}

describe('WorkstationTowerDefensePage two-round merging edition', () => {
  // Seed 1972 chooses single in the real opening lottery. Other types are
  // exercised separately; deterministic UI fixtures keep their exact prices.
  beforeEach(() => { vi.useFakeTimers(); vi.spyOn(Math, 'random').mockReturnValue(1972 / 0x1_0000_0000); window.localStorage.clear(); });
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
    expect(screen.getByLabelText('当前回合')).toHaveTextContent('1 / 2');
    expect(screen.getByLabelText('两回合进度').querySelector('[aria-current="step"]')).toHaveTextContent('经营回合');
    expect(screen.getByText('2 回合短局 · 纯本地')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('shows the injected identity, including a complete emoji mark', () => {
    renderPage({ displayName: '小张', avatarKey: 'green', avatarMark: '🌱' });
    expect(screen.getByText('小张 · 工位守卫')).toBeInTheDocument();
    expect(document.querySelector('[data-avatar="green"]')).not.toBeNull();
    expect(document.querySelector(`.${styles.hero} text`)?.textContent).toBe('🌱');
  });

  it('shows a genuinely different random starting kit and deploys it with the unchanged initial budget',()=>{
    vi.mocked(Math.random).mockReturnValue(0);renderPage();
    fireEvent.click(screen.getByRole('button',{name:'购买办公桌绿植'}));
    for(const slot of [1,2,3]) fireEvent.click(screen.getByRole('button',{name:new RegExp(`购买第 ${slot} 格咖啡机零件`)}));
    fireEvent.click(screen.getByRole('button',{name:'选择部署咖啡机 2 阶'}));fireEvent.click(screen.getByRole('button',{name:'空塔位 5'}));
    expect(screen.getByRole('button',{name:'塔位 5，咖啡机 2 阶'})).toBeInTheDocument();expect(coins()).toBe(20);
  });

  it('moves a local tower without sale or extra cost and lets the user cancel first',()=>{
    useInitialState({towers:[{id:'same-owned-tower',type:'single',level:3,slotIndex:4,cooldown:7,invested:177}]});renderPage();const before=coins();
    fireEvent.click(screen.getByRole('button',{name:'塔位 5，订书机 3 阶'}));fireEvent.click(screen.getByRole('button',{name:'移动防御塔'}));
    expect(screen.getByRole('button',{name:'卖出防御塔'})).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'取消移动'}));
    expect(screen.getByRole('button',{name:'塔位 5，订书机 3 阶'})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'移动防御塔'}));fireEvent.click(screen.getByRole('button',{name:'空塔位 2'}));
    expect(screen.getByRole('button',{name:'塔位 2，订书机 3 阶'})).toBeInTheDocument();expect(screen.getByRole('button',{name:'空塔位 5'})).toBeInTheDocument();expect(coins()).toBe(before);
    expect(screen.getByRole('status')).toHaveTextContent('冷却保持不变');
  });

  it('labels all locked official slots and sends a specific tower move without optimistic relocation',()=>{
    const base=engine.createWorkstationCampaign(1972,{job:'specialist',mode:'story',chapter:1,promotionTier:0,talents:{output:0,control:0,economy:0},weekday:2});
    const state={...base,towers:[{id:'old-owned-tower',type:'single' as const,level:2 as const,slotIndex:4,cooldown:17,invested:54}]},onCommand=vi.fn();
    const view=render(<WorkstationTowerDefensePage session={{state,pending:false,onCommand,onRestart:vi.fn()}}/>);
    expect(screen.getByRole('button',{name:/未解锁塔位 7，.*360/})).toBeDisabled();expect(screen.getByRole('button',{name:/未解锁塔位 8，.*1600/})).toBeDisabled();expect(screen.getByRole('button',{name:/未解锁塔位 9，.*5400/})).toBeDisabled();
    expect(screen.getByLabelText('扩展工位解锁条件')).toHaveTextContent('本局开放 6/9');
    fireEvent.click(screen.getByRole('button',{name:'塔位 5，订书机 2 阶'}));fireEvent.click(screen.getByRole('button',{name:'移动防御塔'}));
    fireEvent.click(screen.getByRole('button',{name:/未解锁塔位 7/}));expect(onCommand).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'空塔位 2'}));expect(onCommand).toHaveBeenCalledWith({type:'move-tower',towerId:'old-owned-tower',fromSlotIndex:4,toSlotIndex:1});
    expect(screen.getByRole('button',{name:'塔位 5，订书机 2 阶'})).toBeInTheDocument();expect(screen.getByRole('button',{name:'空塔位 2'})).toBeInTheDocument();expect(coins()).toBe(110);
    const accepted=engine.moveDeployedTower(state,4,1,'old-owned-tower').state;
    view.rerender(<WorkstationTowerDefensePage session={{state:accepted,pending:false,onCommand,onRestart:vi.fn()}}/>);
    expect(screen.getByRole('button',{name:'塔位 2，订书机 2 阶'})).toBeInTheDocument();expect(coins()).toBe(110);
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

  it('offers free selection of a clearly priced targeted part without rerolling the random slots', () => {
    renderPage(); const before = coins();
    const shop = screen.getByLabelText('五格零件商店');
    const originalRandomSlots = within(shop).getAllByRole('button').slice(0, 4);
    fireEvent.change(screen.getByRole('combobox', { name: '定向订货塔型' }), { target: { value: 'splash' } });
    expect(coins()).toBe(before);
    expect(originalRandomSlots.every((offer) => offer.isConnected)).toBe(true);
    const expectedCost = engine.focusedTowerPartCost('splash');
    const focusedOffer = screen.getByRole('button', { name: `购买第 5 格打印机零件，${expectedCost} 金币，定向订货` });
    expect(focusedOffer).toHaveAttribute('data-focused', 'true');
    fireEvent.click(focusedOffer);
    expect(coins()).toBe(before - expectedCost);
    expect(screen.getByRole('button', { name: '待合成打印机 1 阶' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: '定向订货塔型' })).toHaveValue('splash');
    expect(within(shop).getAllByRole('button')).toHaveLength(5);
  });

  it('buys a real offer into the same sold-out slot, rejects another click, and requires paid refresh', () => {
    renderPage(); const before = coins();
    const shop = screen.getByLabelText('五格零件商店');
    const buttons = within(shop).getAllByRole('button');
    fireEvent.click(buttons[0]);
    const soldOut = screen.getByRole('button', { name: '第 1 格已售罄，刷新后补货' });
    expect(soldOut).toBe(buttons[0]);
    expect(within(shop).getAllByRole('button')).toEqual(buttons);
    expect(soldOut).toBeDisabled();
    fireEvent.click(soldOut); expect(coins()).toBe(before - engine.TOWER_DEFINITIONS.single.partCost);
    expect(soldOut).toHaveTextContent('待刷新');
    fireEvent.click(screen.getByRole('button', { name: /刷新零件商店/ }));
    expect(coins()).toBe(before - engine.TOWER_DEFINITIONS.single.partCost - engine.TOWER_SHOP_REFRESH_COST);
    expect(within(shop).getAllByRole('button')).toHaveLength(5);
    expect(shop.querySelector('[data-sold-out="true"]')).toBeNull();
  });

  it('cannot refill a sold-out focused slot by freely changing the order type', () => {
    renderPage();
    const selector = screen.getByRole('combobox', { name: '定向订货塔型' });
    fireEvent.click(screen.getByRole('button', { name: /购买第 5 格订书机零件/ }));
    const receipt = screen.getByRole('button', { name: '第 5 格已售罄，刷新后补货' });
    const paid = coins();
    fireEvent.change(selector, { target: { value: 'splash' } });
    expect(coins()).toBe(paid);
    expect(receipt).toBeDisabled();
    expect(receipt).toHaveAttribute('data-type', 'single');
    expect(selector).toHaveValue('splash');
    expect(screen.getByRole('status')).toHaveTextContent('预约打印机');
    expect(screen.queryByRole('button', { name: /购买第 5 格/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /刷新零件商店/ }));
    expect(screen.getByRole('button', { name: /购买第 5 格打印机/ })).toBeEnabled();
    expect(coins()).toBe(paid - engine.TOWER_SHOP_REFRESH_COST);
  });

  it('keeps native order-selection arrow keys from moving the hero', () => {
    renderPage();
    const heroCell = document.querySelector(`.${styles.hero}`)?.parentElement;
    const selector = screen.getByRole('combobox', { name: '定向订货塔型' });
    selector.focus(); fireEvent.keyDown(selector, { key: 'ArrowDown' });
    expect(document.querySelector(`.${styles.hero}`)?.parentElement).toBe(heroCell);
    expect(selector).toHaveFocus();
  });

  it('explains printer armor piercing using the live engine definition', () => {
    renderPage();
    const summary = screen.getByText(/五条防线 · 玩法说明/);
    fireEvent.click(summary);
    expect(engine.TOWER_DEFINITIONS.splash.description).toContain(`穿透 ${engine.TOWER_PRINTER_ARMOR_PIERCE} 点护甲`);
    expect(screen.getByText(engine.TOWER_DEFINITIONS.splash.description)).toBeVisible();
  });

  it.each(['single', 'slow', 'splash', 'push', 'shred'] as const)('shows both actual %s evolution descriptions and distinct tier sprites', (type) => {
    useInitialState({ towers: [{ id: `evolved-${type}`, type, level: 3, slotIndex: 0, cooldown: 0, invested: 162 }] });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: `塔位 1，${engine.TOWER_DEFINITIONS[type].name} 3 阶` }));
    const detail = screen.getByLabelText('当前塔进阶技能');
    expect(detail).toHaveTextContent(engine.TOWER_EVOLUTIONS[type][3].name);
    expect(detail).toHaveTextContent(engine.TOWER_EVOLUTIONS[type][3].description);
    const catalog = screen.getByLabelText(`${engine.TOWER_DEFINITIONS[type].name}进阶图鉴`);
    expect(catalog).toHaveTextContent(engine.TOWER_EVOLUTIONS[type][2].description);
    expect(catalog).toHaveTextContent(engine.TOWER_EVOLUTIONS[type][3].description);
    expect(catalog.querySelector(`[data-evolution="${type}-2"]`)).not.toBeNull();
    expect(catalog.querySelector(`[data-evolution="${type}-3"]`)).not.toBeNull();
  });

  it('renders real armor-break technique feedback after the engine fires', () => {
    const initial = engine.createTowerDefenseState();
    useInitialState({ status: 'running', nextSpawnAt: 999,
      hero: { ...initial.hero, autoCooldown: 999 },
      towers: [{ id: 'stapler', type: 'single', level: 2, slotIndex: 4, cooldown: 0, invested: 54 }],
      enemies: [{ id: 'armored', name: '护甲测试', pathIndex: 9, hp: 100, maxHp: 100, armor: 3, archetype: 'elite',
        speedTicks: 99, slowTicks: 0, shredTicks: 0, shredStacks: 0, singleTargetDamageCap: null,
        reward: 8, score: 100, coreDamage: 1, boss: false }],
    });
    renderPage(); act(() => vi.advanceTimersByTime(engine.TOWER_DEFENSE_TICK_MS));
    const effect = document.querySelector('[data-source="single"][data-technique="pierce"]');
    expect(effect?.textContent).toBe('破甲');
    expect(document.querySelector('[data-armor-broken="true"]')).not.toBeNull();
    expect(screen.getByTitle(/护甲测试.*破甲 1/)).toBeInTheDocument();
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
    expect(screen.getByRole('combobox', { name: '定向订货塔型' })).toBeDisabled();
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
    window.localStorage.setItem(MERGE_SETTINGS_KEY, JSON.stringify({ bestScore: 888888 }));
    window.localStorage.setItem(ROUND_SETTINGS_KEY, JSON.stringify({ bestScore: 777777 }));
    window.localStorage.setItem(SETTINGS_KEY, '{broken');
    renderPage();
    expect(screen.getByText('售罄挑战版 · 本机最高分').nextElementSibling).toHaveTextContent('0');
    expect(window.localStorage.getItem(OLD_SETTINGS_KEY)).toBe(JSON.stringify({ bestScore: 999999 }));
    expect(window.localStorage.getItem(MERGE_SETTINGS_KEY)).toBe(JSON.stringify({ bestScore: 888888 }));
    expect(window.localStorage.getItem(ROUND_SETTINGS_KEY)).toBe(JSON.stringify({ bestScore: 777777 }));
    expect(screen.getByRole('button', { name: '开始工位塔防' })).toBeEnabled();
  });

  it('saves a finished merging run only to the new local record key', () => {
    window.localStorage.setItem(OLD_SETTINGS_KEY, JSON.stringify({ bestScore: 999999 }));
    window.localStorage.setItem(MERGE_SETTINGS_KEY, JSON.stringify({ bestScore: 888888 }));
    window.localStorage.setItem(ROUND_SETTINGS_KEY, JSON.stringify({ bestScore: 777777 }));
    useInitialState({ status: 'won', score: 1234 }); renderPage();
    expect(window.localStorage.getItem(SETTINGS_KEY)).toBe(JSON.stringify({ bestScore: 1234 }));
    expect(window.localStorage.getItem(OLD_SETTINGS_KEY)).toBe(JSON.stringify({ bestScore: 999999 }));
    expect(window.localStorage.getItem(MERGE_SETTINGS_KEY)).toBe(JSON.stringify({ bestScore: 888888 }));
    expect(window.localStorage.getItem(ROUND_SETTINGS_KEY)).toBe(JSON.stringify({ bestScore: 777777 }));
    expect(screen.getByText('守住工位，准点下班！')).toBeInTheDocument();
  });

  it('renders attack effects and keeps a single hero while releasing a pulse', () => {
    const base = engine.createTowerDefenseState();
    useInitialState({
      status: 'running', spawnQueue: [],
      enemies: [{ id: 'nearby', name: '待办', archetype: 'basic', armor: 0, singleTargetDamageCap: null, pathIndex: 10, hp: 100, maxHp: 100, speedTicks: 100, slowTicks: 0, shredTicks: 0, shredStacks: 0, reward: 1, score: 1, coreDamage: 1, boss: false }],
      hero: { ...base.hero, x: 7, y: 6 },
    });
    renderPage(); fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    expect(screen.getByRole('status')).toHaveTextContent('专注脉冲');
    expect(screen.getByRole('button', { name: '释放专注脉冲' })).toBeDisabled();
    expect(document.querySelector(`.${styles.battleEffects} [data-source="pulse"]`)).not.toBeNull();
    expect(document.querySelectorAll(`.${styles.hero}`)).toHaveLength(1);
  });

  it('warns before the high-pressure round and only starts it after an explicit click', () => {
    useInitialState({ status: 'intermission', wave: 1, spawnQueue: [], enemies: [], plantLevel: 1 });
    renderPage(); const before = coins();
    expect(screen.getByRole('heading', { name: '第二回合突袭预警' })).toBeInTheDocument();
    expect(screen.getByLabelText('两回合进度').querySelector('[aria-current="step"]')).toHaveTextContent('突袭回合');
    expect(screen.getByText('快速催办')).toBeInTheDocument();
    expect(screen.getByText('密集群怪')).toBeInTheDocument();
    expect(screen.getByText('护甲精英')).toBeInTheDocument();
    expect(screen.getByText('小 Boss')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '第二回合突袭预警' })).toHaveTextContent(`经营回合奖励 ${engine.TOWER_INTERMISSION_CREDIT_BONUS} 金币已到账`);
    expect(screen.getByRole('region', { name: '第二回合突袭预警' })).toHaveTextContent('间歇不持续产币');
    expect(screen.getByText(`成团：单体每次最多 ${engine.TOWER_SWARM_SINGLE_TARGET_DAMAGE_CAP} 伤害，范围处理有效`)).toBeVisible();
    act(() => vi.advanceTimersByTime(60_000));
    expect(coins()).toBe(before);
    expect(screen.getByLabelText('当前回合')).toHaveTextContent('1 / 2');
    fireEvent.click(screen.getByRole('button', { name: /迎战第二回合/ }));
    expect(screen.queryByRole('heading', { name: '第二回合突袭预警' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('当前回合')).toHaveTextContent('2 / 2');
    expect(screen.getByRole('status')).toHaveTextContent('第二回合突袭');
    expect(screen.getByRole('group', { name: /工位塔防地图/ })).toHaveFocus();
    expect(screen.queryByRole('button', { name: /第三回合|第 3 波/ })).not.toBeInTheDocument();
  });

  it('shows the live armored midboss health and distinguishes enemy archetypes visually', () => {
    useInitialState({ status: 'running', wave: 2, spawnQueue: [], enemies: [
      { id: 'midboss', name: '临时加班通知', archetype: 'midboss', armor: 5, singleTargetDamageCap: null, pathIndex: 3, hp: 135, maxHp: 270, speedTicks: 100, slowTicks: 0, shredTicks: 0, shredStacks: 0, reward: 1, score: 1, coreDamage: 3, boss: true },
      { id: 'fast', name: '催办', archetype: 'fast', armor: 0, singleTargetDamageCap: null, pathIndex: 1, hp: 20, maxHp: 20, speedTicks: 2, slowTicks: 0, shredTicks: 0, shredStacks: 0, reward: 1, score: 1, coreDamage: 1, boss: false },
    ] });
    renderPage();
    expect(screen.getByLabelText('小 Boss 战况')).toHaveTextContent('临时加班通知');
    expect(screen.getByLabelText('小 Boss 战况')).toHaveTextContent('护甲 5');
    expect(screen.getByRole('progressbar', { name: '小 Boss 生命值' })).toHaveAttribute('value', '135');
    expect(screen.getByRole('progressbar', { name: '小 Boss 生命值' })).toHaveAttribute('max', '270');
    expect(document.querySelector(`.${styles.enemy}[data-archetype="fast"]`)).toHaveTextContent('快');
  });

  it('gives actionable loss advice based on missing economy or defenses', () => {
    useInitialState({ status: 'lost', wave: 2, plantLevel: 1, coreHp: 0 }); renderPage();
    expect(screen.getByRole('heading', { name: '下一局，试试这样调整' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '下一局，试试这样调整' })).toHaveTextContent('定向订货可凑齐三件');
    expect(screen.getByRole('region', { name: '下一局，试试这样调整' })).toHaveTextContent('打印机清群怪');
    expect(screen.getByRole('button', { name: '再来一局' })).toBeEnabled();
    expect(window.localStorage.getItem(MERGE_SETTINGS_KEY)).toBeNull();
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
