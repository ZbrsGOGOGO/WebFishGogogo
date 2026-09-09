import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOWER_TAUNTS, WorkstationTowerDefensePage } from './WorkstationTowerDefensePage';
import * as e from './tower-defense-logic';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const cssText = readFileSync(resolve(process.cwd(), 'src/features/workstation-tower-defense/WorkstationTowerDefensePage.module.css'), 'utf8');

function step(count = 1): void {
  for (let tick = 0; tick < count; tick++) act(() => vi.advanceTimersByTime(e.TOWER_DEFENSE_TICK_MS));
}
function beginUndefendedRun(): void {
  render(<WorkstationTowerDefensePage />);
  // Actual opening: move the guard out of range; no artificial money/HP/attacks.
  for (let move = 0; move < 7; move++) fireEvent.click(screen.getByRole('button', { name: '向左移动' }));
  fireEvent.click(screen.getByRole('button', { name: '开始工位塔防' }));
}
function untilBreach(): void {
  for (let tick = 0; tick < 100 && !screen.queryByRole('alert', { name: '突破提醒' }); tick++) step();
  expect(screen.getByRole('alert', { name: '突破提醒' })).toHaveTextContent(TOWER_TAUNTS.breach);
}
function nearExit(id: string): e.TowerDefenseEnemy {
  return { id, name: '边界测试待办', pathIndex: e.TOWER_DEFENSE_PATH.length - 1, hp: 100, maxHp: 100,
    speedTicks: 1, slowTicks: 0, shredTicks: 0, shredStacks: 0, archetype: 'basic', armor: 0,
    singleTargetDamageCap: null, reward: 8, score: 100, coreDamage: 1, boss: false };
}

