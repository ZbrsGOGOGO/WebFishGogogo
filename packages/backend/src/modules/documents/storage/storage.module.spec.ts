import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { LocalFileStorageAdapter } from './local-file-storage.adapter';
import { S3StorageAdapter } from './s3-storage.adapter';
import {
  createStorageAdapter,
  resolveStorageDriver,
} from './storage.module';

describe('storage adapter selection', () => {
  it('uses the explicit local driver outside local development', () => {
    const adapter = createStorageAdapter({
      LOCAL_DEV: 'false',
      STORAGE_DRIVER: 'local',
    });

    expect(adapter).toBeInstanceOf(LocalFileStorageAdapter);
  });

  it('keeps LOCAL_DEV=true as the zero-configuration local fallback', () => {
    expect(resolveStorageDriver({ LOCAL_DEV: 'true' })).toBe('local');
  });

  it('allows an explicit S3 driver to override local development', () => {
    const adapter = createStorageAdapter({
      LOCAL_DEV: 'true',
      STORAGE_DRIVER: 's3',
    });

    expect(adapter).toBeInstanceOf(S3StorageAdapter);
  });

  it('defaults to S3 outside local development', () => {
    expect(resolveStorageDriver({ LOCAL_DEV: 'false' })).toBe('s3');
    expect(resolveStorageDriver({ NODE_ENV: 'production' })).toBe('s3');
  });

  it('fails fast for an unsupported explicit driver', () => {
    expect(() =>
      createStorageAdapter({
        LOCAL_DEV: 'false',
        STORAGE_DRIVER: 'filesystem',
      }),
    ).toThrow(
      'Invalid STORAGE_DRIVER "filesystem". Expected one of: local, s3.',
    );
  });

  it('writes local content below the configured LOCAL_STORAGE_DIR', async () => {
    const baseDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'webfish-storage-test-'),
    );

    try {
      const adapter = createStorageAdapter({
        LOCAL_DEV: 'false',
        STORAGE_DRIVER: 'local',
        LOCAL_STORAGE_DIR: baseDir,
        STORAGE_KEY_PREFIX: 'private-documents',
      });

      const storageKey = await adapter.putChapter(
        'document-1',
        2,
        'chapter content',
      );

      await expect(adapter.checkHealth()).resolves.toBeUndefined();
      expect(storageKey).toBe(
        'private-documents/document-1/chapter-2.txt',
      );
      await expect(
        fs.readFile(path.join(baseDir, storageKey), 'utf-8'),
      ).resolves.toBe('chapter content');
    } finally {
      await fs.rm(baseDir, { recursive: true, force: true });
    }
  });
});
