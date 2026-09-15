import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WorkspaceDeskScene from './WorkspaceDeskScene';

describe('WorkspaceDeskScene safe fallback', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  it('does not create a WebGL context when the user requests reduced motion', () => {
    const addEventListener = vi.fn(), removeEventListener = vi.fn();
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener, removeEventListener }));
    const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
    const { unmount } = render(<WorkspaceDeskScene />);
    expect(screen.getByText('已开启减少动效')).toBeInTheDocument();
    expect(context).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /台灯/ })).not.toBeInTheDocument();
    unmount(); expect(removeEventListener).toHaveBeenCalled(); context.mockRestore();
  });
  it('gives a readable non-WebGL alternative instead of failing the page', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const silence = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<WorkspaceDeskScene />);
    expect(await screen.findByText('当前设备暂不支持 3D 视角')).toBeInTheDocument();
    expect(screen.getByText('已切换为轻量界面，工具和游戏仍可正常使用。')).toBeInTheDocument();
    context.mockRestore(); silence.mockRestore();
  });
});
