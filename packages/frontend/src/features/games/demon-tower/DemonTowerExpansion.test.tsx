import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DemonTowerExpansionView, DemonTowerBattleReport } from '@stealth-reader/shared';
import { DemonTowerExpansion } from './DemonTowerExpansion';
import { DemonTowerLegacyMarket } from './DemonTowerLegacyMarket';
import { DemonTowerFirstClear, DemonTowerSkinPicker } from './DemonTowerRecognition';
import { DemonTowerReport } from './DemonTowerBattle';
import { towerProfile, towerWorld, towerBattle, towerCatalog } from './test-fixtures';

const expansion = (): DemonTowerExpansionView => ({ version: 1, skillPages: 30, essences: 10, weaponBoxes: 9, weaponBoxPity: 9,
  riftsToday: 0, meditationsToday: 0, weeklyBossAttempts: 0, week: '2026-09-07', claimedBossFloors: [], passageTokens: 0, titles: [], skin: 'field', unlockedSkins: ['field', 'ledger', 'memo'] });
const profile = () => towerProfile({ expansion: expansion(), level: 61, stamina: 20, hp: 100,
  materials: { ore: 100, herb: 100, soul: 100, clue: 0 }, availableActions: ['expedition', 'market', 'star_up', 'breakthrough', 'select_skin', 'claim_boss_loot'] });

