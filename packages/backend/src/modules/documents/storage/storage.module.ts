import * as os from 'node:os';
import * as path from 'node:path';

import { Module } from '@nestjs/common';

import { buildStorageConfig } from '../../../config/storage.config';
import { LocalFileStorageAdapter } from './local-file-storage.adapter';
import { S3StorageAdapter } from './s3-storage.adapter';
import { STORAGE_PORT } from './storage.port';

/**
 * 存储模块：将 `StoragePort` 绑定到具体适配器。
 *
 * 上层（DocumentsService / ReadingService）通过 `@Inject(STORAGE_PORT)` 注入抽象，
 * 具体实现由此工厂根据环境变量构建，可在 S3 / MinIO / 本地文件系统间切换：
 * - 默认：S3StorageAdapter（生产 / MinIO）。
 * - LOCAL_DEV=true：LocalFileStorageAdapter（本地开发/预览，正文写到本地目录，
 *   无需任何对象存储服务）。存储目录由 LOCAL_STORAGE_DIR 指定，默认系统临时目录下
 *   的 stealth-reader-storage。
 */
@Module({
  providers: [
    {
      provide: STORAGE_PORT,
      useFactory: () => {
        if (process.env.LOCAL_DEV === 'true') {
          const baseDir =
            process.env.LOCAL_STORAGE_DIR ||
            path.join(os.tmpdir(), 'stealth-reader-storage');
          return new LocalFileStorageAdapter({
            baseDir,
            keyPrefix: process.env.STORAGE_KEY_PREFIX ?? 'documents',
          });
        }
        return new S3StorageAdapter(buildStorageConfig());
      },
    },
  ],
  exports: [STORAGE_PORT],
})
export class StorageModule {}
