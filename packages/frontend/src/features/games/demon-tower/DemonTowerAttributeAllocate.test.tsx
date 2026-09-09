import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DemonTowerAttributeAllocate } from './DemonTowerAttributeAllocate';
import { towerBattle, towerCatalog, towerProfile } from './test-fixtures';

describe('demon tower explicitly confirmed bulk allocation', () => {
  afterEach(cleanup);
  const props = () => ({ catalog: towerCatalog(), profile: towerProfile({ unspentPoints: 241 }), disabled: false, onAction: vi.fn().mockResolvedValue(true) });
  const open = () => { fireEvent.click(screen.getByRole('button', { name: '批量分配自由点' })); return screen.getByRole('dialog', { name: '批量分配自由点' }); };

  it('defaults to one point and confirms a large allocation in exactly one request', async () => {
    let resolve!: (value: boolean) => void;
    const request = new Promise<boolean>((yes) => { resolve = yes; });
    const data = { ...props(), onAction: vi.fn().mockReturnValue(request) };
    render(<DemonTowerAttributeAllocate {...data} />); const dialog = open();
    expect(screen.getByRole('textbox', { name: '分配数量' })).toHaveValue('1');
    fireEvent.change(screen.getByRole('combobox', { name: '分配属性' }), { target: { value: 'LUCK' } });
    fireEvent.change(screen.getByRole('textbox', { name: '分配数量' }), { target: { value: '241' } });
    expect(within(dialog).getByText(/将为幸运分配 241 点，确认后剩余 0 点/)).toBeTruthy();
    expect(data.onAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '确认分配 241 点幸运' })); fireEvent.submit(dialog.querySelector('form')!);
    expect(data.onAction).toHaveBeenCalledExactlyOnceWith({ kind: 'allocate', payload: { attribute: 'LUCK', points: 241 } });
    expect(screen.getByRole('button', { name: '正在分配…' })).toBeDisabled();
    await act(async () => { resolve(true); await request; });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it.each(['', '0', '-1', '1.5', 'word', '5e2', ' 1', '242', '1001'])('rejects invalid or over-budget quantity %j without sending', (quantity) => {
    const data = props(); render(<DemonTowerAttributeAllocate {...data} />); const dialog = open();
    fireEvent.change(screen.getByRole('textbox', { name: '分配数量' }), { target: { value: quantity } });
    expect(screen.getByRole('button', { name: '输入有效数量后分配' })).toBeDisabled();
    fireEvent.submit(dialog.querySelector('form')!); expect(data.onAction).not.toHaveBeenCalled();
  });

  it('enforces the API 1000-point maximum even if a future account has more points', () => {
    render(<DemonTowerAttributeAllocate {...props()} profile={towerProfile({ unspentPoints: 2000 })} />); open();
    fireEvent.change(screen.getByRole('textbox', { name: '分配数量' }), { target: { value: '1001' } });
    expect(screen.getByText(/请输入 1–1000 的整数/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '输入有效数量后分配' })).toBeDisabled();
  });

  it('keeps the intended quantity when another action changes the budget and requires a valid reconfirmation', async () => {
    const data = props(); const first = towerProfile({ unspentPoints: 10 });
    const rendered = render(<DemonTowerAttributeAllocate {...data} profile={first} />); const dialog = open();
    fireEvent.change(screen.getByRole('textbox', { name: '分配数量' }), { target: { value: '8' } });
    rendered.rerender(<DemonTowerAttributeAllocate {...data} profile={{ ...first, version: 2, unspentPoints: 7 }} />);
    expect(screen.getByRole('textbox', { name: '分配数量' })).toHaveValue('8');
    expect(screen.getByText(/其他行动已更新可用点数/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '输入有效数量后分配' })).toBeDisabled();
    fireEvent.submit(dialog.querySelector('form')!); expect(data.onAction).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox', { name: '分配数量' }), { target: { value: '6' } });
    expect(screen.getByText(/确认后剩余 1 点/)).toBeTruthy();
    fireEvent.submit(dialog.querySelector('form')!);
    await waitFor(() => expect(data.onAction).toHaveBeenCalledWith({ kind: 'allocate', payload: { attribute: 'STR', points: 6 } }));
  });

  it.each(['zero', 'battle', 'maintenance', 'unavailable'])('does not open a writable allocation when %s', (condition) => {
    const data = props();
    render(<DemonTowerAttributeAllocate {...data} disabled={condition === 'maintenance'} profile={towerProfile({ unspentPoints: condition === 'zero' ? 0 : 10, battle: condition === 'battle' ? towerBattle() : null, availableActions: condition === 'unavailable' ? [] : ['allocate'] })} />);
    const button = screen.getByRole('button', { name: '批量分配自由点' }); expect(button).toBeDisabled(); fireEvent.click(button);
    expect(screen.queryByRole('dialog')).toBeNull(); expect(data.onAction).not.toHaveBeenCalled();
  });

  it('does not allocate just by cancelling the quantity draft', () => {
    const data = props(); render(<DemonTowerAttributeAllocate {...data} />); open();
    fireEvent.change(screen.getByRole('textbox', { name: '分配数量' }), { target: { value: '150' } });
    fireEvent.click(screen.getByRole('button', { name: '暂不分配' }));
    expect(screen.queryByRole('dialog')).toBeNull(); expect(data.onAction).not.toHaveBeenCalled(); open();
    expect(screen.getByRole('textbox', { name: '分配数量' })).toHaveValue('1');
  });

  it('preserves a rejected draft and handles transport rejection without exposing raw errors', async () => {
    const data = props(); data.onAction.mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('private stack should not appear'));
    render(<DemonTowerAttributeAllocate {...data} />); const dialog = open();
    fireEvent.submit(dialog.querySelector('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent('分配尚未完成');
    fireEvent.submit(dialog.querySelector('form')!);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('暂时未能确认分配结果'));
    expect(dialog.textContent).not.toContain('private stack');
  });
});
