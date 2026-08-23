import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';

import { CommunityCommandReceipt } from '../../database/entities/community-command-receipt.entity';
import { PlayerProfile } from '../../database/entities/player-profile.entity';
import { ReferralClaimToken } from '../../database/entities/referral-claim-token.entity';
import { ReferralCode } from '../../database/entities/referral-code.entity';
import { ReferralRedemption } from '../../database/entities/referral-redemption.entity';
import { User } from '../../database/entities/user.entity';
import { WalletBalance } from '../../database/entities/wallet-balance.entity';
import { PlatformAssetsService } from '../platform';
import { COMMUNITY_CLOCK, CommunityClock } from './community-clock';
import {
  serviceMonth,
  toCommunityServiceDate,
} from './community-time';
import {
  opaqueSecret,
  requestHash,
  secretHash,
} from './community-validation';
import {
  assertCommunityWritesEnabled,
  communityWritesEnabled,
} from './community-write-gate';
import { NotificationService } from './notification.service';
import { RelationshipPolicyService } from './relationship-policy.service';

const CLAIM_TOKEN_TTL_MS = 15 * 60 * 1_000;
const QUALIFIED_DAILY_LIMIT = 5;
const QUALIFIED_MONTHLY_LIMIT = 20;
const MONTHLY_REWARD_LIMIT = 5;
const INVITER_INVITE_COIN_REWARD = 1;
const QUALIFYING_ACTIVITY_COMMAND_PREFIXES = [
  'friend.',
  'content.',
  'farm.',
  'battle.',
] as const;

