import { randomUUID } from 'node:crypto';

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { Brackets, DataSource, EntityManager, In, IsNull } from 'typeorm';

import { AccountAppeal } from '../../database/entities/account-appeal.entity';
import { AccountDeletionRequest } from '../../database/entities/account-deletion-request.entity';
import { AccountRestriction } from '../../database/entities/account-restriction.entity';
import { ActivityEvent } from '../../database/entities/activity-event.entity';
import { AdminAuditLog } from '../../database/entities/admin-audit-log.entity';
import { AuthRefreshToken } from '../../database/entities/auth-refresh-token.entity';
import { AuthSession } from '../../database/entities/auth-session.entity';
import { BetaAccessReservation } from '../../database/entities/beta-access-reservation.entity';
import {
  ChatMessage,
  ChatMessageMention,
  ChatMessageReport,
} from '../../database/entities/chat.entity';
import { CommunityCommandReceipt } from '../../database/entities/community-command-receipt.entity';
import { CommunityNotification } from '../../database/entities/community-notification.entity';
import { ConsentRecord } from '../../database/entities/consent-record.entity';
import { EmailVerification } from '../../database/entities/email-verification.entity';
import { FriendEncouragement } from '../../database/entities/friend-encouragement.entity';
import { FriendRequest } from '../../database/entities/friend-request.entity';
import { Friendship } from '../../database/entities/friendship.entity';
import { OutboxEvent } from '../../database/entities/outbox-event.entity';
import { PasswordResetToken } from '../../database/entities/password-reset-token.entity';
import { PlayerProfile } from '../../database/entities/player-profile.entity';
import { PostBookmark } from '../../database/entities/post-bookmark.entity';
import { PostFollow } from '../../database/entities/post-follow.entity';
import { PostUsefulReaction } from '../../database/entities/post-useful-reaction.entity';
import { ReferralClaimToken } from '../../database/entities/referral-claim-token.entity';
import { ReferralCode } from '../../database/entities/referral-code.entity';
import { SocialVerificationSession } from '../../database/entities/social-verification-session.entity';
import { User } from '../../database/entities/user.entity';
import { UserBlock } from '../../database/entities/user-block.entity';
import { hashAuthMetadata } from './auth-crypto';
import { AuthEmailOutboxService } from './auth-email-outbox.service';
import { AuthSensitiveDataService } from './auth-sensitive-data.service';
import { assertFeatureEnabled } from './auth-security-validation';
import { DUMMY_PASSWORD_HASH } from './password.util';

const COOLING_OFF_MS = 7 * 24 * 60 * 60_000;
const PUMP_INTERVAL_MS = 60_000;
const DELETION_LEASE_MS = 2 * 60_000;

export interface AccountAppealView {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  submittedAt: string;
  decidedAt: string | null;
  decisionReason: string | null;
}

export interface AccountStatusView {
  accountStatus: 'active' | 'suspended' | 'banned' | 'deleting';
  reasonCode: string | null;
  reason: string | null;
  restrictedAt: string | null;
  restrictionEndsAt: string | null;
  canAppeal: boolean;
  appeal: AccountAppealView | null;
}

export interface AccountDeletionView {
  status: 'none' | 'cooling_off' | 'scheduled' | 'processing' | 'cancelled';
  requestedAt: string | null;
  scheduledFor: string | null;
  canCancel: boolean;
}

