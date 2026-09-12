import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ColorConverter from './ColorConverter';

const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  if (clipboardDescriptor) {
    Object.defineProperty(navigator, 'clipboard', clipboardDescriptor);
  } else {
    delete (navigator as unknown as Record<string, unknown>).clipboard;
  }
});

describe('ColorConverter CMYK interactions', () => {
  it('edits CMYK bidirectionally without rewriting the CMYK draft', () => {
    render(<ColorConverter />);

    expect(screen.getByText(/ICC 色彩配置/)).toBeInTheDocument();
    const cyan = screen.getByRole('spinbutton', { name: 'C%' });
    const black = screen.getByRole('spinbutton', { name: 'K%' });
    const initialCyan = (cyan as HTMLInputElement).value;

    fireEvent.change(black, { target: { value: '100' } });

    expect(screen.getByRole('textbox', { name: 'HEX' })).toHaveValue('#000000');
    expect(cyan).toHaveValue(Number(initialCyan));
    expect(black).toHaveValue(100);
  });

  it('syncs CMYK fields after editing another color format', () => {
    render(<ColorConverter />);

    fireEvent.change(screen.getByRole('textbox', { name: 'HEX' }), {
      target: { value: '#00FF00' },
    });

    expect(screen.getByRole('spinbutton', { name: 'C%' })).toHaveValue(100);
    expect(screen.getByRole('spinbutton', { name: 'M%' })).toHaveValue(0);
    expect(screen.getByRole('spinbutton', { name: 'Y%' })).toHaveValue(100);
    expect(screen.getByRole('spinbutton', { name: 'K%' })).toHaveValue(0);
  });

  it('keeps invalid input visible and prevents copying it', () => {
    render(<ColorConverter />);

    fireEvent.change(screen.getByRole('spinbutton', { name: 'M%' }), {
      target: { value: '101' },
    });

    expect(screen.getByRole('alert')).toHaveTextContent('0–100');
    expect(screen.getByRole('button', { name: '复制 CMYK' })).toBeDisabled();
  });

  it('copies the explicit CMYK representation', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    render(<ColorConverter />);

    fireEvent.change(screen.getByRole('textbox', { name: 'HEX' }), {
      target: { value: '#FF0000' },
    });
    fireEvent.click(screen.getByRole('button', { name: '复制 CMYK' }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('cmyk(0% 100% 100% 0%)');
      expect(screen.getByRole('status')).toHaveTextContent('已复制 CMYK');
    });
  });
});
