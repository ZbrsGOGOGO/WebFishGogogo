import { promises as fs } from 'node:fs';
import * as path from 'node:path';

import type { StoragePort } from './storage.port';

/**
 * 本地文件系统存储适配器（仅用于本地开发 / 预览）。
 *
 * 实现与 S3StorageAdapter 相同的 StoragePort 契约，但把章节正文写到本地磁盘目录，
 * 从而无需任何对象存储服务即可跑通「上传 → 解析 → 存正文 → 阅读拉取」全链路。
 *
 * 生产环境仍使用 S3StorageAdapter；本适配器仅在 LOCAL_DEV=true 时启用。
 *
 * key 布局与 S3 适配器保持一致：`${keyPrefix}/${docId}/chapter-${idx}.txt`，
 * 落到磁盘即 `${baseDir}/${keyPrefix}/${docId}/chapter-${idx}.txt`。
 */
export class LocalFileStorageAdapter implements StoragePort {
  private readonly baseDir: string;
  private readonly keyPrefix: string;

  constructor(options: { baseDir: string; keyPrefix?: string }) {
    this.baseDir = options.baseDir;
    this.keyPrefix = (options.keyPrefix ?? 'documents').replace(/^\/+|\/+$/g, '');
  }

  private documentPrefix(docId: string): string {
    return `${this.keyPrefix}/${docId}`;
  }

  private chapterKey(docId: string, idx: number): string {
    return `${this.documentPrefix(docId)}/chapter-${idx}.txt`;
  }

  /** 将 storageKey 映射为磁盘绝对路径。 */
  private absPath(storageKey: string): string {
    return path.join(this.baseDir, storageKey);
  }

  async putChapter(docId: string, idx: number, content: string): Promise<string> {
    const storageKey = this.chapterKey(docId, idx);
    const filePath = this.absPath(storageKey);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
    return storageKey;
  }

  async getChapter(storageKey: string): Promise<string> {
    try {
      return await fs.readFile(this.absPath(storageKey), 'utf-8');
    } catch {
      return '';
    }
  }

  async deleteDocument(docId: string): Promise<void> {
    const dir = this.absPath(this.documentPrefix(docId));
    await fs.rm(dir, { recursive: true, force: true });
  }
}
