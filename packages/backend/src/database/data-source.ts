import 'reflect-metadata';
import { DataSource } from 'typeorm';

import { buildDatabaseConfig } from '../config/database.config';

/**
 * TypeORM CLI 使用的 DataSource（用于 migration:run / migration:revert 等）。
 * 运行期 NestJS 通过 DatabaseModule 使用同一份配置。
 */
export const AppDataSource = new DataSource(buildDatabaseConfig());

export default AppDataSource;
