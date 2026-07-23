import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Profession, type Tool } from '@stealth-reader/shared';

import { ToolsPage } from './ToolsPage';
import * as api from '../../api';

function makeTool(overrides: Partial<Tool> = {}): Tool {
  return {
    id: overrides.id ?? 't1',
    slug: overrides.slug ?? 'countdown',
    name: overrides.name ?? '下班倒计时',
    category: overrides.category ?? '效率',
    description: overrides.description ?? '距离下班还有多久',
    icon: overrides.icon ?? null,
    enabled: overrides.enabled ?? true,
    professions: overrides.professions ?? [Profession.Dev],
  };
}

describe('ToolsPage (Req 14)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('lists all available tools on load (14.1) and uses persisted recommendation (14.7)', async () => {
    vi.spyOn(api.toolsApi, 'listTools').mockResolvedValue([makeTool()]);
    vi.spyOn(api.toolsApi, 'recommendTools').mockResolvedValue({
      profession: Profession.Dev,
      tools: [makeTool({ id: 't1', name: '下班倒计时' })],
    });

    render(<ToolsPage />);

    // 目录列出全部工具（推荐区与目录区都会出现）
    expect(
      (await screen.findAllByRole('heading', { name: '下班倒计时' })).length,
    ).toBeGreaterThan(0);
    // 使用已持久化职业推荐
    expect(await screen.findByText('为「开发」推荐：')).toBeInTheDocument();
  });

  it('selecting a profession persists + refreshes recommendation (14.2)', async () => {
    vi.spyOn(api.toolsApi, 'listTools').mockResolvedValue([makeTool()]);
    const recommendSpy = vi
      .spyOn(api.toolsApi, 'recommendTools')
      .mockResolvedValueOnce(null) // 初次无持久化职业
      .mockResolvedValueOnce({
        profession: Profession.Design,
        tools: [
          makeTool({
            id: 't2',
            name: '配色工具',
            professions: [Profession.Design],
          }),
        ],
      });

    render(<ToolsPage />);
    await screen.findByRole('heading', { name: '下班倒计时' });

    fireEvent.click(screen.getByRole('button', { name: '设计' }));

    await waitFor(() =>
      expect(recommendSpy).toHaveBeenCalledWith(Profession.Design),
    );
    expect(await screen.findByText('为「设计」推荐：')).toBeInTheDocument();
  });

  it('shows empty-state message when filter has no match (14.3/14.4)', async () => {
    const listSpy = vi
      .spyOn(api.toolsApi, 'listTools')
      .mockResolvedValueOnce([makeTool()]) // 初次载入
      .mockResolvedValueOnce({
        tools: [],
        noMatch: true,
        message: '未匹配到任何工具',
      });
    vi.spyOn(api.toolsApi, 'recommendTools').mockResolvedValue(null);

    render(<ToolsPage />);
    await screen.findByRole('heading', { name: '下班倒计时' });

    fireEvent.change(screen.getByLabelText('名称搜索'), {
      target: { value: '不存在的工具' },
    });
    fireEvent.click(screen.getByRole('button', { name: '筛选' }));

    expect(await screen.findByTestId('tools-empty')).toHaveTextContent(
      '未匹配到任何工具',
    );
    expect(listSpy).toHaveBeenLastCalledWith({
      category: undefined,
      q: '不存在的工具',
    });
  });

  it('launches a tool and shows its availability (14.5)', async () => {
    vi.spyOn(api.toolsApi, 'listTools').mockResolvedValue([makeTool()]);
    vi.spyOn(api.toolsApi, 'recommendTools').mockResolvedValue(null);
    const launchSpy = vi.spyOn(api.toolsApi, 'launchTool').mockResolvedValue({
      toolId: 't1',
      slug: 'countdown',
      available: true,
    });

    render(<ToolsPage />);
    await screen.findByRole('heading', { name: '下班倒计时' });

    fireEvent.click(screen.getAllByRole('button', { name: '启动' })[0]);

    await waitFor(() => expect(launchSpy).toHaveBeenCalledWith('t1'));
    expect(await screen.findByRole('status')).toHaveTextContent('可用');
  });
});
