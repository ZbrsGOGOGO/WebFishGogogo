import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import PalmStory from './PalmStory';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('PalmStory', () => {
  it('requires manual observation and shows an evidence-backed local report', () => {
    const fetchSpy = vi.fn();
    const storageSpy = vi.spyOn(Storage.prototype, 'setItem');
    vi.stubGlobal('fetch', fetchSpy);
    render(<PalmStory />);

    fireEvent.click(screen.getByRole('button', { name: '生成趣味卡片' }));
    expect(screen.getByRole('alert')).toHaveTextContent('请先手动记录至少一条纹路');
    expect(screen.getByRole('alert')).toHaveFocus();
    fireEvent.change(screen.getByLabelText('上方横线'), { target: { value: 'curved' } });
    fireEvent.click(screen.getByRole('button', { name: '生成趣味卡片' }));
    expect(screen.getByRole('heading', { name: /弧光手记/ })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /弧光手记/ })).toHaveFocus();
    expect(screen.getByText('五步自我探索 · 不是未来预言')).toBeInTheDocument();
    expect(screen.getByText(/你手动记录了左手的上方横线“偏弯曲”/)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(storageSpy).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('中部横线'), { target: { value: 'straight' } });
    expect(screen.queryByRole('heading', { name: /弧光手记/ })).not.toBeInTheDocument();
  });

  it('validates local photos, reads them as local data URLs, and clears them without network calls', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const view = render(<PalmStory />);
    const leftInput = screen.getByLabelText('选择左手照片');
    const invalid = new File(['x'], 'note.txt', { type: 'text/plain' });
    fireEvent.change(leftInput, { target: { files: [invalid] } });
    expect(screen.getByRole('alert')).toHaveTextContent('仅支持 JPG');
    fireEvent.change(leftInput, { target: { files: [new File([], 'empty.png', { type: 'image/png' })] } });
    expect(screen.getByRole('alert')).toHaveTextContent('空文件');
    const oversized = new File(['x'], 'huge.png', { type: 'image/png' });
    Object.defineProperty(oversized, 'size', { value: 8 * 1024 * 1024 + 1 });
    fireEvent.change(leftInput, { target: { files: [oversized] } });
    expect(screen.getByRole('alert')).toHaveTextContent('不能超过 8 MB');
    fireEvent.change(leftInput, { target: { files: [new File(['x'], 'left.png', { type: 'image/png' })] } });
    expect(await screen.findByRole('img', { name: '左手照片本地预览' })).toHaveAttribute('src', 'data:image/png;base64,eA==');
    fireEvent.change(screen.getByLabelText('更换左手照片'), { target: { files: [new File(['y'], 'new.webp', { type: 'image/webp' })] } });
    await waitFor(() => expect(screen.getByRole('img', { name: '左手照片本地预览' })).toHaveAttribute('src', 'data:image/webp;base64,eQ=='));
    fireEvent.click(screen.getByRole('button', { name: '移除' }));
    expect(screen.queryByRole('img', { name: '左手照片本地预览' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('选择右手照片'), { target: { files: [new File(['x'], 'right.jpg', { type: 'image/jpeg' })] } });
    expect(await screen.findByRole('img', { name: '右手照片本地预览' })).toHaveAttribute('src', 'data:image/jpeg;base64,eA==');
    fireEvent.error(screen.getByRole('img', { name: '右手照片本地预览' }));
    expect(screen.getByRole('alert')).toHaveTextContent('图片无法显示');
    expect(screen.queryByRole('img', { name: '右手照片本地预览' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('选择右手照片'), { target: { files: [new File(['z'], 'right.webp', { type: 'image/webp' })] } });
    expect(await screen.findByRole('img', { name: '右手照片本地预览' })).toHaveAttribute('src', 'data:image/webp;base64,eg==');
    fireEvent.click(screen.getByRole('button', { name: '清空本页内容' }));
    expect(screen.queryByRole('img', { name: '右手照片本地预览' })).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    view.unmount();
  });
});