@Injectable()
export class ReferralService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly policy: RelationshipPolicyService,
    private readonly assets: PlatformAssetsService,
    private readonly notifications: NotificationService,
    @Inject(COMMUNITY_CLOCK) private readonly clock: CommunityClock,
  ) {}

  async createOrRotate(userId: string, idempotencyKey: string) {
    assertReferralActionsEnabled();
    assertCommunityWritesEnabled();
    const hash = requestHash({ action: 'rotate' });
    return this.dataSource.transaction(async (manager) => {
      const users = await this.policy.lockActiveUsers(manager, [userId]);
      const replay = await this.replay(
        manager,
        userId,
        'referral.rotate',
        idempotencyKey,
        hash,
      );
      if (replay) return replay;
      const repo = manager.getRepository(ReferralCode);
      const active = await repo.findOne({
        where: { inviterId: userId, status: 'active' },
        lock: { mode: 'pessimistic_write' },
      });
      if (active) {
        active.status = 'rotated';
        await repo.save(active);
      }
      const count = await repo.count({ where: { inviterId: userId } });
      const rawCode = opaqueSecret('ref_', 24);
      await repo.save(
        repo.create({
          inviterId: userId,
          codeHash: secretHash('referral-code', rawCode),
          purpose: 'user_referral',
          status: 'active',
          version: count + 1,
          expiresAt: null,
        }),
      );
      const result = await this.overviewWithManager(
        manager,
        users.get(userId)!,
        rawCode,
      );
      return this.record(
        manager,
        userId,
        'referral.rotate',
        idempotencyKey,
        hash,
        result,
      );
    });
  }

  async overview(userId: string) {
    const user = await this.dataSource.getRepository(User).findOneByOrFail({
      id: userId,
    });
    return this.overviewWithManager(this.dataSource.manager, user, null);
  }

  async preview(rawCode: string) {
    assertReferralActionsEnabled();
    assertCommunityWritesEnabled();
    if (
      typeof rawCode !== 'string' ||
      rawCode.length < 20 ||
      rawCode.length > 100
    ) {
      throw new BadRequestException({ code: 'INVALID_REFERRAL_CODE' });
    }
    return this.dataSource.transaction(async (manager) => {
      const now = this.clock.now();
      const code = await manager.getRepository(ReferralCode).findOne({
        where: {
          codeHash: secretHash('referral-code', rawCode),
          purpose: 'user_referral',
          status: 'active',
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (!code || (code.expiresAt && code.expiresAt.getTime() <= now.getTime())) {
        throw new BadRequestException({ code: 'INVALID_REFERRAL_CODE' });
      }
      const inviter = await manager.getRepository(User).findOne({
        where: { id: code.inviterId, accountStatus: 'active' },
      });
      if (!inviter) throw new BadRequestException({ code: 'INVALID_REFERRAL_CODE' });
      const rawToken = opaqueSecret('rct_', 32);
      const expiresAt = new Date(now.getTime() + CLAIM_TOKEN_TTL_MS);
      const tokenRepo = manager.getRepository(ReferralClaimToken);
      await tokenRepo.save(
        tokenRepo.create({
          codeId: code.id,
          tokenHash: secretHash('referral-claim', rawToken),
          expiresAt,
          consumedAt: null,
          consumedByUserId: null,
        }),
      );
      const profile = await manager.getRepository(PlayerProfile).findOne({
        where: { userId: inviter.id },
      });
      return {
        bindingToken: rawToken,
        expiresAt: expiresAt.toISOString(),
        inviter: {
          publicId: inviter.publicId,
          displayName: inviter.displayName ?? '办公室同事',
          avatarKey: profile?.avatarKey ?? 'violet',
        },
      };
    });
  }

  /** 供可信 Worker/后台调用；不暴露给普通用户。 */
  async qualify(redemptionId: string): Promise<ReferralRedemption> {
    assertReferralActionsEnabled();
    assertCommunityWritesEnabled();
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ReferralRedemption);
      const redemption = await repo.findOne({
        where: { id: redemptionId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!redemption) {
        throw new BadRequestException({ code: 'REFERRAL_NOT_FOUND' });
      }
      if (redemption.status !== 'bound') return redemption;
      const users = await this.policy.lockActiveUsers(manager, [
        redemption.inviterId,
        redemption.inviteeId,
      ]);
      const now = this.clock.now();
      const invitee = users.get(redemption.inviteeId)!;
      if (
        invitee.socialVerificationStatus !== 'verified' ||
        redemption.riskStatus !== 'clear' ||
        now.getTime() - redemption.boundAt.getTime() < 72 * 60 * 60 * 1_000
      ) {
        throw new ForbiddenException({ code: 'REFERRAL_NOT_QUALIFIED' });
      }
      const activities = await manager.getRepository(CommunityCommandReceipt).find({
        where: { userId: invitee.id },
      });
      const activeDays = new Set(
        activities
          .filter((receipt) =>
            QUALIFYING_ACTIVITY_COMMAND_PREFIXES.some((prefix) =>
              receipt.commandType.startsWith(prefix),
            ),
          )
          .map((receipt) => toCommunityServiceDate(receipt.createdAt)),
      );
      if (activeDays.size < 2) {
        throw new ForbiddenException({ code: 'REFERRAL_NOT_QUALIFIED' });
      }

      const serviceDate = toCommunityServiceDate(now);
      const month = serviceMonth(serviceDate);
      const qualified = await repo.find({
        where: { inviterId: redemption.inviterId },
      });
      const dailyCount = qualified.filter(
        (entry) =>
          entry.qualifiedAt &&
          toCommunityServiceDate(entry.qualifiedAt) === serviceDate,
      ).length;
      const monthlyCount = qualified.filter(
        (entry) =>
          entry.qualifiedAt &&
          serviceMonth(toCommunityServiceDate(entry.qualifiedAt)) === month,
      ).length;
      if (
        dailyCount >= QUALIFIED_DAILY_LIMIT ||
        monthlyCount >= QUALIFIED_MONTHLY_LIMIT
      ) {
        throw new ConflictException({ code: 'REFERRAL_QUALIFICATION_CAP' });
      }
      const monthlyRewardCount = qualified.filter(
        (entry) =>
          entry.rewardGrantedAt &&
          serviceMonth(toCommunityServiceDate(entry.rewardGrantedAt)) === month,
      ).length;
      redemption.qualifiedAt = now;
      if (monthlyRewardCount < MONTHLY_REWARD_LIMIT) {
        await this.assets.grantReward(manager, {
          userId: redemption.inviterId,
          sourceType: 'referral',
          sourceId: redemption.id,
          ruleKey: 'inviter-invite-coin-v1',
          reward: { currencies: { invite_coin: INVITER_INVITE_COIN_REWARD } },
        });
        redemption.status = 'qualified';
        redemption.rewardGrantedAt = now;
      } else {
        redemption.status = 'qualified_unrewarded';
      }
      await repo.save(redemption);
      await this.referralQualifiedSideEffects(manager, redemption);
      return redemption;
    });
  }

  private async overviewWithManager(
    manager: EntityManager,
    user: User,
    rawCode: string | null,
  ) {
    const codes = await manager.getRepository(ReferralCode).find({
      where: { inviterId: user.id },
    });
    const codeIds = codes.map((code) => code.id);
    const tokens = codeIds.length
      ? await manager.getRepository(ReferralClaimToken).find({
          where: { codeId: In(codeIds) },
        })
      : [];
    const allRedemptions = await manager.getRepository(ReferralRedemption).find({
      where: { inviterId: user.id },
      order: { createdAt: 'DESC' },
    });
    const redemptions = allRedemptions.slice(0, 50);
    const entries = [];
    for (const redemption of redemptions) {
      const invitee = await manager.getRepository(User).findOne({
        where: { id: redemption.inviteeId },
      });
      entries.push({
        id: redemption.id,
        displayName: invitee?.displayName ?? null,
        status:
          redemption.status === 'qualified' ||
          redemption.status === 'qualified_unrewarded'
            ? ('qualified' as const)
            : redemption.status === 'rejected'
              ? ('invalid' as const)
              : invitee?.accountStatus === 'active'
                ? ('pending_qualification' as const)
                : ('registered' as const),
        createdAt: redemption.createdAt.toISOString(),
        qualifiedAt: redemption.qualifiedAt?.toISOString() ?? null,
      });
    }
    const now = this.clock.now();
    const today = toCommunityServiceDate(now);
    const month = serviceMonth(today);
    const qualified = allRedemptions.filter(
      (entry) =>
        entry.status === 'qualified' || entry.status === 'qualified_unrewarded',
    );
    const active = codes.find((code) => code.status === 'active');
    const invitationBalance = await manager.getRepository(WalletBalance).findOne({
      where: { userId: user.id, currency: 'invite_coin' },
    });
    const invitationCoins = Number(invitationBalance?.balance ?? 0);
    const siteOrigin = process.env.PUBLIC_SITE_ORIGIN?.replace(/\/$/, '') ?? null;
    return {
      enabled: communityWritesEnabled() && referralActionsEnabled(),
      invitationCoins,
      code: rawCode,
      shareUrl:
        rawCode && siteOrigin
          ? `${siteOrigin}/invite/accept?code=${encodeURIComponent(rawCode)}`
          : null,
      openedCount: tokens.length,
      registeredCount: allRedemptions.length,
      pendingQualificationCount: allRedemptions.filter(
        (entry) => entry.status === 'bound',
      ).length,
      qualifiedCount: qualified.length,
      invalidCount: allRedemptions.filter((entry) => entry.status === 'rejected').length,
      dailyQualifiedCount: qualified.filter(
        (entry) =>
          entry.qualifiedAt && toCommunityServiceDate(entry.qualifiedAt) === today,
      ).length,
      dailyQualifiedLimit: QUALIFIED_DAILY_LIMIT,
      monthlyQualifiedCount: qualified.filter(
        (entry) =>
          entry.qualifiedAt &&
          serviceMonth(toCommunityServiceDate(entry.qualifiedAt)) === month,
      ).length,
      monthlyQualifiedLimit: QUALIFIED_MONTHLY_LIMIT,
      monthlyRewardCount: qualified.filter(
        (entry) =>
          entry.rewardGrantedAt &&
          serviceMonth(toCommunityServiceDate(entry.rewardGrantedAt)) === month,
      ).length,
      monthlyRewardLimit: MONTHLY_REWARD_LIMIT,
      rewardDescription: active
        ? '达标后邀请人获得 1 枚邀请币；邀请币暂不可消费、交易或兑换。'
        : '邀请功能开发中；邀请币余额可查看，暂不可消费、交易或兑换。',
      entries,
    };
  }

  private async referralQualifiedSideEffects(
    manager: EntityManager,
    redemption: ReferralRedemption,
  ): Promise<void> {
    const rewarded = redemption.rewardGrantedAt !== null;
    for (const [userId, actorUserId] of [
      [redemption.inviterId, redemption.inviteeId],
      [redemption.inviteeId, redemption.inviterId],
    ] as const) {
      await this.notifications.create(manager, {
        userId,
        actorUserId,
        category: 'invite',
        eventType: 'referral.qualified',
        title: '邀请已达标',
        summary: rewarded
          ? '邀请奖励已发放给邀请人：1 枚邀请币'
          : '邀请已达标；本月奖励次数已达上限',
        resourceType: 'referral',
        resourceId: redemption.id,
        resourcePath: '/invite',
        dedupeKey: `referral-qualified:${redemption.id}:${userId}`,
      });
    }
  }

  private async replay(
    manager: EntityManager,
    userId: string,
    commandType: string,
    idempotencyKey: string,
    hash: string,
  ): Promise<Record<string, unknown> | null> {
    const receipt = await manager.getRepository(CommunityCommandReceipt).findOne({
      where: { userId, commandType, idempotencyKey },
      lock: { mode: 'pessimistic_write' },
    });
    if (!receipt) return null;
    if (receipt.requestHash !== hash) {
      throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED' });
    }
    return receipt.result;
  }

  private async record<T extends Record<string, unknown>>(
    manager: EntityManager,
    userId: string,
    commandType: string,
    idempotencyKey: string,
    hash: string,
    result: T,
  ): Promise<T> {
    const repo = manager.getRepository(CommunityCommandReceipt);
    await repo.save(
      repo.create({
        userId,
        commandType,
        idempotencyKey,
        requestHash: hash,
        result,
      }),
    );
    return result;
  }
}

export function referralActionsEnabled(): boolean {
  return process.env.FEATURE_REFERRALS_ENABLED === 'true';
}

function assertReferralActionsEnabled(): void {
  if (!referralActionsEnabled()) {
    throw new NotFoundException({ code: 'REFERRALS_NOT_OPEN' });
  }
}