@Injectable()
export class AccountLifecycleService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(AccountLifecycleService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly sensitive: AuthSensitiveDataService,
    private readonly emailOutbox: AuthEmailOutboxService,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.drain(), PUMP_INTERVAL_MS);
    this.timer.unref();
    void this.drain();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async getStatus(userId: string): Promise<AccountStatusView> {
    this.sensitive.assertAvailable();
    const user = await this.requireVisibleUser(userId);
    const restriction = await this.dataSource
      .getRepository(AccountRestriction)
      .findOne({
        where: { userId, liftedAt: IsNull() },
        order: { restrictedAt: 'DESC' },
      });
    const appeal = await this.latestAppeal(userId);
    return this.statusView(user, restriction, appeal);
  }

  async getDeletion(userId: string): Promise<AccountDeletionView> {
    assertFeatureEnabled('FEATURE_ACCOUNT_DELETION_ENABLED');
    await this.requireVisibleUser(userId);
    const deletion = await this.dataSource
      .getRepository(AccountDeletionRequest)
      .findOne({ where: { userId }, order: { createdAt: 'DESC' } });
    return this.deletionView(deletion, new Date());
  }

  async requestDeletion(
    userId: string,
    currentSessionId: string,
    idempotencyKey: string,
    now = new Date(),
  ): Promise<AccountDeletionView> {
    assertFeatureEnabled('FEATURE_ACCOUNT_DELETION_ENABLED');
    const keyHash = hashAuthMetadata('account-deletion-idempotency', idempotencyKey);
    const requestHash = hashAuthMetadata('account-deletion-request', 'DELETE:v1');
    try {
      return await this.dataSource.transaction(async (manager) => {
        // The account row serializes two different idempotency keys for the
        // same user. The unique key index below handles the cross-user race.
        const user = await manager.getRepository(User).findOne({
          where: { id: userId },
          lock: { mode: 'pessimistic_write' },
        });
        if (
          !user ||
          user.accountStatus === 'pending_email' ||
          user.accountStatus === 'deleted'
        ) {
          throw new ForbiddenException({ code: 'ACCOUNT_UNAVAILABLE' });
        }
        const repository = manager.getRepository(AccountDeletionRequest);
        const replay = await repository.findOne({
          where: { idempotencyKeyHash: keyHash },
          lock: { mode: 'pessimistic_write' },
        });
        if (replay) {
          if (replay.userId !== userId || replay.requestHash !== requestHash) {
            throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED' });
          }
          return this.deletionView(replay, now);
        }
        const live = await repository.findOne({
          where: {
            userId,
            status: In(['cooling_off', 'scheduled', 'processing']),
          },
          lock: { mode: 'pessimistic_write' },
        });
        if (live) return this.deletionView(live, now);
        if (user.accountStatus === 'deleting') {
          throw new ConflictException({ code: 'ACCOUNT_DELETION_STATE_INVALID' });
        }
        const currentSession = await manager.getRepository(AuthSession).findOne({
          where: { id: currentSessionId, userId, revokedAt: IsNull() },
          lock: { mode: 'pessimistic_write' },
        });
        if (!currentSession || currentSession.expiresAt.getTime() <= now.getTime()) {
          throw new ForbiddenException({ code: 'ACCOUNT_SESSION_REQUIRED' });
        }
        const previous = user.accountStatus as 'active' | 'suspended' | 'banned';
        const scheduledFor = new Date(now.getTime() + COOLING_OFF_MS);
        const row = await repository.save(
          repository.create({
            userId,
            previousAccountStatus: previous,
            status: 'cooling_off',
            idempotencyKeyHash: keyHash,
            requestHash,
            requestedAt: now,
            scheduledFor,
            availableAt: scheduledFor,
            attempts: 0,
            leaseOwner: null,
            leaseUntil: null,
            lastErrorCode: null,
            cancelledAt: null,
            completedAt: null,
          }),
        );
        user.accountStatus = 'deleting';
        await manager.getRepository(User).save(user);
        await this.revokeOtherSessions(manager, userId, currentSessionId, now);
        await this.audit(manager, {
          actorId: userId,
          actorRole: 'user',
          action: 'account.deletion.requested',
          targetId: row.id,
          requestId: keyHash,
          previousState: { accountStatus: previous },
          nextState: {
            accountStatus: 'deleting',
            scheduledFor: scheduledFor.toISOString(),
          },
        });
        return this.deletionView(row, now);
      });
    } catch (error) {
      if (!this.isUniqueViolation(error)) throw error;
      const replay = await this.dataSource
        .getRepository(AccountDeletionRequest)
        .findOne({ where: { idempotencyKeyHash: keyHash } });
      if (
        replay &&
        replay.userId === userId &&
        replay.requestHash === requestHash
      ) {
        return this.deletionView(replay, now);
      }
      throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED' });
    }
  }

  async cancelDeletion(
    userId: string,
    now = new Date(),
  ): Promise<AccountDeletionView> {
    assertFeatureEnabled('FEATURE_ACCOUNT_DELETION_ENABLED');
    return this.dataSource.transaction(async (manager) => {
      const user = await manager.getRepository(User).findOne({
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });
      const repository = manager.getRepository(AccountDeletionRequest);
      const row = await repository.findOne({
        where: {
          userId,
          status: In(['cooling_off', 'scheduled']),
        },
        order: { createdAt: 'DESC' },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !user ||
        user.accountStatus !== 'deleting' ||
        !row ||
        row.scheduledFor.getTime() <= now.getTime()
      ) {
        throw new ConflictException({ code: 'ACCOUNT_DELETION_NOT_CANCELLABLE' });
      }
      row.status = 'cancelled';
      row.cancelledAt = now;
      row.leaseOwner = null;
      row.leaseUntil = null;
      user.accountStatus = row.previousAccountStatus;
      await repository.save(row);
      await manager.getRepository(User).save(user);
      await this.audit(manager, {
        actorId: userId,
        actorRole: 'user',
        action: 'account.deletion.cancelled',
        targetId: row.id,
        requestId: null,
        previousState: { accountStatus: 'deleting' },
        nextState: { accountStatus: user.accountStatus },
      });
      return this.deletionView(row, now);
    });
  }

  async submitAppeal(
    userId: string,
    reason: string,
    now = new Date(),
  ): Promise<AccountAppealView> {
    this.sensitive.assertAvailable();
    const appealId = randomUUID();
    const encrypted = this.sensitive.encrypt('account-appeal-reason', appealId, reason);
    return this.dataSource.transaction(async (manager) => {
      const user = await manager.getRepository(User).findOne({
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !user ||
        (user.accountStatus !== 'suspended' && user.accountStatus !== 'banned')
      ) {
        throw new ForbiddenException({ code: 'ACCOUNT_APPEAL_NOT_ALLOWED' });
      }
      const repository = manager.getRepository(AccountAppeal);
      const pending = await repository.findOne({
        where: { userId, status: 'pending' },
        lock: { mode: 'pessimistic_write' },
      });
      if (pending) return this.appealView(pending);
      const appeal = await repository.save(
        repository.create({
          id: appealId,
          userId,
          status: 'pending',
          reasonKeyId: encrypted.keyId,
          reasonCiphertext: encrypted.ciphertext,
          reasonNonce: encrypted.nonce,
          reasonAuthTag: encrypted.authTag,
          decisionKeyId: null,
          decisionCiphertext: null,
          decisionNonce: null,
          decisionAuthTag: null,
          decidedByUserId: null,
          submittedAt: now,
          decidedAt: null,
        }),
      );
      await this.audit(manager, {
        actorId: userId,
        actorRole: 'user',
        action: 'account.appeal.submitted',
        targetId: appeal.id,
        requestId: null,
        previousState: { status: null },
        nextState: { status: 'pending' },
      });
      return this.appealView(appeal);
    });
  }

  async adminAppealDetail(
    actorId: string,
    appealId: string,
  ): Promise<AccountAppealView & { reason: string }> {
    await this.requireAdmin(actorId);
    const appeal = await this.dataSource
      .getRepository(AccountAppeal)
      .findOne({ where: { id: appealId } });
    if (!appeal) throw new NotFoundException({ code: 'ACCOUNT_APPEAL_NOT_FOUND' });
    return {
      ...this.appealView(appeal),
      reason: this.decryptAppealReason(appeal),
    };
  }

  async decideAppeal(
    actorId: string,
    appealId: string,
    decision: 'approved' | 'rejected',
    reason: string,
    now = new Date(),
  ): Promise<AccountAppealView> {
    this.sensitive.assertAvailable();
    const encrypted = this.sensitive.encrypt(
      'account-appeal-decision',
      appealId,
      reason,
    );
    return this.dataSource.transaction(async (manager) => {
      const actor = await manager.getRepository(User).findOne({
        where: { id: actorId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!actor || actor.accountStatus !== 'active' || actor.communityRole !== 'admin') {
        throw new ForbiddenException({ code: 'ADMIN_ACCESS_REQUIRED' });
      }
      const repository = manager.getRepository(AccountAppeal);
      const snapshot = await repository.findOne({ where: { id: appealId } });
      if (!snapshot) {
        throw new NotFoundException({ code: 'ACCOUNT_APPEAL_NOT_FOUND' });
      }
      const target = await manager.getRepository(User).findOne({
        where: { id: snapshot.userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!target || target.accountStatus === 'deleted') {
        throw new ConflictException({ code: 'ACCOUNT_APPEAL_TARGET_UNAVAILABLE' });
      }
      const appeal = await repository.findOne({
        where: { id: appealId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!appeal) throw new NotFoundException({ code: 'ACCOUNT_APPEAL_NOT_FOUND' });
      if (appeal.userId !== target.id) {
        throw new ConflictException({ code: 'ACCOUNT_APPEAL_TARGET_UNAVAILABLE' });
      }
      const desired = decision === 'approved' ? 'approved' : 'rejected';
      if (appeal.status !== 'pending') {
        if (appeal.status === desired) return this.appealView(appeal);
        throw new ConflictException({ code: 'ACCOUNT_APPEAL_ALREADY_DECIDED' });
      }
      const liveDeletion = await manager.getRepository(AccountDeletionRequest).findOne({
        where: {
          userId: appeal.userId,
          status: In(['cooling_off', 'scheduled', 'processing']),
        },
        lock: { mode: 'pessimistic_write' },
      });
      const previousStatus = target.accountStatus;
      appeal.status = desired;
      appeal.decisionKeyId = encrypted.keyId;
      appeal.decisionCiphertext = encrypted.ciphertext;
      appeal.decisionNonce = encrypted.nonce;
      appeal.decisionAuthTag = encrypted.authTag;
      appeal.decidedByUserId = actor.id;
      appeal.decidedAt = now;
      if (decision === 'approved') {
        await manager.getRepository(AccountRestriction).update(
          { userId: target.id, liftedAt: IsNull() },
          { liftedAt: now },
        );
        if (target.accountStatus === 'deleting') {
          if (!liveDeletion) {
            throw new ConflictException({ code: 'ACCOUNT_DELETION_STATE_INVALID' });
          }
          liveDeletion.previousAccountStatus = 'active';
          await manager.getRepository(AccountDeletionRequest).save(liveDeletion);
        } else {
          target.accountStatus = 'active';
          await manager.getRepository(User).save(target);
        }
      }
      await repository.save(appeal);
      await this.audit(manager, {
        actorId: actor.id,
        actorRole: 'admin',
        action: `account.appeal.${decision}`,
        targetId: appeal.id,
        requestId: null,
        previousState: { appealStatus: 'pending', accountStatus: previousStatus },
        nextState: { appealStatus: desired, accountStatus: target.accountStatus },
      });
      return this.appealView(appeal);
    });
  }

  async processDueDeletions(limit = 10, now = new Date()): Promise<number> {
    const rows = await this.dataSource
      .getRepository(AccountDeletionRequest)
      .createQueryBuilder('request')
      .select(['request.id'])
      .where('request.availableAt <= :now', { now })
      .andWhere('request.scheduledFor <= :now', { now })
      .andWhere(
        new Brackets((query) => {
          query
            .where('request.status IN (:...ready)', {
              ready: ['cooling_off', 'scheduled'],
            })
            .orWhere(
              'request.status = :processing AND request.leaseUntil <= :now',
              { processing: 'processing', now },
            );
        }),
      )
      .orderBy('request.availableAt', 'ASC')
      .limit(Math.max(1, Math.min(50, Math.floor(limit))))
      .getMany();
    let completed = 0;
    for (const row of rows) {
      if (await this.processOne(row.id, now)) completed += 1;
    }
    return completed;
  }

  private async processOne(id: string, now: Date): Promise<boolean> {
    const leaseOwner = randomUUID();
    const claimed = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(AccountDeletionRequest);
      const row = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !row ||
        row.scheduledFor.getTime() > now.getTime() ||
        (row.status !== 'cooling_off' &&
          row.status !== 'scheduled' &&
          !(
            row.status === 'processing' &&
            row.leaseUntil !== null &&
            row.leaseUntil.getTime() <= now.getTime()
          ))
      ) {
        return false;
      }
      row.status = 'processing';
      row.leaseOwner = leaseOwner;
      row.leaseUntil = new Date(now.getTime() + DELETION_LEASE_MS);
      await repository.save(row);
      return true;
    });
    if (!claimed) return false;
    try {
      await this.anonymize(id, leaseOwner, now);
      return true;
    } catch {
      await this.recordDeletionFailure(id, leaseOwner, now);
      return false;
    }
  }

  private async anonymize(
    id: string,
    leaseOwner: string,
    now: Date,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const deletionRepository = manager.getRepository(AccountDeletionRequest);
      const snapshot = await deletionRepository.findOne({ where: { id } });
      if (!snapshot) return;
      const userRepository = manager.getRepository(User);
      const user = await userRepository.findOne({
        where: { id: snapshot.userId },
        lock: { mode: 'pessimistic_write' },
      });
      const row = await deletionRepository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row || row.status !== 'processing' || row.leaseOwner !== leaseOwner) {
        return;
      }
      if (row.userId !== snapshot.userId) return;
      if (!user) {
        row.status = 'completed';
        row.completedAt = now;
        row.leaseOwner = null;
        row.leaseUntil = null;
        await deletionRepository.save(row);
        return;
      }
      if (user.accountStatus !== 'deleting' && user.accountStatus !== 'deleted') {
        throw new Error('account deletion state changed');
      }
      if (user.accountStatus !== 'deleted') {
        const oldEmail = user.email;
        const anonymousEmail = `deleted+${user.publicId}@invalid.local`;
        await this.emailOutbox.purgeRecipient(manager, oldEmail);
        await manager.getRepository(PasswordResetToken).delete({ userId: user.id });
        await manager.getRepository(SocialVerificationSession).delete({ userId: user.id });
        await manager.getRepository(AccountAppeal).delete({ userId: user.id });
        await manager.getRepository(AccountRestriction).delete({ userId: user.id });
        await manager.getRepository(EmailVerification).delete({ userId: user.id });
        await manager.getRepository(AuthSession).delete({ userId: user.id });
        await manager
          .getRepository(FriendRequest)
          .createQueryBuilder()
          .delete()
          .where('requester_id = :userId OR recipient_id = :userId', {
            userId: user.id,
          })
          .execute();
        await manager
          .getRepository(Friendship)
          .createQueryBuilder()
          .delete()
          .where('user_low_id = :userId OR user_high_id = :userId', {
            userId: user.id,
          })
          .execute();
        await manager
          .getRepository(UserBlock)
          .createQueryBuilder()
          .delete()
          .where('blocker_id = :userId OR blocked_id = :userId', {
            userId: user.id,
          })
          .execute();
        await manager
          .getRepository(FriendEncouragement)
          .createQueryBuilder()
          .delete()
          .where('sender_id = :userId OR recipient_id = :userId', {
            userId: user.id,
          })
          .execute();
        await manager
          .getRepository(CommunityNotification)
          .createQueryBuilder()
          .delete()
          .where('user_id = :userId OR actor_user_id = :userId', {
            userId: user.id,
          })
          .execute();
        await manager.getRepository(ActivityEvent).delete({ userId: user.id });
        await manager.getRepository(OutboxEvent).delete({ userId: user.id });
        await manager
          .getRepository(CommunityCommandReceipt)
          .delete({ userId: user.id });
        await manager.getRepository(PostBookmark).delete({ userId: user.id });
        await manager.getRepository(PostFollow).delete({ userId: user.id });
        await manager
          .getRepository(PostUsefulReaction)
          .delete({ userId: user.id });
        await manager
          .getRepository(ChatMessageMention)
          .delete({ mentionedUserId: user.id });
        await manager
          .getRepository(ChatMessageReport)
          .delete({ reporterId: user.id });
        await manager
          .getRepository(ChatMessage)
          .createQueryBuilder()
          .update()
          .set({
            status: 'withdrawn',
            withdrawnAt: now,
            version: () => '"version" + 1',
          })
          .where('author_id = :userId AND status = :status', {
            userId: user.id,
            status: 'visible',
          })
          .execute();
        await manager.getRepository(ConsentRecord).update(
          { userId: user.id },
          { ipHash: null },
        );
        await manager.getRepository(BetaAccessReservation).update(
          { userId: user.id },
          { emailNormalized: anonymousEmail },
        );
        await manager
          .getRepository(ReferralClaimToken)
          .delete({ consumedByUserId: user.id });
        const ownedReferralCodes = await manager.getRepository(ReferralCode).find({
          where: { inviterId: user.id },
        });
        if (ownedReferralCodes.length > 0) {
          await manager.getRepository(ReferralClaimToken).delete({
            codeId: In(ownedReferralCodes.map((code) => code.id)),
          });
          for (const code of ownedReferralCodes) {
            if (code.status === 'active') code.status = 'revoked';
          }
          await manager.getRepository(ReferralCode).save(ownedReferralCodes);
        }
        const profile = await manager.getRepository(PlayerProfile).findOne({
          where: { userId: user.id },
          lock: { mode: 'pessimistic_write' },
        });
        if (profile) {
          profile.nickname = null;
          profile.avatarKey = null;
          profile.bio = null;
          profile.battleProfession = null;
          profile.title = '已注销用户';
          profile.privacySettings = {
            equipment: 'self',
            battleRecord: 'self',
            plant: 'self',
            honors: 'self',
            friendCount: 'self',
            recentActivity: 'self',
          };
          await manager.getRepository(PlayerProfile).save(profile);
        }
        user.email = anonymousEmail;
        user.emailNormalized = anonymousEmail;
        user.passwordHash = DUMMY_PASSWORD_HASH;
        user.displayName = null;
        user.accountStatus = 'deleted';
        user.socialVerificationStatus = 'unverified';
        user.communityRole = 'user';
        user.emailVerifiedAt = null;
        user.passwordChangedAt = now;
        user.onboardingCompleted = false;
        await userRepository.save(user);
      }
      row.status = 'completed';
      row.completedAt = now;
      row.leaseOwner = null;
      row.leaseUntil = null;
      row.lastErrorCode = null;
      await deletionRepository.save(row);
      await this.audit(manager, {
        actorId: null,
        actorRole: 'system',
        action: 'account.deletion.completed',
        targetId: row.id,
        requestId: null,
        previousState: { accountStatus: 'deleting' },
        nextState: { accountStatus: 'deleted' },
      });
    });
  }

  private async recordDeletionFailure(
    id: string,
    leaseOwner: string,
    now: Date,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(AccountDeletionRequest);
      const row = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row || row.status !== 'processing' || row.leaseOwner !== leaseOwner) return;
      row.status = 'scheduled';
      row.attempts = Math.min(1_000_000, row.attempts + 1);
      row.availableAt = new Date(
        now.getTime() + Math.min(6 * 60 * 60_000, 60_000 * 2 ** Math.min(8, row.attempts)),
      );
      row.leaseOwner = null;
      row.leaseUntil = null;
      row.lastErrorCode = 'ACCOUNT_DELETION_RETRY_REQUIRED';
      await repository.save(row);
    });
  }

  private async revokeOtherSessions(
    manager: EntityManager,
    userId: string,
    currentSessionId: string,
    now: Date,
  ): Promise<void> {
    const sessions = await manager.getRepository(AuthSession).find({
      where: { userId, revokedAt: IsNull() },
    });
    for (const session of sessions) {
      if (session.id === currentSessionId) continue;
      session.revokedAt = now;
      session.revokeReason = 'account_deletion_requested';
    }
    const changed = sessions.filter(
      (session) => session.id !== currentSessionId && session.revokedAt !== null,
    );
    if (changed.length > 0) {
      await manager.getRepository(AuthSession).save(changed);
      await manager.getRepository(AuthRefreshToken).update(
        { sessionId: In(changed.map((session) => session.id)), status: 'active' },
        { status: 'revoked', revokedAt: now },
      );
    }
  }

  private async requireVisibleUser(userId: string): Promise<User> {
    const user = await this.dataSource.getRepository(User).findOne({ where: { id: userId } });
    if (
      !user ||
      user.accountStatus === 'pending_email' ||
      user.accountStatus === 'deleted'
    ) {
      throw new ForbiddenException({ code: 'ACCOUNT_UNAVAILABLE' });
    }
    return user;
  }

  private async requireAdmin(userId: string): Promise<User> {
    const user = await this.dataSource.getRepository(User).findOne({
      where: { id: userId, accountStatus: 'active', communityRole: 'admin' },
    });
    if (!user) throw new ForbiddenException({ code: 'ADMIN_ACCESS_REQUIRED' });
    return user;
  }

  private async latestAppeal(userId: string): Promise<AccountAppeal | null> {
    return this.dataSource.getRepository(AccountAppeal).findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  private statusView(
    user: User,
    restriction: AccountRestriction | null,
    appeal: AccountAppeal | null,
  ): AccountStatusView {
    const status = user.accountStatus as AccountStatusView['accountStatus'];
    return {
      accountStatus: status,
      reasonCode: restriction?.reasonCode ?? null,
      reason: restriction ? this.decryptRestrictionReason(restriction) : null,
      restrictedAt: restriction?.restrictedAt.toISOString() ?? null,
      restrictionEndsAt: restriction?.restrictionEndsAt?.toISOString() ?? null,
      canAppeal:
        (status === 'suspended' || status === 'banned') &&
        appeal?.status !== 'pending',
      appeal: appeal ? this.appealView(appeal) : null,
    };
  }

  private deletionView(
    row: AccountDeletionRequest | null,
    now: Date,
  ): AccountDeletionView {
    if (!row || row.status === 'completed') {
      return {
        status: 'none',
        requestedAt: null,
        scheduledFor: null,
        canCancel: false,
      };
    }
    return {
      status: row.status,
      requestedAt: row.requestedAt.toISOString(),
      scheduledFor: row.scheduledFor.toISOString(),
      canCancel:
        (row.status === 'cooling_off' || row.status === 'scheduled') &&
        row.scheduledFor.getTime() > now.getTime(),
    };
  }

  private appealView(row: AccountAppeal): AccountAppealView {
    return {
      id: row.id,
      status: row.status,
      submittedAt: row.submittedAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
      decisionReason:
        row.decisionCiphertext &&
        row.decisionKeyId &&
        row.decisionNonce &&
        row.decisionAuthTag
          ? this.sensitive.decrypt('account-appeal-decision', row.id, {
              keyId: row.decisionKeyId,
              ciphertext: row.decisionCiphertext,
              nonce: row.decisionNonce,
              authTag: row.decisionAuthTag,
            })
          : null,
    };
  }

  private decryptAppealReason(row: AccountAppeal): string {
    return this.sensitive.decrypt('account-appeal-reason', row.id, {
      keyId: row.reasonKeyId,
      ciphertext: row.reasonCiphertext,
      nonce: row.reasonNonce,
      authTag: row.reasonAuthTag,
    });
  }

  private decryptRestrictionReason(row: AccountRestriction): string | null {
    if (
      !row.reasonKeyId ||
      !row.reasonCiphertext ||
      !row.reasonNonce ||
      !row.reasonAuthTag
    ) {
      return null;
    }
    return this.sensitive.decrypt('account-restriction-reason', row.id, {
      keyId: row.reasonKeyId,
      ciphertext: row.reasonCiphertext,
      nonce: row.reasonNonce,
      authTag: row.reasonAuthTag,
    });
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === '23505'
    );
  }

  private audit(
    manager: EntityManager,
    input: {
      actorId: string | null;
      actorRole: 'system' | 'user' | 'admin';
      action: string;
      targetId: string;
      requestId: string | null;
      previousState: Record<string, unknown>;
      nextState: Record<string, unknown>;
    },
  ): Promise<AdminAuditLog> {
    const repository = manager.getRepository(AdminAuditLog);
    return repository.save(
      repository.create({
        actorId: input.actorId,
        actorRole: input.actorRole,
        action: input.action,
        targetType: 'account',
        targetId: input.targetId,
        reason: null,
        requestId: input.requestId,
        previousState: input.previousState,
        nextState: input.nextState,
      }),
    );
  }

  private async drain(): Promise<void> {
    if (this.running || process.env.FEATURE_ACCOUNT_DELETION_ENABLED !== 'true') return;
    this.running = true;
    try {
      await this.processDueDeletions();
    } catch {
      this.logger.error('Account deletion compensation failed');
    } finally {
      this.running = false;
    }
  }
}