describe('tower challenge taunts, actual triggers and discretion', () => {
  beforeEach(() => { vi.useFakeTimers(); window.localStorage.clear(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('shows the requested entrance challenge as a prominent heading, silent and without account traffic', () => {
    const fetch = vi.fn(); const audio = vi.fn();
    vi.stubGlobal('fetch', fetch); vi.stubGlobal('Audio', audio);
    render(<WorkstationTowerDefensePage />);
    expect(screen.getByRole('heading', { name: TOWER_TAUNTS.entrance })).toBeVisible();
    expect(screen.getByText('全程静音 · 仅局内金币')).toBeVisible();
    expect(fetch).not.toHaveBeenCalled(); expect(audio).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '开始工位塔防' }));
    expect(screen.queryByText(TOWER_TAUNTS.entrance)).toBeNull();
  });

  it('shows and automatically dismisses a real breach; another breach creates a fresh popup', () => {
    beginUndefendedRun(); untilBreach();
    const first = screen.getByRole('alert', { name: '突破提醒' });
    expect(first).toHaveTextContent('1 项突破');
    expect(first).toHaveTextContent('核心剩余 9 点');
    step(13); // 3.64s; next first-round arrival is 16 ticks later.
    expect(screen.queryByRole('alert', { name: '突破提醒' })).toBeNull();
    untilBreach();
    expect(screen.getByRole('alert', { name: '突破提醒' })).not.toBe(first);
    expect(screen.getByRole('alert', { name: '突破提醒' })).toHaveTextContent('核心剩余 8 点');
    fireEvent.click(screen.getByRole('button', { name: '收起突破提醒' }));
    expect(screen.queryByRole('alert', { name: '突破提醒' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '显示守卫射程' }));
    expect(screen.queryByRole('alert', { name: '突破提醒' })).toBeNull();
  });

  it('coalesces simultaneous individual breaches rather than losing their count or blocking the game', () => {
    const initial = e.createTowerDefenseState();
    vi.spyOn(e, 'createTowerDefenseState').mockReturnValue({ ...initial, status: 'running',
      nextSpawnAt: 999, enemies: [nearExit('one'), nearExit('two')] });
    render(<WorkstationTowerDefensePage />); step();
    expect(screen.getAllByRole('alert', { name: '突破提醒' })).toHaveLength(1);
    expect(screen.getByRole('alert', { name: '突破提醒' })).toHaveTextContent('2 项突破');
    expect(screen.getByRole('alert', { name: '突破提醒' })).toHaveTextContent('核心剩余 8 点');
    expect(screen.getByRole('button', { name: '向右移动' })).toBeEnabled();
    step();
    expect(screen.getByRole('alert', { name: '突破提醒' })).toHaveTextContent('2 项突破');
  });

  it('gives zero-HP final taunt priority over breach popups and never deducts account funds', () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const initial = e.createTowerDefenseState();
    vi.spyOn(e, 'createTowerDefenseState').mockReturnValue({ ...initial, status: 'running', coreHp: 1,
      nextSpawnAt: 999, enemies: [nearExit('one'), nearExit('two')] });
    render(<WorkstationTowerDefensePage />); step();
    expect(screen.queryByRole('alert', { name: '突破提醒' })).toBeNull();
    expect(screen.getByRole('alert', { name: '防线失守结算' })).toHaveTextContent(TOWER_TAUNTS.defeat);
    expect(screen.getByRole('heading', { name: TOWER_TAUNTS.defeat })).toBeVisible();
    expect(screen.getByText('仅游戏吐槽，不扣账号办公币')).toBeVisible();
    expect(screen.getByLabelText('局内金币')).toHaveTextContent('110');
    step(100); expect(screen.getByRole('heading', { name: TOWER_TAUNTS.defeat })).toBeVisible();
    expect(fetch).not.toHaveBeenCalled();
    vi.mocked(e.createTowerDefenseState).mockReturnValue(initial);
    fireEvent.click(screen.getByRole('button', { name: '再来一局' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('heading', { name: TOWER_TAUNTS.entrance })).toBeVisible();
  });

  it('covers every game/taunt element, freezes simulation, ignores keys and requires manual resume', () => {
    beginUndefendedRun(); untilBreach();
    const hp = screen.getByLabelText('核心耐久').textContent;
    const credits = screen.getByLabelText('局内金币').textContent;
    fireEvent.click(screen.getByRole('button', { name: '收起为工作备忘' }));
    expect(screen.getByRole('main', { name: '工作备忘' })).toBeVisible();
    expect(screen.queryByRole('group', { name: /工位塔防地图/ })).toBeNull();
    expect(screen.queryByText(TOWER_TAUNTS.breach)).toBeNull();
    expect(screen.queryByText(TOWER_TAUNTS.defeat)).toBeNull();
    for (const key of ['Escape', 'p', 'ArrowRight', ' ']) fireEvent.keyDown(window, { key, code: key === ' ' ? 'Space' : key });
    step(300);
    fireEvent.click(screen.getByRole('button', { name: '返回工作台' }));
    expect(screen.getByText('工位塔防已暂停')).toBeVisible();
    expect(screen.getByLabelText('核心耐久').textContent).toBe(hp);
    expect(screen.getByLabelText('局内金币').textContent).toBe(credits);
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: '继续防守' })[0]);
    expect(screen.queryByRole('alert')).toBeNull();
    untilBreach();
    expect(screen.getByRole('alert', { name: '突破提醒' })).toHaveTextContent('1 项突破');
  });

  it('cleans up popup timers when unmounted and includes narrow/reduced-motion safeguards', () => {
    beginUndefendedRun(); untilBreach();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    cleanup(); expect(vi.getTimerCount()).toBe(0);
    // CSS contract only; actual 390px layout still requires browser acceptance.
    expect(cssText).toContain('@media (max-width: 600px)');
    expect(cssText).toContain('@media (prefers-reduced-motion: reduce)');
    expect(cssText).toContain('animation: none !important');
    expect(cssText).toContain('overflow-wrap: anywhere');
    expect(cssText).toContain('pointer-events: none');
  });
});
