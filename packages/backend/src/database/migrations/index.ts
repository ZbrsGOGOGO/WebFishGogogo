import { InitCoreSchema1700000000000 } from './1700000000000-InitCoreSchema';
import { SeedToolCatalog1700000000001 } from './1700000000001-SeedToolCatalog';
import { AddPlatformFoundation1700000000002 } from './1700000000002-AddPlatformFoundation';
import { AddInventoryFoundation1700000000003 } from './1700000000003-AddInventoryFoundation';
import { AddFarmMvp1700000000004 } from './1700000000004-AddFarmMvp';
import { AddArenaMvp1700000000005 } from './1700000000005-AddArenaMvp';
import { AddEngagementFoundation1700000000006 } from './1700000000006-AddEngagementFoundation';
import { AddTrustedReadingSessions1700000000007 } from './1700000000007-AddTrustedReadingSessions';
import { HardenCommunityAccounts1700000000008 } from './1700000000008-HardenCommunityAccounts';
import { AddCommunityRelationshipsAndPlant1700000000009 } from './1700000000009-AddCommunityRelationshipsAndPlant';
import { AddCommunityContentAndModeration1700000000010 } from './1700000000010-AddCommunityContentAndModeration';
import { HardenAuthOperations1700000000011 } from './1700000000011-HardenAuthOperations';
import { AddOfficeBattle1700000000012 } from './1700000000012-AddOfficeBattle';
import { AddAccountSecurityLifecycle1700000000013 } from './1700000000013-AddAccountSecurityLifecycle';
import { AddCommunityChat1700000000014 } from './1700000000014-AddCommunityChat';
import { AddEditorialNews1700000000015 } from './1700000000015-AddEditorialNews';
import { AddCommunityOperationalIndexes1700000000016 } from './1700000000016-AddCommunityOperationalIndexes';
import { AddUsernameAccounts1700000000017 } from './1700000000017-AddUsernameAccounts';
import { AddGameGrowthSystems1700000000018 } from './1700000000018-AddGameGrowthSystems';
import { UnifyGameEconomy1700000000019 } from './1700000000019-UnifyGameEconomy';
import { AddGuildFoundation1700000000020 } from './1700000000020-AddGuildFoundation';
import { AddGuildBoss1700000000021 } from './1700000000021-AddGuildBoss';
import { AddDailyHotNewsAndInviteCoin1700000000022 } from './1700000000022-AddDailyHotNewsAndInviteCoin';

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
  HardenCommunityAccounts1700000000008,
  AddCommunityRelationshipsAndPlant1700000000009,
  AddCommunityContentAndModeration1700000000010,
  HardenAuthOperations1700000000011,
  AddOfficeBattle1700000000012,
  AddAccountSecurityLifecycle1700000000013,
  AddCommunityChat1700000000014,
  AddEditorialNews1700000000015,
  AddCommunityOperationalIndexes1700000000016,
  AddUsernameAccounts1700000000017,
  AddGameGrowthSystems1700000000018,
  UnifyGameEconomy1700000000019,
  AddGuildFoundation1700000000020,
  AddGuildBoss1700000000021,
  AddDailyHotNewsAndInviteCoin1700000000022,
];
