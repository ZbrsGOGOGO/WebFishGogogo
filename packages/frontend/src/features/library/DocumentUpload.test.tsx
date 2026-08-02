import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { DocumentUpload } from './DocumentUpload';
import * as api from '../../api';

// 上传组件核心约束：未勾选自有内容声明或未选文件时禁止上传（Req 2.2 / 13.1）。
describe('DocumentUpload (Req 2.2 / 13.1)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function selectFile(): void {
    const input = screen.getByLabelText('选择 .txt 文件') as HTMLInputElement;
    const file = new File(['hello'], 'book.txt', { type: 'text/plain' });
    fireEvent.change(input, { target: { files: [file] } });
  }

  it('disables upload until a file is selected and the declaration is confirmed', () => {
    render(<DocumentUpload />);
    const button = screen.getByRole('button', { name: '上传' });

    // 初始：无文件、未勾选 -> 禁用
    expect(button).toBeDisabled();

    // 选择文件但未勾选声明 -> 仍禁用
    selectFile();
    expect(button).toBeDisabled();

    // 勾选自有内容声明 -> 启用
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /我确认上传的内容为本人自有且合法拥有/,
      }),
    );
    expect(button).toBeEnabled();
  });

  it('sends ownedContentDeclarationConfirmed=true on upload', async () => {
    const spy = vi
      .spyOn(api.documentsApi, 'uploadDocument')
      .mockResolvedValue({
        id: 'd1',
        ownerId: 'u1',
        title: 'book.txt',
        encoding: 'utf-8',
        charCount: 5,
        chapterCount: 1,
        status: 'processing',
        createdAt: new Date().toISOString(),
      });

    render(<DocumentUpload />);
    selectFile();
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /我确认上传的内容为本人自有且合法拥有/,
      }),
    );
    fireEvent.submit(screen.getByRole('button', { name: '上传' }));

    // 等待异步提交完成
    await screen.findByRole('status');

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(expect.any(File), true);
  });
});
