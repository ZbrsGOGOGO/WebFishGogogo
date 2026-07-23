import type { DataSourceOptions } from 'typeorm';

import { entities } from '../database/entities';
import { migrations } from '../database/migrations';

/**
 * 从环境变量构建 PostgreSQL 连接配置。
 *
 * 说明：
 * - 正文不入库，数据库仅存元数据、索引与用户数据（见 design.md 关切点 4）。
 * - `synchronize` 恒为 false：schema 变更一律通过迁移脚本，避免生产环境结构漂移。
 * - 迁移不自动执行，交由部署流程用 `migration:run` 显式触发。
 */
export function buildDatabaseConfig(
  env: NodeJS.ProcessEnv = process.env,
): DataSourceOptions {
  return {
    type: 'postgres',
    host: env.DB_HOST ?? 'localhost',
    port: env.DB_PORT ? Number(env.DB_PORT) : 5432,
    username: env.DB_USERNAME ?? 'postgres',
    password: env.DB_PASSWORD ?? 'postgres',
    database: env.DB_DATABASE ?? 'stealth_reader',
    schema: env.DB_SCHEMA ?? 'public',
    ssl: env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    entities,
    migrations,
    synchronize: false,
    migrationsRun: false,
    logging: env.DB_LOGGING === 'true',
  };
}
