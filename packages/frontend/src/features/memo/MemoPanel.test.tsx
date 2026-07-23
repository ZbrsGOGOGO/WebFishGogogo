import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

import { MemoPanel } from './MemoPanel';

// 模拟 memo API 客户端，避免真实网络请求。
const getMemo = vi.fn();
const saveMemo = vi.fn();

vi.mock('../../api/memo', () => ({
  getMemo: () => getMemo(),
  saveMemo: (content: string) => saveMemo(content),
}));

describe('MemoPanel (Req 10.1, 10.2)', () => {
  beforeEach(() => {
    getMemo.mockReset();
    saveMemo.mockReset();
    saveMemo.mockResolvedValue({ content: '', updatedAt: null });
  });

  it('restores previously saved memo content on mount (Req 10.2)', async () => {
    getMemo.mockResolvedValue({
      content: '上次的笔记',
      updatedAt: '2024-01-01T00:00:00Z',
    });

    render(<MemoPanel />);

    const textarea = await screen.findByLabelText<HTMLTextAreaElement>('便签内容');
    await waitFor(() => expect(textarea.value).toBe('上次的笔记'));
  });

  it('auto-saves content with debounce on edit (Req 10.1)', async () => {
    getMemo.mockResolvedValue({ content: '', updatedAt: null });

    render(<MemoPanel autoSaveDelay={50} />);

    const textarea = await screen.findByLabelText<HTMLTextAreaElement>('便签内容');
    await waitFor(() => expect(textarea).not.toBeDisabled());

    // 连续输入，防抖后只保存最终值。
    fireEvent.change(textarea, { target: { value: 'hel' } });
    fireEvent.change(textarea, { target: { value: 'hello' } });

    await waitFor(() => expect(saveMemo).toHaveBeenCalledWith('hello'));
    // 防抖合并了中间输入，保存不应被每次按键各触发一次。
    expect(saveMemo).toHaveBeenCalledTimes(1);
  });

  it('does not save the initial loaded value (avoids overwriting server state)', async () => {
    getMemo.mockResolvedValue({
      content: '服务端已有内容',
      updatedAt: '2024-01-01T00:00:00Z',
    });

    render(<MemoPanel autoSaveDelay={50} />);

    await screen.findByDisplayValue('服务端已有内容');
    // 等待超过防抖时间，确认未因初始值触发保存。
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(saveMemo).not.toHaveBeenCalled();
  });
});
