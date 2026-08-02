import 'reflect-metadata';
import { newDb, type IMemoryDb } from 'pg-mem';
import { DataSource } from 'typeorm';

import { entities } from './entities';
import { migrations } from './migrations';

/**
 * 本地开发 / 预览用的内存数据库（pg-mem）。
 *
 * 目的：在无需安装 PostgreSQL 的情况下，用纯 JS 的内存版 Postgres 直接运行
 * 现有的 Postgres 迁移脚本，跑通后端全部功能。仅在 LOCAL_DEV=true 时使用；
 * 生产环境仍走真实 PostgreSQL（buildDatabaseConfig）。
 *
 * 说明：
 * - pg-mem 兼容大部分 Postgres 语法。对少数内建函数（gen_random_uuid / now）做注册，
 *   使迁移中的 DEFAULT 表达式可用。
 * - 数据仅存在于内存，进程退出即清空（预览场景足够；重启后重新迁移+种子）。
 */
export async function createLocalDevDataSource(): Promise<DataSource> {
  const db: IMemoryDb = newDb({ autoCreateForeignKeyIndices: true });

  // 注册迁移里用到的 Postgres 内建函数。
  db.public.registerFunction({
    name: 'gen_random_uuid',
    returns: 'uuid' as never,
    implementation: () => randomUuid(),
    impure: true,
  });
  // TypeORM 的 postgres 驱动在连接时会调用 SELECT version() / current_database()，
  // pg-mem 未内建，这里注册以通过连接握手。
  db.public.registerFunction({
    name: 'version',
    returns: 'text' as never,
    implementation: () => 'PostgreSQL 14.0 (pg-mem local dev)',
    impure: true,
  });
  db.public.registerFunction({
    name: 'current_database',
    returns: 'text' as never,
    implementation: () => 'stealth_reader',
    impure: true,
  });
  // pgcrypto / uuid-ossp 扩展在 pg-mem 下为 no-op（函数已手动注册）。
  db.registerExtension('pgcrypto', () => {});
  db.registerExtension('uuid-ossp', () => {});

  const dataSource: DataSource = db.adapters.createTypeormDataSource({
    type: 'postgres',
    entities,
    migrations,
    synchronize: false,
    migrationsRun: false,
  }) as DataSource;

  await dataSource.initialize();
  // 运行迁移建表 + 灌入工具目录种子数据。
  await dataSource.runMigrations();

  return dataSource;
}

/** 生成 RFC4122 v4 UUID（优先用 Node 原生 crypto.randomUUID）。 */
function randomUuid(): string {
  const cryptoObj = (globalThis as { crypto?: { randomUUID?: () => string } })
    .crypto;
  if (cryptoObj?.randomUUID) {
    return cryptoObj.randomUUID();
  }
  // 极少数无 crypto.randomUUID 的运行时下的回退实现。
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
