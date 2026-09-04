import { Bookmark } from './bookmark.entity';
import { AdminAuditLog } from './admin-audit-log.entity';
import { ActivityEvent } from './activity-event.entity';
import { ArenaBattle } from './arena-battle.entity';
import { ArenaOpponentOffer } from './arena-opponent-offer.entity';
import { ArenaProfile } from './arena-profile.entity';
import { ArcadeBestScore, ArcadeGameRun } from './arcade-score.entity';
import { AccountAppeal } from './account-appeal.entity';
import { AccountDeletionRequest } from './account-deletion-request.entity';
import { AccountRestriction } from './account-restriction.entity';
import { AuthRefreshToken } from './auth-refresh-token.entity';
import { AuthEmailOutbox } from './auth-email-outbox.entity';
import { AuthRateLimitBucket } from './auth-rate-limit-bucket.entity';
import { AuthSession } from './auth-session.entity';
import { BetaAccessCode } from './beta-access-code.entity';
import { BetaAccessReservation } from './beta-access-reservation.entity';
import { Chapter } from './chapter.entity';
import { Checkin } from './checkin.entity';
import {
  ChatMessage,
  ChatMessageMention,
  ChatMessageReport,
  ChatRoom,
  ChatSocketTicket,
} from './chat.entity';
import { CommunityCommandReceipt } from './community-command-receipt.entity';
import { CommunityCapacityGuard } from './community-capacity-guard.entity';
import { CommunityComment } from './community-comment.entity';
import { CommunityNotification } from './community-notification.entity';
import { CommunityPost } from './community-post.entity';
import { CommentRevision } from './comment-revision.entity';
import { ContentReport } from './content-report.entity';
import { ConsentRecord } from './consent-record.entity';
import { Document } from './document.entity';
import { DeskPlant } from './desk-plant.entity';
import { DeskPlantCycle } from './desk-plant-cycle.entity';
import { DeskPlantRewardClaim } from './desk-plant-reward-claim.entity';
import {
  DirectConversation,
  DirectConversationMember,
  DirectMessage,
  DirectMessageReport,
} from './direct-message.entity';
import { EnergyState } from './energy-state.entity';
import { EmailVerification } from './email-verification.entity';
import { CropDefinition } from './crop-definition.entity';
import { FarmPlanting } from './farm-planting.entity';
import { FarmPlot } from './farm-plot.entity';
import { FakeMeta } from './fake-meta.entity';
import { FriendEncouragement } from './friend-encouragement.entity';
import { FriendRequest } from './friend-request.entity';
import { Friendship } from './friendship.entity';
import { InventoryLedger } from './inventory-ledger.entity';
import { InventoryStack } from './inventory-stack.entity';
import { ItemDefinition } from './item-definition.entity';
import { Guild } from './guild.entity';
import { GuildBossContribution } from './guild-boss-contribution.entity';
import { GuildBossRun } from './guild-boss-run.entity';
import { GuildLedger } from './guild-ledger.entity';
import { GuildMember } from './guild-member.entity';
import { HotNewsHeadline, HotNewsRefreshRun } from './hot-news.entity';
import { Memo } from './memo.entity';
import { ModerationAction } from './moderation-action.entity';
import { ModerationCase } from './moderation-case.entity';
import {
  NewsArticle,
  NewsArticleRevision,
  NewsReviewDecision,
} from './news-article.entity';
import {
  NewsNegativeFeedback,
  NewsUserPreference,
} from './news-personalization.entity';
import { NewsSource } from './news-source.entity';
import {
  OfficeBattleDefenseConfig,
  OfficeBattleLoadoutItem,
} from './office-battle-configuration.entity';
import { OfficeBattleEquipment } from './office-battle-equipment.entity';
import {
  OfficeBattleAssetLedger,
  OfficeBattleInventoryLedger,
} from './office-battle-ledger.entity';
import {
  OfficeBattleOffer,
  OfficeBattleOfferSet,
} from './office-battle-offer.entity';
import { OfficeBattleProfile } from './office-battle-profile.entity';
import { OfficeBattleRecord } from './office-battle-record.entity';
import {
  OfficeBattleFriendRewardClaim,
  OfficeBattlePendingReward,
} from './office-battle-reward.entity';
import { OutboxEvent } from './outbox-event.entity';
import { OutboxReceipt } from './outbox-receipt.entity';
import { PasswordResetToken } from './password-reset-token.entity';
import { PlayerProfile } from './player-profile.entity';
import { PlayerProgression } from './player-progression.entity';
import { PostBookmark } from './post-bookmark.entity';
import { PostFollow } from './post-follow.entity';
import { PostRevision } from './post-revision.entity';
import { PostUsefulReaction } from './post-useful-reaction.entity';
import { ReadingDailyUsage } from './reading-daily-usage.entity';
import { ReadingProgress } from './reading-progress.entity';
import { ReadingSession } from './reading-session.entity';
import { ReferralClaimToken } from './referral-claim-token.entity';
import { ReferralCode } from './referral-code.entity';
import { ReferralRedemption } from './referral-redemption.entity';
import { RewardGrant } from './reward-grant.entity';
import { SocialVerificationCallbackReceipt } from './social-verification-callback-receipt.entity';
import { SocialVerificationSession } from './social-verification-session.entity';
import { Tool } from './tool.entity';
import { ToolProfession } from './tool-profession.entity';
import { TaskDefinition } from './task-definition.entity';
import { User } from './user.entity';
import { UserPreference } from './user-preference.entity';
import { UserTaskProgress } from './user-task-progress.entity';
import { WalletBalance } from './wallet-balance.entity';
import { WalletLedger } from './wallet-ledger.entity';
import { UserFarm } from './user-farm.entity';
import { UserBlock } from './user-block.entity';

