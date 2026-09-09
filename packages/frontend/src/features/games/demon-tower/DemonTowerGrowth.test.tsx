import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DemonTowerGrowthView } from '@stealth-reader/shared';
import { DemonTowerGrowth, DemonTowerLootGuide } from './DemonTowerGrowth';
import { DemonTowerInventory } from './DemonTowerInventory';
import { towerCatalog, towerProfile } from './test-fixtures';

const growth: DemonTowerGrowthView = { rulesVersion: 2, pendingLegacyBattle: false, chosenAttribute: null, innates: [], unlockedCount: 1,
  nextInnateLevel: 16, misses: { ling: 0, xian: 0 }, eligible: { ling: false, xian: false } };
const profile = () => towerProfile({ growth: structuredClone(growth), availableActions: [...towerProfile().availableActions, 'choose_innate'] });

describe('Demon tower free innate UI', () => {
  it('requires an explicit choice plus irreversible confirmation and sends no forged rewards', async () => {
    const onAction = vi.fn().mockResolvedValue(true); render(<DemonTowerGrowth profile={profile()} disabled={false} onAction={onAction} />);
    expect(screen.getByRole('button', { name: '确认我的心性' })).toBeDisabled();
    expect(screen.getAllByRole('radio').every(input => !(input as HTMLInputElement).checked)).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: '稳住阵脚 · 防御' }));
    fireEvent.click(screen.getByRole('button', { name: '确认我的心性' }));
    expect(onAction).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', { name: '确定永久心性' });
    expect(within(dialog).getByText(/此选择永久保留/)).toBeVisible();
    fireEvent.click(within(dialog).getByRole('button', { name: '免费觉醒钢筋铁骨' }));
    expect(onAction).toHaveBeenCalledExactlyOnceWith({ kind: 'choose_innate', payload: { attribute: 'DEF' } });
  });
  it('never enables changes while an old battle or server automation prevents actions', () => {
    const old = profile(); old.growth!.pendingLegacyBattle = true; old.availableActions = ['attack', 'skill', 'flee'];
    render(<DemonTowerGrowth profile={old} disabled={false} onAction={vi.fn()} />);
    expect(screen.getByText(/更新前开始的战斗/)).toBeVisible();
    for (const input of screen.getAllByRole('radio')) expect(input).toBeDisabled();
  });
  it('shows persisted unlocked traits and does not offer another choice', () => {
    const chosen = profile(); chosen.growth = { ...growth, chosenAttribute: 'STR', innates: ['strength'] };
    render(<DemonTowerGrowth profile={chosen} disabled={false} onAction={vi.fn()} />);
    expect(screen.queryByRole('radio')).toBeNull(); expect(screen.getByText(/下一命格在 Lv16/)).toBeVisible();
    expect(screen.getByText('1 / 8 已觉醒')).toBeVisible();
  });
  it('does not imply unqualified low-level players already build rarity guarantee counters', () => {
    render(<DemonTowerLootGuide profile={profile()} />);
    expect(screen.getByText('Lv16开启')).toBeVisible(); expect(screen.getByText('Lv31开启')).toBeVisible();
    expect(screen.getByText(/150次普攻/)).toBeVisible();
  });
  it('distinguishes gifted equipment from new locked drops, displays stars separately from +N and never hides the inventory', () => {
    const current = profile(); current.level = 16;
    current.weapons = [{ id: 'w1', quality: 3, spareCopies: 2, star: 2, favor: 12, levelExempt: true }, { id: 'w17', quality: 1, spareCopies: 0, star: 1, favor: 0, levelExempt: true }, { id: 'w2', quality: 0, spareCopies: 0, star: 1, favor: 0 }];
    render(<DemonTowerInventory profile={current} catalog={towerCatalog()} disabled={false} onAction={vi.fn()} />);
    const hammer = screen.getByRole('heading', { name: '玄铁锤 +0' }).closest('article')!;
    expect(within(hammer).getByText(/获取 Lv16 \/ 装备 Lv31/)).toBeVisible();
    expect(within(hammer).getByRole('button', { name: '需要 Lv31' })).toBeDisabled();
    expect(screen.getByText('2 / 5 星 · 品质 +3 独立保留')).toBeVisible();
    expect(screen.getByRole('progressbar', { name: '斩马刀升星熟练度' })).toHaveAttribute('value', '12');
    expect(screen.getAllByText(/训练赠送可用/)).toHaveLength(2);
  });
});
