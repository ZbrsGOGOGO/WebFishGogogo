import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReviewModeRouter } from '../../app/review-router';

function renderReviewAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ReviewModeRouter />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('PublicToolsPage', () => {
  it('shows the eleven safe browser tools without API or storage access', () => {
    const fetchSpy = vi.fn();
    const storageGetSpy = vi.spyOn(Storage.prototype, 'getItem');
    const storageSetSpy = vi.spyOn(Storage.prototype, 'setItem');
    vi.stubGlobal('fetch', fetchSpy);

    renderReviewAt('/tools');

    expect(screen.getByRole('heading', { name: '11 款轻量工具' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /^打开/ })).toHaveLength(11);
    expect(screen.getByRole('link', { name: '打开文本整理' })).toHaveAttribute(
      'href',
      '/tools/text-tools',
    );
    expect(screen.getByRole('link', { name: '打开颜色转换' })).toBeInTheDocument();
    expect(screen.queryByText('正则测试')).not.toBeInTheDocument();
    expect(screen.getByText('汇率换算')).toBeInTheDocument();
    expect(screen.getByText('下班倒计时')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(storageGetSpy).not.toHaveBeenCalled();
    expect(storageSetSpy).not.toHaveBeenCalled();
  });

  it('opens a whitelisted tool from its public deep link and closes back to the list', async () => {
    renderReviewAt('/tools/json-formatter');

    expect(
      await screen.findByRole('dialog', { name: 'JSON 格式化' }, { timeout: 5_000 }),
    ).toBeInTheDocument();
    expect(
      await screen.findByLabelText('JSON 文本', {}, { timeout: 5_000 }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: '11 款轻量工具' })).toBeInTheDocument();
  });

  it('does not expose a non-whitelisted registry tool through a deep link', () => {
    renderReviewAt('/tools/regex-tester');

    expect(screen.getByRole('alert')).toHaveTextContent('这个工具不存在或暂未公开');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('filters tools by keyword and category', () => {
    renderReviewAt('/tools');

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索工具' }), {
      target: { value: '时间戳' },
    });
    expect(screen.getByRole('link', { name: '打开时间戳转换' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '打开文本整理' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索工具' }), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: '文本' }));
    expect(screen.getAllByRole('link', { name: /^打开/ })).toHaveLength(2);
  });
});