export {
  AccountAppeal,
  AccountDeletionRequest,
  AccountRestriction,
  AdminAuditLog,
  ActivityEvent,
  ArenaBattle,
  ArenaOpponentOffer,
  ArenaProfile,
  ArcadeBestScore,
  ArcadeGameRun,
  AuthRefreshToken,
  AuthEmailOutbox,
  AuthRateLimitBucket,
  AuthSession,
  BetaAccessCode,
  BetaAccessReservation,
  Bookmark,
  Chapter,
  Checkin,
  ChatMessage,
  ChatMessageMention,
  ChatMessageReport,
  ChatRoom,
  ChatSocketTicket,
  CommunityCommandReceipt,
  CommunityCapacityGuard,
  CommunityComment,
  CommunityNotification,
  CommunityPost,
  CommentRevision,
  ConsentRecord,
  ContentReport,
  Document,
  DeskPlant,
  DeskPlantCycle,
  DeskPlantRewardClaim,
  DirectConversation,
  DirectConversationMember,
  DirectMessage,
  DirectMessageReport,
  EnergyState,
  EmailVerification,
  CropDefinition,
  FarmPlanting,
  FarmPlot,
  FakeMeta,
  FriendEncouragement,
  FriendRequest,
  Friendship,
  Guild,
  GuildBossContribution,
  GuildBossRun,
  GuildLedger,
  GuildMember,
  HotNewsHeadline,
  HotNewsRefreshRun,
  InventoryLedger,
  InventoryStack,
  ItemDefinition,
  Memo,
  ModerationAction,
  ModerationCase,
  NewsArticle,
  NewsArticleRevision,
  NewsNegativeFeedback,
  NewsReviewDecision,
  NewsSource,
  NewsUserPreference,
  OfficeBattleAssetLedger,
  OfficeBattleDefenseConfig,
  OfficeBattleEquipment,
  OfficeBattleFriendRewardClaim,
  OfficeBattleInventoryLedger,
  OfficeBattleLoadoutItem,
  OfficeBattleOffer,
  OfficeBattleOfferSet,
  OfficeBattlePendingReward,
  OfficeBattleProfile,
  OfficeBattleRecord,
  OutboxEvent,
  OutboxReceipt,
  PasswordResetToken,
  PlayerProfile,
  PlayerProgression,
  PostBookmark,
  PostFollow,
  PostRevision,
  PostUsefulReaction,
  ReadingDailyUsage,
  ReadingProgress,
  ReadingSession,
  ReferralClaimToken,
  ReferralCode,
  ReferralRedemption,
  RewardGrant,
  SocialVerificationCallbackReceipt,
  SocialVerificationSession,
  Tool,
  ToolProfession,
  TaskDefinition,
  User,
  UserPreference,
  UserTaskProgress,
  WalletBalance,
  WalletLedger,
  UserFarm,
  UserBlock,
};

/** 所有实体的集合，供 TypeORM DataSource / NestJS TypeOrmModule 使用 */
export const entities = [
  User,
  ArcadeBestScore,
  ArcadeGameRun,
  AccountAppeal,
  AccountDeletionRequest,
  AccountRestriction,
  AdminAuditLog,
  ActivityEvent,
  ArenaProfile,
  ArenaOpponentOffer,
  ArenaBattle,
  AuthRefreshToken,
  AuthEmailOutbox,
  AuthRateLimitBucket,
  AuthSession,
  BetaAccessCode,
  BetaAccessReservation,
  Document,
  Chapter,
  ConsentRecord,
  EmailVerification,
  ReadingDailyUsage,
  ReadingSession,
  ReadingProgress,
  Bookmark,
  Memo,
  OutboxEvent,
  OutboxReceipt,
  PasswordResetToken,
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
  SocialVerificationCallbackReceipt,
  SocialVerificationSession,
  Checkin,
  ChatMessage,
  ChatMessageMention,
  ChatMessageReport,
  ChatRoom,
  ChatSocketTicket,
  CommunityCommandReceipt,
  CommunityCapacityGuard,
  CommunityComment,
  CommunityNotification,
  CommunityPost,
  CommentRevision,
  ContentReport,
  ModerationAction,
  ModerationCase,
  NewsArticle,
  NewsArticleRevision,
  NewsNegativeFeedback,
  NewsReviewDecision,
  NewsSource,
  NewsUserPreference,
  OfficeBattleAssetLedger,
  OfficeBattleDefenseConfig,
  OfficeBattleEquipment,
  OfficeBattleFriendRewardClaim,
  OfficeBattleInventoryLedger,
  OfficeBattleLoadoutItem,
  OfficeBattleOffer,
  OfficeBattleOfferSet,
  OfficeBattlePendingReward,
  OfficeBattleProfile,
  OfficeBattleRecord,
  PostBookmark,
  PostFollow,
  PostRevision,
  PostUsefulReaction,
  DeskPlant,
  DeskPlantCycle,
  DeskPlantRewardClaim,
  DirectConversation,
  DirectConversationMember,
  DirectMessage,
  DirectMessageReport,
  FriendEncouragement,
  FriendRequest,
  Friendship,
  Guild,
  GuildBossContribution,
  GuildBossRun,
  GuildLedger,
  GuildMember,
  HotNewsHeadline,
  HotNewsRefreshRun,
  ReferralClaimToken,
  ReferralCode,
  ReferralRedemption,
  UserBlock,
  ItemDefinition,
  InventoryStack,
  InventoryLedger,
  UserFarm,
  FarmPlot,
  CropDefinition,
  FarmPlanting,
];
