import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { ToolRunnerModal } from './ToolRunnerModal';
import { getToolRuntimeEntry, isToolRegistered } from './registry';

describe('tool runtime registry', () => {
  it('registers all 12 backend slugs', () => {
    const slugs = [
      'off-work-countdown',
      'timer',
      'date-calculator',
      'calculator',
      'currency-converter',
      'unit-converter',
      'text-tools',
      'word-counter',
      'json-formatter',
      'timestamp-converter',
      'regex-tester',
      'color-converter',
    ];
    for (const slug of slugs) {
      expect(isToolRegistered(slug)).toBe(true);
      expect(getToolRuntimeEntry(slug)?.slug).toBe(slug);
    }
  });

  it('returns undefined for unknown slug', () => {
    expect(isToolRegistered('does-not-exist')).toBe(false);
    expect(getToolRuntimeEntry('does-not-exist')).toBeUndefined();
  });
});

describe('ToolRunnerModal', () => {
  beforeEach(() => {
    document.body.style.overflow = '';
  });

  it('renders nothing when slug is null', () => {
    const { container } = render(
      <ToolRunnerModal slug={null} onClose={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the registered real tool component in a dialog', async () => {
    render(
      <ToolRunnerModal
        slug="calculator"
        title="计算器"
        onClose={() => {}}
      />,
    );
    // 真实计算器组件懒加载后应出现其显示区。
    expect(
      await screen.findByTestId('calc-display', {}, { timeout: 5_000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: '计算器' })).toBeInTheDocument();
  });

  it('shows a not-found message for an unregistered slug', () => {
    render(<ToolRunnerModal slug="nope" onClose={() => {}} />);
    expect(screen.getByTestId('tool-runner-not-found')).toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', async () => {
    const onClose = vi.fn();
    render(<ToolRunnerModal slug="timer" onClose={onClose} />);
    // 等待真实计时器组件懒加载出现其显示区。
    await screen.findByTestId('timer-display', {}, { timeout: 5_000 });
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('locks page scrolling, handles Escape, and restores the trigger focus', () => {
    const trigger = document.createElement('button');
    trigger.textContent = '打开工具';
    document.body.appendChild(trigger);
    trigger.focus();
    const onClose = vi.fn();

    const { rerender } = render(
      <ToolRunnerModal slug="nope" title="未知工具" onClose={onClose} />,
    );

    expect(document.body.style.overflow).toBe('hidden');
    expect(screen.getByRole('button', { name: '关闭' })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(<ToolRunnerModal slug={null} onClose={onClose} />);
    expect(document.body.style.overflow).toBe('');
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it('keeps Tab focus inside the dialog and closes from the backdrop', () => {
    const onClose = vi.fn();
    render(
      <ToolRunnerModal slug="nope" title="未知工具" onClose={onClose} />,
    );

    const closeButton = screen.getByRole('button', { name: '关闭' });
    fireEvent.keyDown(closeButton, { key: 'Tab' });
    expect(closeButton).toHaveFocus();

    const dialog = screen.getByRole('dialog');
    const overlay = dialog.parentElement;
    expect(overlay).not.toBeNull();
    fireEvent.mouseDown(overlay as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
