import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { DataSource, DataSourceOptions } from 'typeorm';

import { buildDatabaseConfig } from '../config/database.config';
import { createLocalDevDataSource } from './local-dev-datasource';

const isLocalDev = process.env.LOCAL_DEV === 'true';

/**
 * 数据库模块：建立 TypeORM 连接。
 *
 * - 默认：连接真实 PostgreSQL（buildDatabaseConfig），schema 变更走迁移。
 * - LOCAL_DEV=true：使用 pg-mem 内存数据库（无需安装 Postgres），启动时自动
 *   建表并灌入工具种子数据，便于本地开发/预览。数据仅存内存，进程退出即清空。
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      useFactory: () => buildDatabaseConfig(),
      // 本地开发用 pg-mem 构建的 DataSource 覆盖默认连接；
      // 生产模式下沿用传入 options 正常初始化真实 Postgres 连接。
      dataSourceFactory: async (options?: DataSourceOptions): Promise<DataSource> => {
        if (isLocalDev) {
          return createLocalDevDataSource();
        }
        const { DataSource } = await import('typeorm');
        const dataSource = new DataSource(options as DataSourceOptions);
        return dataSource.initialize();
      },
    }),
  ],
})
export class DatabaseModule {}
