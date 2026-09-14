import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { DemonTowerBattleReport, DemonTowerCombatLog } from '@stealth-reader/shared';

import { DemonTowerDailyTasks, DemonTowerReport, TowerCombatLog } from './DemonTowerBattle';
import { towerCatalog } from './test-fixtures';

const log: DemonTowerCombatLog[] = [
  { turn: 1, actor: 'player', kind: 'damage', text: '岩甲守卫损失12生命。', amount: 12 },
  { turn: 1, actor: 'enemy', kind: 'damage', text: '寻道者损失4生命。', amount: 4 },
  { turn: 2, actor: 'player', kind: 'heal', text: '恢复6生命。', amount: 6 },
  { turn: 2, actor: 'enemy', kind: 'effect', text: '毒雾即将释放。' },
  { turn: 3, actor: 'player', kind: 'defeat', text: '岩甲守卫暂时退场。' },
  { turn: 3, actor: 'player', kind: 'reward', text: '剑术熟练度免费升星。' },
];

function report(overrides: Partial<DemonTowerBattleReport> = {}): DemonTowerBattleReport {
  return {
    id: 'saved-report', kind: 'explore', floor: 2, outcome: 'victory', turns: 3,
    damage: 42, experience: 18, materials: { ore: 2, herb: 0, soul: 1, clue: 0 },
    log, completedAt: Date.parse('2026-09-12T08:00:00Z'), ...overrides,
  };
}

afterEach(cleanup);

describe('saved demon-tower battle report', () => {
  it('separates actual settlement from highlighted retained events and labels both sides', () => {
    render(<DemonTowerReport report={report()} catalog={towerCatalog()} />);
    expect(screen.getByRole('heading', { name: '探索胜利' })).toBeVisible();
    expect(screen.getByText(/服务器判定胜利/)).toBeVisible();
    const stats = screen.getByText('造成伤害').closest('dl')!;
    expect(within(stats).getByText('42')).toBeVisible();
    expect(within(stats).getByText('+18')).toBeVisible();
    expect(screen.getByLabelText('本次材料入账').children).toHaveLength(2);
    const highlights = screen.getByRole('region', { name: '关键过程' });
    expect(within(highlights).getAllByRole('listitem')).toHaveLength(3);
    expect(within(highlights).getByText('毒雾即将释放。')).toBeVisible();
    expect(within(highlights).queryByText('恢复6生命。')).toBeNull();
    expect(screen.getByText('保留的战斗记录 · 6 条')).toBeVisible();
    const fullLog = screen.getAllByRole('list', { name: '战斗记录' })[1];
    expect(within(fullLog).getAllByRole('listitem')).toHaveLength(6);
    expect(within(fullLog).getByText('寻道者损失4生命。').closest('li')).toHaveTextContent('敌方');
    expect(within(fullLog).getByText('岩甲守卫损失12生命。').closest('li')).toHaveTextContent('我方');
    expect(screen.queryByText(/办公币到账 \+\d+/)).toBeNull();
  });

  it('uses credited damage wording only for shared-boss reports', () => {
    render(<DemonTowerReport report={report({ kind: 'boss', outcome: 'contributed', damage: 27, experience: 0, materials: { ore: 0, herb: 0, soul: 0, clue: 0 }, log: [] })} catalog={towerCatalog()} />);
    expect(screen.getByRole('heading', { name: '协作已记录' })).toBeVisible();
    expect(screen.getByText('有效首领伤害')).toBeVisible();
    expect(screen.getByText('27')).toBeVisible();
    expect(screen.getByText('0')).toBeVisible();
    expect(screen.getByText('本次无材料入账。')).toBeVisible();
    expect(screen.queryByRole('region', { name: '关键过程' })).toBeNull();
    expect(screen.getByText('这场战斗没有可展示的过程记录。')).toBeVisible();
  });

  it.each([
    ['instant', '秒杀（一回合）'], ['flawless', '完胜'], ['steady', '稳胜'], ['narrow', '险胜'], ['draw', '平局'],
  ] as const)('displays a server-issued %s grade without changing the settlement', (grade, label) => {
    render(<DemonTowerReport report={report({ grade, outcome: grade === 'draw' ? 'timeout' : 'victory' })} catalog={towerCatalog()} />);
    expect(screen.getByText(`战绩评级 · ${label}`)).toBeVisible();
    expect(screen.getByText(/不改变经验、材料或排行榜/)).toBeVisible();
    expect(screen.getByText('+18')).toBeVisible();
  });

  it('does not fabricate a grade for a persisted older report', () => {
    render(<DemonTowerReport report={report()} catalog={towerCatalog()} />);
    expect(screen.queryByText(/战绩评级/)).toBeNull();
  });

  it.each([
    ['defeat', '暂时受挫', '当前没有胜利结算'],
    ['fled', '主动撤离', '已消耗的探索体力不会退还'],
    ['timeout', '回合上限', '未按胜利结算'],
  ] as const)('does not describe %s as a victory', (outcome, label, sentence) => {
    render(<DemonTowerReport report={report({ outcome, damage: 0, experience: 0, materials: { ore: 0, herb: 0, soul: 0, clue: 0 }, log: [] })} catalog={towerCatalog()} />);
    expect(screen.getByRole('heading', { name: label })).toBeVisible();
    expect(screen.getByText(new RegExp(sentence))).toBeVisible();
    expect(screen.queryByText(/服务器判定胜利/)).toBeNull();
    expect(screen.queryByText('+0')).toBeNull();
  });

  it('keeps live combat records scoped to the caller limit and labels system events', () => {
    render(<TowerCombatLog entries={[...log, { turn: 4, actor: 'system', kind: 'info', text: '共享首领免疫压血。' }]} limit={2} />);
    const entries = screen.getAllByRole('listitem');
    expect(entries).toHaveLength(2);
    expect(entries[0]).toHaveTextContent('我方');
    expect(entries[1]).toHaveTextContent('系统');
    expect(screen.queryByText('寻道者损失4生命。')).toBeNull();
  });
});

describe('daily task progress', () => {
  it('shows real, optional server counters and no second payout', () => {
    render(<DemonTowerDailyTasks daily={{ serviceDate: '2026-09-14', activity: 3, activityTarget: 3, rewardClaimed: false,
      exploreVictories: 1, bossAttempts: 0, bossAttemptsMax: 3, officeCoinsEarned: 0, officeCoinCap: 200 }} />);
    fireEvent.click(screen.getByText('每日任务 · 已完成 2/3'));
    const list = screen.getByRole('list', { name: '今日妖塔任务' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText(/不额外发币/)).toBeVisible();
  });
});
