import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Profession, type Tool } from '@stealth-reader/shared';

import * as api from '../../api';
import { ToolsPage } from './ToolsPage';

function makeRemoteTool(overrides: Partial<Tool> = {}): Tool {
  return {
    id: overrides.id ?? 'remote-calculator',
    slug: overrides.slug ?? 'calculator',
    name: overrides.name ?? '计算器',
    category: overrides.category ?? '计算',
    description: overrides.description ?? '服务端旧文案',
    icon: overrides.icon ?? 'calculator',
    enabled: overrides.enabled ?? true,
    professions: overrides.professions ?? [Profession.Finance],
  };
}

describe('ToolsPage 本机工具箱', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('首屏立即展示内置 12 项目录，并吸收服务端职业偏好', async () => {
    vi.spyOn(api.toolsApi, 'listTools').mockResolvedValue([
      makeRemoteTool(),
    ]);
    vi.spyOn(api.toolsApi, 'recommendTools').mockResolvedValue({
      profession: Profession.Dev,
      tools: [],
    });

    render(<ToolsPage />);

    expect(screen.getByLabelText('本机工具数量')).toHaveTextContent('12');
    expect(screen.getByRole('heading', { name: '计算器' })).toBeInTheDocument();

    const professionGroup = screen.getByRole('group', { name: '职业偏好' });
    await waitFor(() =>
      expect(
        within(professionGroup).getByRole('button', { name: '开发' }),
      ).toHaveAttribute('aria-pressed', 'true'),
    );
    expect(window.localStorage.getItem('zbrs.tools.profession')).toBe('开发');
  });

  it('职业 chips 本机即时生效并尝试同步偏好', async () => {
    vi.spyOn(api.toolsApi, 'listTools').mockResolvedValue([]);
    const recommendSpy = vi
      .spyOn(api.toolsApi, 'recommendTools')
      .mockResolvedValue(null);

    render(<ToolsPage />);

    const professionGroup = screen.getByRole('group', { name: '职业偏好' });
    fireEvent.click(
      within(professionGroup).getByRole('button', { name: '设计' }),
    );

    expect(window.localStorage.getItem('zbrs.tools.profession')).toBe('设计');
    expect(screen.getByText('已优先展示适合「设计」的工具。')).toBeInTheDocument();
    await waitFor(() =>
      expect(recommendSpy).toHaveBeenCalledWith(Profession.Design),
    );
  });

  it('搜索和分类均在本机即时筛选，不发起额外目录请求', async () => {
    const listSpy = vi
      .spyOn(api.toolsApi, 'listTools')
      .mockResolvedValue([]);
    vi.spyOn(api.toolsApi, 'recommendTools').mockResolvedValue(null);

    render(<ToolsPage />);
    await waitFor(() => expect(listSpy).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索工具' }), {
      target: { value: 'JSON' },
    });

    expect(screen.getByRole('heading', { name: 'JSON 格式化' })).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: '下班倒计时' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '清除筛选' }));
    const categoryGroup = screen.getByRole('group', { name: '工具分类' });
    fireEvent.click(
      within(categoryGroup).getByRole('button', { name: '文本' }),
    );

    expect(screen.getByRole('heading', { name: '文本处理' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '字数统计' })).toBeInTheDocument();
    expect(listSpy).toHaveBeenCalledTimes(1);
  });

  it('目录接口失败时保留 12 项兜底，并且不经 launch API 直接打开', async () => {
    vi.spyOn(api.toolsApi, 'listTools').mockRejectedValue(
      new Error('offline'),
    );
    vi.spyOn(api.toolsApi, 'recommendTools').mockRejectedValue(
      new Error('offline'),
    );
    const launchSpy = vi.spyOn(api.toolsApi, 'launchTool');

    render(<ToolsPage />);

    expect(
      await screen.findByText('当前使用内置本机目录，12 款工具仍可正常使用。'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '打开计算器' }));

    expect(
      screen.getByRole('dialog', { name: '计算器' }),
    ).toBeInTheDocument();
    expect(launchSpy).not.toHaveBeenCalled();
  });

  it('无匹配时显示清晰空状态，并可恢复全部工具', async () => {
    const listSpy = vi.spyOn(api.toolsApi, 'listTools').mockResolvedValue([]);
    vi.spyOn(api.toolsApi, 'recommendTools').mockResolvedValue(null);

    render(<ToolsPage />);
    await waitFor(() => expect(listSpy).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByRole('searchbox', { name: '搜索工具' }), {
      target: { value: '不存在的工具' },
    });

    expect(screen.getByTestId('tools-empty')).toHaveTextContent(
      '没有找到匹配的工具',
    );
    fireEvent.click(screen.getByRole('button', { name: '查看全部工具' }));
    expect(screen.getByRole('heading', { name: '计算器' })).toBeInTheDocument();
  });
});
