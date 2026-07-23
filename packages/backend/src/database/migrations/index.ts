import { InitCoreSchema1700000000000 } from './1700000000000-InitCoreSchema';
import { SeedToolCatalog1700000000001 } from './1700000000001-SeedToolCatalog';

/** 迁移清单，供 TypeORM DataSource / NestJS TypeOrmModule 使用 */
export const migrations = [
  InitCoreSchema1700000000000,
  SeedToolCatalog1700000000001,
];
