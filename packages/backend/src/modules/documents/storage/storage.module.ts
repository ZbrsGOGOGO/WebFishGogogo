import * as os from 'node:os';
import * as path from 'node:path';

import { Module } from '@nestjs/common';

import { buildStorageConfig } from '../../../config/storage.config';
import { LocalFileStorageAdapter } from './local-file-storage.adapter';
import { S3StorageAdapter } from './s3-storage.adapter';
import { STORAGE_PORT, type StoragePort } from './storage.port';

export type StorageDriver = 'local' | 's3';

const SUPPORTED_STORAGE_DRIVERS: readonly StorageDriver[] = ['local', 's3'];
const DEFAULT_LOCAL_STORAGE_DIR = path.join(
  os.tmpdir(),
  'stealth-reader-storage',
);

/**
 * Resolves the selected storage backend.
 *
 * `STORAGE_DRIVER` is authoritative when set. The `LOCAL_DEV=true` fallback is
 * retained for existing zero-configuration development environments; all other
 * environments continue to default to S3.
 */
export function resolveStorageDriver(
  env: NodeJS.ProcessEnv = process.env,
): StorageDriver {
  const configuredDriver = env.STORAGE_DRIVER?.trim().toLowerCase();

  if (!configuredDriver) {
    return env.LOCAL_DEV === 'true' ? 'local' : 's3';
  }

  if (
    SUPPORTED_STORAGE_DRIVERS.includes(configuredDriver as StorageDriver)
  ) {
    return configuredDriver as StorageDriver;
  }

  throw new Error(
    `Invalid STORAGE_DRIVER "${env.STORAGE_DRIVER}". Expected one of: ${SUPPORTED_STORAGE_DRIVERS.join(', ')}.`,
  );
}

/**
 * Creates the adapter selected by the runtime environment.
 *
 * Local storage is a supported standalone deployment mode, not only a
 * development shortcut. Set `LOCAL_STORAGE_DIR` to a persistent, backed-up
 * directory when using it on a server.
 */
export function createStorageAdapter(
  env: NodeJS.ProcessEnv = process.env,
): StoragePort {
  const driver = resolveStorageDriver(env);

  if (driver === 'local') {
    return new LocalFileStorageAdapter({
      baseDir: env.LOCAL_STORAGE_DIR?.trim() || DEFAULT_LOCAL_STORAGE_DIR,
      keyPrefix: env.STORAGE_KEY_PREFIX ?? 'documents',
    });
  }

  return new S3StorageAdapter(buildStorageConfig(env));
}

/**
 * Binds `StoragePort` to the configured storage adapter.
 *
 * Selection rules:
 * - `STORAGE_DRIVER=local`: local filesystem in every environment.
 * - `STORAGE_DRIVER=s3`: S3/MinIO in every environment.
 * - no explicit driver: local for `LOCAL_DEV=true`, otherwise S3.
 *
 * Unsupported explicit values throw during Nest provider construction so a
 * deployment cannot silently start against the wrong backend.
 */
@Module({
  providers: [
    {
      provide: STORAGE_PORT,
      useFactory: () => createStorageAdapter(),
    },
  ],
  exports: [STORAGE_PORT],
})
export class StorageModule {}
