import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DEMON_TOWER_SKILLS, DEMON_TOWER_WEAPONS } from '@stealth-reader/shared';

import { DemonTowerUpgradePreview, demonTowerUpgradePreview } from './DemonTowerUpgradePreview';

const weapon = (id: string) => DEMON_TOWER_WEAPONS.find(item => item.id === id)!;
const skill = (id: string) => DEMON_TOWER_SKILLS.find(item => item.id === id)!;

describe('server-formula demon tower upgrade preview', () => {
  it.each(DEMON_TOWER_WEAPONS)('renders a finite current-to-next formula for weapon $id', definition => {
    const preview = demonTowerUpgradePreview({ kind: 'weapon', definition, owned: { id: definition.id, quality: 2, spareCopies: 0, star: 2, favor: 4 } }, true);
    expect(preview.quality).toContain('品质 +2→+3');
    expect(preview.star).toContain('星级 2→3');
    expect(`${preview.quality}${preview.star}${preview.proficiency}`).not.toMatch(/undefined|NaN|Infinity/);
  });

  it.each(DEMON_TOWER_SKILLS)('renders a finite current-to-next formula for skill $id', definition => {
    const preview = demonTowerUpgradePreview({ kind: 'skill', definition, owned: { id: definition.id, quality: 2, spareCopies: 0, star: 2, favor: 4 } }, true);
    expect(preview.quality).toContain('品质 +2→+3');
    expect(preview.star).toContain('星级 2→3');
    expect(`${preview.quality}${preview.star}${preview.proficiency}`).not.toMatch(/undefined|NaN|Infinity/);
  });

  it('discloses a real rounded weapon step instead of claiming an effect that the server does not apply', () => {
    const preview = demonTowerUpgradePreview({ kind: 'weapon', definition: weapon('w5'), owned: { id: 'w5', quality: 1, spareCopies: 0, star: 2, favor: 9 } }, true);
    expect(preview.quality).toContain('敏捷+7→+7');
    expect(preview.quality).toContain('本阶主维因整数取整暂不变');
    expect(preview.quality).toContain('先手首击必暴规则固定');
    expect(preview.formula).toContain('主维=round(6×[1+0.1×品质])');
    expect(preview.star).toContain('普攻星级倍率×1.1→×1.2');
    expect(preview.proficiency).toContain('熟练度 9/30');
    expect(preview.proficiency).toContain('多段、群攻仍只记1');
  });

  it('matches the weapon quality scale used by combat traits and the rounded equipped attribute', () => {
    const preview = demonTowerUpgradePreview({ kind: 'weapon', definition: weapon('w2'), owned: { id: 'w2', quality: 2, spareCopies: 0, star: 1, favor: 0 } }, true);
    expect(preview.quality).toContain('力量+12→+13');
    expect(preview.quality).toContain('命中震慑率26%→命中震慑率29%');
  });

  it('includes both breakthrough dimensions in the displayed equipped contribution', () => {
    const preview = demonTowerUpgradePreview({ kind: 'weapon', definition: weapon('w1'), owned: { id: 'w1', quality: 5, spareCopies: 0, star: 2, favor: 0, breakthrough: 1 } }, true);
    expect(preview.formula).toContain('+3×突破，相邻第二主维=4×突破');
    expect(preview.quality).toContain('装备后力量+12→+13');
    expect(preview.quality).toContain('突破另使速度+4');
  });

  it('publishes the total exploration-probability ceiling beside the scaled w20 contribution', () => {
    const preview = demonTowerUpgradePreview({ kind: 'weapon', definition: weapon('w20'), owned: { id: 'w20', quality: 2, spareCopies: 0, star: 2, favor: 0 } }, true);
    expect(preview.quality).toContain('探索物品率+13%（计入总概率后上限70%）');
    expect(preview.quality).toContain('探索物品率+14.5%（计入总概率后上限70%）');
  });

  it('shows multiplicative quality/star skill effects and the exact every-third-quality cooldown drop', () => {
    const preview = demonTowerUpgradePreview({ kind: 'skill', definition: skill('s2'), owned: { id: 's2', quality: 2, spareCopies: 0, star: 3, favor: 20 } }, true);
    expect(preview.quality).toContain('伤害2.88倍力量→伤害3.16倍力量');
    expect(preview.quality).toContain('有效冷却2→1回合');
    expect(preview.formula).toBe('数值效果=基础效果×[1+0.12×品质]×[1+0.08×(星级-1)]；非0冷却每+3品质减1回合，最低1。');
    expect(preview.star).toContain('伤害2.88倍力量→伤害3.08倍力量');
    expect(preview.star).toContain('星级系数×1.16→×1.24');
    expect(preview.proficiency).toContain('每次实际施放+1');
    expect(preview.proficiency).toContain('达45自动免费升4星并清零');
  });

  it('distinguishes passive accumulation and stops promising progress after the fifth star', () => {
    const passive = demonTowerUpgradePreview({ kind: 'skill', definition: skill('s8'), owned: { id: 's8', quality: 2, spareCopies: 0, star: 2, favor: 12 } }, true);
    expect(passive.proficiency).toContain('装入被动槽后，每个存活回合结束+1');
    const maximum = demonTowerUpgradePreview({ kind: 'weapon', definition: weapon('w4'), owned: { id: 'w4', quality: 9, spareCopies: 0, star: 5, favor: 0 } }, true);
    expect(maximum.quality).toContain('已达上限');
    expect(maximum.star).toContain('5星已满');
    expect(maximum.proficiency).toBe('熟练度：5星已满，不再累积。');
  });

  it('can publish quality-only details for legacy projections without inventing star fields', () => {
    render(<DemonTowerUpgradePreview item={{ kind: 'skill', definition: skill('s1'), owned: { id: 's1', quality: 1, spareCopies: 0 } }} showStars={false} />);
    expect(screen.getByLabelText('服务端实际成长数值')).toHaveTextContent('品质 +1→+2');
    expect(screen.queryByText(/星级 1→2/)).toBeNull();
    expect(screen.queryByText(/熟练度/)).toBeNull();
  });
});
