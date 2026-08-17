import type { DataSourceOptions } from 'typeorm';

import { entities } from '../database/entities';
import { migrations } from '../database/migrations';

const DEFAULT_DATABASE_PORT = 5432;
const DEFAULT_POOL_SIZE = 15;
const DEFAULT_CONNECT_TIMEOUT_MS = 5_000;
const DEFAULT_POOL_IDLE_TIMEOUT_MS = 30_000;
const DEFAULT_STATEMENT_TIMEOUT_MS = 15_000;
const DEFAULT_QUERY_TIMEOUT_MS = 20_000;
const DEFAULT_LOCK_TIMEOUT_MS = 5_000;
const DEFAULT_IDLE_TRANSACTION_TIMEOUT_MS = 30_000;

/**
 * 从环境变量构建 PostgreSQL 连接配置。
 *
 * 说明：
 * - 正文不入库，数据库仅存元数据、索引与用户数据（见 design.md 关切点 4）。
 * - `synchronize` 恒为 false：schema 变更一律通过迁移脚本，避免生产环境结构漂移。
 * - 迁移不自动执行，交由部署流程用 `migration:run` 显式触发。
 * - 每个 API / worker 进程拥有独立连接池；扩容时应确保所有进程的
 *   `DB_POOL_MAX` 总和不超过 PostgreSQL 的连接预算。
 */
export function buildDatabaseConfig(
  env: NodeJS.ProcessEnv = process.env,
): DataSourceOptions {
  const poolSize = positiveInteger(env, 'DB_POOL_MAX', DEFAULT_POOL_SIZE, 200);
  const connectTimeoutMS = positiveInteger(
    env,
    'DB_CONNECT_TIMEOUT_MS',
    DEFAULT_CONNECT_TIMEOUT_MS,
  );

  return {
    type: 'postgres',
    host: env.DB_HOST ?? 'localhost',
    port: positiveInteger(env, 'DB_PORT', DEFAULT_DATABASE_PORT, 65_535),
    username: env.DB_USERNAME ?? 'postgres',
    password: env.DB_PASSWORD ?? 'postgres',
    database: env.DB_DATABASE ?? 'stealth_reader',
    schema: env.DB_SCHEMA ?? 'public',
    ssl: env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    poolSize,
    connectTimeoutMS,
    extra: {
      idleTimeoutMillis: positiveInteger(
        env,
        'DB_POOL_IDLE_TIMEOUT_MS',
        DEFAULT_POOL_IDLE_TIMEOUT_MS,
      ),
      statement_timeout: positiveInteger(
        env,
        'DB_STATEMENT_TIMEOUT_MS',
        DEFAULT_STATEMENT_TIMEOUT_MS,
      ),
      query_timeout: positiveInteger(
        env,
        'DB_QUERY_TIMEOUT_MS',
        DEFAULT_QUERY_TIMEOUT_MS,
      ),
      lock_timeout: positiveInteger(
        env,
        'DB_LOCK_TIMEOUT_MS',
        DEFAULT_LOCK_TIMEOUT_MS,
      ),
      idle_in_transaction_session_timeout: positiveInteger(
        env,
        'DB_IDLE_TRANSACTION_TIMEOUT_MS',
        DEFAULT_IDLE_TRANSACTION_TIMEOUT_MS,
      ),
    },
    entities,
    migrations,
    synchronize: false,
    migrationsRun: false,
    logging: env.DB_LOGGING === 'true',
  };
}

function positiveInteger(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  maximum = 600_000,
): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') return fallback;

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${key} must be an integer between 1 and ${maximum}`);
  }
  return value;
}