describe('Demon tower expansion workbench', () => {
  it('exposes independent expedition actions and sends only the selected mode, without client scores/rewards', () => {
    const onAction = vi.fn().mockResolvedValue(true); render(<DemonTowerExpansion profile={profile()} world={towerWorld()} disabled={false} onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: '进入小秘境' }));
    expect(onAction).toHaveBeenCalledExactlyOnceWith({ kind: 'expedition', payload: { mode: 'rift' } });
    expect(screen.queryByText(/武器箱累计/)).toBeNull(); expect(screen.queryByRole('button', { name: /武器箱 ·/ })).toBeNull();
  });
  it('opens the saved combat workspace only after a confirmed expedition and offers an explicit return', async () => {
    const onAction = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true), onContinueBattle = vi.fn();
    const props = { profile: profile(), world: towerWorld(), disabled: false, onAction, onContinueBattle };
    const { rerender } = render(<DemonTowerExpansion {...props} />);
    fireEvent.click(screen.getByRole('button', { name: '进入小秘境' }));
    await Promise.resolve(); expect(onContinueBattle).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '挑战周常守关者' }));
    await waitFor(() => expect(onContinueBattle).toHaveBeenCalledTimes(1));
    rerender(<DemonTowerExpansion {...props} profile={{ ...props.profile, battle: towerBattle() }} />);
    fireEvent.click(screen.getByRole('button', { name: '返回战斗现场' }));
    expect(onContinueBattle).toHaveBeenCalledTimes(2); expect(onAction).toHaveBeenCalledTimes(2);
  });
  it.each([['rift', '小秘境探索'], ['weekly_boss', '周常独立守关']] as const)('labels %s reports with their independent source', (source, label) => {
    const report: DemonTowerBattleReport = { id: 'report', kind: 'explore', source, floor: 1, outcome: 'victory', turns: 2, damage: 10, experience: 5, materials: { ore: 0, herb: 0, soul: 0, clue: 0 }, log: [], completedAt: Date.now() };
    render(<DemonTowerReport report={report} catalog={towerCatalog()} />);
    expect(screen.getByText(new RegExp(`${label} · 第 1 层`))).toBeVisible();
    expect(screen.queryByText(/普通探索/)).toBeNull();
  });
  it('requires an explicit second confirmation before spending souls and explains exact ten-box pity', () => {
    const onAction = vi.fn().mockResolvedValue(true); render(<DemonTowerLegacyMarket profile={profile()} disabled={false} onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: '武器箱 · 12残魂' }));
    expect(onAction).not.toHaveBeenCalled(); const modal = screen.getByRole('dialog', { name: '兑换武器箱' });
    expect(within(modal).getByText(/第10箱至少灵/)).toBeVisible();
    fireEvent.click(within(modal).getByRole('button', { name: '确认兑换' }));
    expect(onAction).toHaveBeenCalledExactlyOnceWith({ kind: 'market', payload: { offer: 'weapon_box' } });
  });
  it('does not charge on cancellation and disables level/material/in-flight invalid actions', () => {
    const onAction = vi.fn(); const current = profile(); current.level = 1; current.materials.soul = 0;
    const { rerender } = render(<DemonTowerLegacyMarket profile={current} disabled={false} onAction={onAction} />);
    expect(screen.getByRole('button', { name: '武器箱 · 12残魂' })).toBeDisabled();
    rerender(<DemonTowerLegacyMarket profile={profile()} disabled={false} onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: '技能箱 · 10残魂' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '取消' })); expect(onAction).not.toHaveBeenCalled();
    rerender(<DemonTowerLegacyMarket profile={profile()} disabled onAction={onAction} />);
    expect(screen.getByRole('button', { name: '技能箱 · 10残魂' })).toBeDisabled();
  });
  it('selects a named celestial skill with exactly 30 pages, instead of a random or hidden purchase', () => {
    const onAction = vi.fn().mockResolvedValue(true); render(<DemonTowerLegacyMarket profile={profile()} disabled={false} onAction={onAction} />);
    fireEvent.click(screen.getByText('30残页自选仙级技能 · Lv46'));
    fireEvent.click(screen.getByRole('button', { name: '续命丹心' }));
    const dialog = screen.getByRole('dialog', { name: '自选续命丹心' }); expect(within(dialog).getByText(/已有同名时转为品质经验/)).toBeVisible();
    fireEvent.click(within(dialog).getByRole('button', { name: '确认兑换' }));
    expect(onAction).toHaveBeenCalledExactlyOnceWith({ kind: 'market', payload: { offer: 'skill_selection', itemId: 's13' } });
  });
  it('presents weapon and skill star progress independently and publishes no downgrade risk', () => {
    const current = profile(); current.skills = [{ id: 's1', quality: 2, spareCopies: 0, star: 3, favor: 20, qualityExperience: 2 }];
    render(<DemonTowerExpansion profile={current} world={towerWorld()} disabled={false} onAction={vi.fn()} />);
    fireEvent.change(screen.getByRole('combobox', { name: '成长工坊物品' }), { target: { value: 's1' } });
    expect(screen.getByText(/回春术 \+2 · 3\/5星 · 熟练度 20\/45/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '升星符 · 40残魂' }));
    expect(within(screen.getByRole('dialog')).getByText(/本次成功率30%.*不降星/)).toBeVisible();
  });
  it('shows equipped divine ultimate and persists an explicit low-profile skin selection', () => {
    const current = profile(); current.weapons.push({ id: 'w20', quality: 9, spareCopies: 0, star: 5, favor: 0 }); const onAction = vi.fn().mockResolvedValue(true);
    render(<><DemonTowerExpansion profile={current} world={towerWorld()} disabled={false} onAction={onAction} /><DemonTowerSkinPicker profile={current} disabled={false} onAction={onAction} /></>);
    fireEvent.change(screen.getByRole('combobox', { name: '成长工坊物品' }), { target: { value: 'w20' } });
    expect(screen.getByText(/真·混元改命.*当前已激活/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '数据台账' })); expect(onAction).toHaveBeenCalledExactlyOnceWith({ kind: 'select_skin', payload: { skin: 'ledger' } });
  });
  it('keeps a failed/uncertain exchange confirmation and never automatically repeats it', async () => {
    const onAction = vi.fn().mockResolvedValue(false); render(<DemonTowerLegacyMarket profile={profile()} disabled={false} onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: '武器箱 · 12残魂' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '确认兑换' }));
    await Promise.resolve(); expect(screen.getByRole('dialog')).toBeVisible(); expect(onAction).toHaveBeenCalledTimes(1);
  });
  it('keeps first-clear contribution rewards beside the shared world and disables previously claimed floors', () => {
    const current = profile(); current.expansion!.claimedBossFloors = [1]; const onAction = vi.fn().mockResolvedValue(true);
    render(<DemonTowerFirstClear profile={current} world={towerWorld({ currentFloor: 3 })} disabled={false} onAction={onAction} />);
    expect(screen.getByRole('button', { name: '第1层已领取' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '第2层核验首杀贡献' }));
    expect(onAction).toHaveBeenCalledExactlyOnceWith({ kind: 'claim_boss_loot', payload: { floor: 2 } });
  });
});
