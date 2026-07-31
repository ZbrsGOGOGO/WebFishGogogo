import { constants as fsConstants, promises as fs } from 'node:fs';
import * as path from 'node:path';

import type { StoragePort } from './storage.port';

/**
 * Local filesystem implementation of `StoragePort`.
 *
 * This adapter is suitable for both local development and a standalone
 * single-server deployment. In production, `baseDir` should point to a
 * persistent directory included in the server's backup policy.
 *
 * Object keys match the S3 adapter:
 * `${keyPrefix}/${docId}/chapter-${idx}.txt`. On disk they are stored below
 * `${baseDir}/${keyPrefix}/${docId}`.
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

  async checkHealth(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
    await fs.access(this.baseDir, fsConstants.R_OK | fsConstants.W_OK);
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
