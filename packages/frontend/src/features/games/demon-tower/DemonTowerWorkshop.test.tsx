import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { emptyTowerWorkshop } from '@stealth-reader/shared';
import { towerProfile } from './test-fixtures';
import { DemonTowerWorkshop } from './DemonTowerWorkshop';

const profile = () => towerProfile({ workshop: emptyTowerWorkshop('2026-09-23'), availableActions: ['workshop_forge', 'workshop_refine', 'workshop_equip', 'workshop_recast', 'workshop_discard', 'workshop_purchase'] });
describe('September 23 workshop UI', () => {
  it('previews costs and never submits a forge with insufficient materials', () => {
    const onAction = vi.fn(); render(<DemonTowerWorkshop profile={profile()} disabled={false} balance={100} balanceStale={false} onAction={onAction} />);
    expect(screen.getByRole('button', { name: '确认耗材并打造' })).toBeDisabled();
    expect(screen.getByText(/黑铁精（原矿）0\/3/)).toBeVisible(); expect(onAction).not.toHaveBeenCalled();
  });
  it('requires confirmation for a real-wallet purchase and sends no client price or balance', () => {
    const onAction = vi.fn().mockResolvedValue(false); render(<DemonTowerWorkshop profile={profile()} disabled={false} balance={100} balanceStale={false} onAction={onAction} />);
    fireEvent.click(screen.getAllByRole('button', { name: '购买 1 份' })[0]);
    expect(onAction).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', { name: '确认材料购买' });
    expect(within(dialog).getByText(/扣除 8 办公币/)).toBeVisible();
    fireEvent.click(within(dialog).getByRole('button', { name: '确认购买' }));
    expect(onAction).toHaveBeenCalledExactlyOnceWith({ kind: 'workshop_purchase', payload: { material: 'ht', quantity: 1 } });
  });
  it('respects pending operations and stale wallet observations', () => {
    const p = profile(); p.workshop!.materials = { ht: 3, mt: 30 };
    render(<DemonTowerWorkshop profile={p} disabled balance={100} balanceStale onAction={vi.fn()} />);
    expect(screen.getByRole('button', { name: '确认耗材并打造' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '精炼一批' })).toBeDisabled();
    for (const b of screen.getAllByRole('button', { name: '购买 1 份' })) expect(b).toBeDisabled();
  });
  it('disables all mutations when the server says an in-flight battle forbids them', () => {
    const p = profile(); p.availableActions = ['attack', 'flee']; p.workshop!.materials = { ht: 10, mt: 30 };
    render(<DemonTowerWorkshop profile={p} disabled={false} balance={100} balanceStale={false} onAction={vi.fn()} />);
    expect(screen.getByRole('button', { name: '确认耗材并打造' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '精炼一批' })).toBeDisabled();
    for (const b of screen.getAllByRole('button', { name: '购买 1 份' })) expect(b).toBeDisabled();
  });
  it('requires an explicit no-refund confirmation before discarding an unequipped item', () => {
    const p = profile();
    p.workshop!.items.push({ id: '1', slot: 'weapon', quality: '白', name: '测试短剑', requiredLevel: 1, weaponType: 'zhong', set: null,
      affixes: [{ id: 'duangu', name: '锻骨', stat: 'dimPct', key: 'str', value: 1, description: '' }] });
    const onAction = vi.fn().mockResolvedValue(false);
    render(<DemonTowerWorkshop profile={p} disabled={false} balance={100} balanceStale={false} onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: '丢弃' }));
    expect(onAction).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', { name: '确认丢弃装备' });
    expect(within(dialog).getByText(/不返还任何材料/)).toBeVisible();
    fireEvent.click(within(dialog).getByRole('button', { name: '确认丢弃' }));
    expect(onAction).toHaveBeenCalledExactlyOnceWith({ kind: 'workshop_discard', payload: { itemId: '1' } });
  });
});
