import { Bookmark } from './bookmark.entity';
import { ActivityEvent } from './activity-event.entity';
import { ArenaBattle } from './arena-battle.entity';
import { ArenaOpponentOffer } from './arena-opponent-offer.entity';
import { ArenaProfile } from './arena-profile.entity';
import { Chapter } from './chapter.entity';
import { Checkin } from './checkin.entity';
import { Document } from './document.entity';
import { EnergyState } from './energy-state.entity';
import { CropDefinition } from './crop-definition.entity';
import { FarmPlanting } from './farm-planting.entity';
import { FarmPlot } from './farm-plot.entity';
import { FakeMeta } from './fake-meta.entity';
import { InventoryLedger } from './inventory-ledger.entity';
import { InventoryStack } from './inventory-stack.entity';
import { ItemDefinition } from './item-definition.entity';
import { Memo } from './memo.entity';
import { OutboxEvent } from './outbox-event.entity';
import { OutboxReceipt } from './outbox-receipt.entity';
import { PlayerProfile } from './player-profile.entity';
import { PlayerProgression } from './player-progression.entity';
import { ReadingDailyUsage } from './reading-daily-usage.entity';
import { ReadingProgress } from './reading-progress.entity';
import { ReadingSession } from './reading-session.entity';
import { RewardGrant } from './reward-grant.entity';
import { Tool } from './tool.entity';
import { ToolProfession } from './tool-profession.entity';
import { TaskDefinition } from './task-definition.entity';
import { User } from './user.entity';
import { UserPreference } from './user-preference.entity';
import { UserTaskProgress } from './user-task-progress.entity';
import { WalletBalance } from './wallet-balance.entity';
import { WalletLedger } from './wallet-ledger.entity';
import { UserFarm } from './user-farm.entity';

export {
  ActivityEvent,
  ArenaBattle,
  ArenaOpponentOffer,
  ArenaProfile,
  Bookmark,
  Chapter,
  Checkin,
  Document,
  EnergyState,
  CropDefinition,
  FarmPlanting,
  FarmPlot,
  FakeMeta,
  InventoryLedger,
  InventoryStack,
  ItemDefinition,
  Memo,
  OutboxEvent,
  OutboxReceipt,
  PlayerProfile,
  PlayerProgression,
  ReadingDailyUsage,
  ReadingProgress,
  ReadingSession,
  RewardGrant,
  Tool,
  ToolProfession,
  TaskDefinition,
  User,
  UserPreference,
  UserTaskProgress,
  WalletBalance,
  WalletLedger,
  UserFarm,
};

/** 所有实体的集合，供 TypeORM DataSource / NestJS TypeOrmModule 使用 */
export const entities = [
  User,
  ActivityEvent,
  ArenaProfile,
  ArenaOpponentOffer,
  ArenaBattle,
  Document,
  Chapter,
  ReadingDailyUsage,
  ReadingSession,
  ReadingProgress,
  Bookmark,
  Memo,
  OutboxEvent,
  OutboxReceipt,
  FakeMeta,
  UserPreference,
  Tool,
  ToolProfession,
  TaskDefinition,
  UserTaskProgress,
  PlayerProfile,
  PlayerProgression,
  EnergyState,
  WalletBalance,
  WalletLedger,
  RewardGrant,
  Checkin,
  ItemDefinition,
  InventoryStack,
  InventoryLedger,
  UserFarm,
  FarmPlot,
  CropDefinition,
  FarmPlanting,
];
