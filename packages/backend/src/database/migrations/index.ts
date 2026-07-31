import { InitCoreSchema1700000000000 } from './1700000000000-InitCoreSchema';
import { SeedToolCatalog1700000000001 } from './1700000000001-SeedToolCatalog';
import { AddPlatformFoundation1700000000002 } from './1700000000002-AddPlatformFoundation';
import { AddInventoryFoundation1700000000003 } from './1700000000003-AddInventoryFoundation';
import { AddFarmMvp1700000000004 } from './1700000000004-AddFarmMvp';
import { AddArenaMvp1700000000005 } from './1700000000005-AddArenaMvp';
import { AddEngagementFoundation1700000000006 } from './1700000000006-AddEngagementFoundation';
import { AddTrustedReadingSessions1700000000007 } from './1700000000007-AddTrustedReadingSessions';

/** 迁移清单，供 TypeORM DataSource / NestJS TypeOrmModule 使用 */
export const migrations = [
  InitCoreSchema1700000000000,
  SeedToolCatalog1700000000001,
  AddPlatformFoundation1700000000002,
  AddInventoryFoundation1700000000003,
  AddFarmMvp1700000000004,
  AddArenaMvp1700000000005,
  AddEngagementFoundation1700000000006,
  AddTrustedReadingSessions1700000000007,
];
