import { randomUUID } from 'node:crypto';

import { JwtService } from '@nestjs/jwt';
import type { DataSource } from 'typeorm';

import { CommunityCommandReceipt } from '../../database/entities/community-command-receipt.entity';
import { BetaAccessCode } from '../../database/entities/beta-access-code.entity';
import { EmailVerification } from '../../database/entities/email-verification.entity';
import { OutboxEvent } from '../../database/entities/outbox-event.entity';
import { PlayerProfile } from '../../database/entities/player-profile.entity';
import { ReferralClaimToken } from '../../database/entities/referral-claim-token.entity';
import { ReferralCode } from '../../database/entities/referral-code.entity';
import { ReferralRedemption } from '../../database/entities/referral-redemption.entity';
import { RewardGrant } from '../../database/entities/reward-grant.entity';
import { User } from '../../database/entities/user.entity';
import { WalletBalance } from '../../database/entities/wallet-balance.entity';
import { createLocalDevDataSource } from '../../database/local-dev-datasource';
import { AuthService, RegisterInput } from '../auth/auth.service';
import { AuthEmailOutboxService } from '../auth/auth-email-outbox.service';
import { AuthRateLimitService } from '../auth/auth-rate-limit.service';
import {
  BetaAccessService,
  LOCAL_DEV_BETA_ACCESS_CODE,
} from '../auth/beta-access.service';
import { EmailDeliveryService } from '../auth/email-delivery.service';
import { CommunityCapacityService } from '../auth/community-capacity.service';
import { PlatformAssetsService } from '../platform';
import type { CommunityClock } from './community-clock';
import { NotificationService } from './notification.service';
import { ReferralService } from './referral.service';
import { RelationshipPolicyService } from './relationship-policy.service';

const PASSWORD = 'Strong-Office#2026';
const JWT_SECRET = 'test-jwt-secret-with-at-least-32-characters';
const TOKEN_PEPPER = 'test-auth-token-pepper-with-32-plus-characters';

describe('ReferralService attribution and reward caps', () => {
  let dataSource: DataSource;
  let referrals: ReferralService;
  let auth: AuthService;
  let now: Date;
  const clock: CommunityClock = { now: () => new Date(now) };
  const originalEnv = { ...process.env };

  beforeAll(() => {
    process.env.LOCAL_DEV = 'true';
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.AUTH_TOKEN_PEPPER = TOKEN_PEPPER;
    process.env.PUBLIC_SITE_ORIGIN = 'http://127.0.0.1:4173';
    process.env.FEATURE_REFERRALS_ENABLED = 'true';
    delete process.env.FEATURE_COMMUNITY_WRITES_ENABLED;
    delete process.env.FEATURE_REGISTRATION_ENABLED;
  });

  beforeEach(async () => {
    now = new Date();
    dataSource = await createLocalDevDataSource();
    const policy = new RelationshipPolicyService();
    const notifications = new NotificationService(dataSource);
    referrals = new ReferralService(
      dataSource,
      policy,
      new PlatformAssetsService(clock),
      notifications,
      clock,
    );
    const emailDelivery = new EmailDeliveryService();
    auth = new AuthService(
      dataSource,
      new JwtService({ secret: JWT_SECRET }),
      new BetaAccessService(),
      new AuthEmailOutboxService(dataSource, emailDelivery),
      new AuthRateLimitService(dataSource),
      new CommunityCapacityService(),
    );
  });

  afterEach(async () => dataSource.destroy());

  afterAll(() => {
    process.env = originalEnv;
  });

  it('keeps a short-lived opened attribution stable across code rotation', async () => {
    const inviter = await activeUser('inviter@example.com', 'Inviter');
    const first = (await referrals.createOrRotate(
      inviter.id,
      'referral-first-code-key',
    )) as { code: string; shareUrl: string };
    expect(first.code).toMatch(/^ref_/);
    expect(first.shareUrl).toContain(encodeURIComponent(first.code));
    expect(new URL(first.shareUrl).pathname).toBe('/invite/accept');

    const firstCode = await dataSource.getRepository(ReferralCode).findOneByOrFail({
      inviterId: inviter.id,
      status: 'active',
    });
    expect(firstCode.purpose).toBe('user_referral');
    expect(firstCode.codeHash).not.toContain(first.code);
    const preview = await referrals.preview(first.code);

    // 分享页已经换得绑定令牌后，即使邀请人轮换展示码，归因也不能漂移或丢失。
    await referrals.createOrRotate(inviter.id, 'referral-rotated-code-key');
    const pending = await auth.register(
      registration('invitee@example.com', preview.bindingToken),
    );
    const invitee = await dataSource.getRepository(User).findOneByOrFail({
      emailNormalized: 'invitee@example.com',
    });
    const redemption = await dataSource
      .getRepository(ReferralRedemption)
      .findOneByOrFail({ inviteeId: invitee.id });
    expect(redemption.inviterId).toBe(inviter.id);
    expect(redemption.codeId).toBe(firstCode.id);
    expect(redemption.status).toBe('bound');
    expect(redemption.riskStatus).toBe('pending');
    const token = await dataSource
      .getRepository(ReferralClaimToken)
      .findOneByOrFail({ consumedByUserId: invitee.id });
    expect(token.consumedAt).toBeInstanceOf(Date);
    expect(pending.accountStatus).toBe('pending_email');

    const beta = await dataSource.getRepository(BetaAccessCode).findOneByOrFail({
      purpose: 'beta_registration',
    });
    expect(beta.id).not.toBe(firstCode.id);
    expect(beta.codeHash).not.toBe(firstCode.codeHash);
  });

  it('releases and safely rebinds referral state for an expired pending registration', async () => {
    const inviter = await activeUser('restart-inviter@example.com', 'Inviter');
    const invitation = (await referrals.createOrRotate(
      inviter.id,
      'restart-referral-code-key',
    )) as { code: string };
    const preview = await referrals.preview(invitation.code);
    const first = await auth.register(
      registration('restart-invitee@example.com', preview.bindingToken),
    );
    const users = dataSource.getRepository(User);
    const oldInvitee = await users.findOneByOrFail({
      emailNormalized: 'restart-invitee@example.com',
    });
    const verifications = dataSource.getRepository(EmailVerification);
    const expired = await verifications.findOneByOrFail({ id: first.registrationId });
    expired.expiresAt = new Date(Date.now() - 1_000);
    await verifications.save(expired);

    const restarted = await auth.register(
      registration('restart-invitee@example.com', preview.bindingToken),
    );
    const newInvitee = await users.findOneByOrFail({
      emailNormalized: 'restart-invitee@example.com',
    });
    expect(restarted.registrationId).not.toBe(first.registrationId);
    expect(newInvitee.id).not.toBe(oldInvitee.id);
    expect(await users.exist({ where: { id: oldInvitee.id } })).toBe(false);
    await expect(
      dataSource.getRepository(ReferralRedemption).findOneByOrFail({
        inviteeId: newInvitee.id,
      }),
    ).resolves.toMatchObject({ inviterId: inviter.id, status: 'bound' });
    await expect(
      dataSource.getRepository(ReferralClaimToken).findOneByOrFail({
        consumedByUserId: newInvitee.id,
      }),
    ).resolves.toMatchObject({ consumedAt: expect.any(Date) });
  });

  it('caps non-cash referral rewards at five per month without losing qualification', async () => {
    now = new Date('2026-08-10T08:00:00.000Z');
    const inviter = await activeUser('cap-inviter@example.com', 'Cap inviter');
    await referrals.createOrRotate(inviter.id, 'referral-cap-code-key');
    const code = await dataSource.getRepository(ReferralCode).findOneByOrFail({
      inviterId: inviter.id,
      status: 'active',
    });

    const redemptions: ReferralRedemption[] = [];
    for (let index = 0; index < 6; index += 1) {
      const invitee = await activeUser(
        `qualified-${index}@example.com`,
        `Qualified ${index}`,
        'verified',
      );
      await addActivityDay(invitee.id, `2026-08-0${index + 1}`, index * 2);
      await addActivityDay(invitee.id, `2026-08-0${index + 2}`, index * 2 + 1);
      redemptions.push(
        await dataSource.getRepository(ReferralRedemption).save(
          dataSource.getRepository(ReferralRedemption).create({
            inviterId: inviter.id,
            inviteeId: invitee.id,
            codeId: code.id,
            status: 'bound',
            riskStatus: 'clear',
            boundAt: new Date('2026-08-01T00:00:00.000Z'),
            qualifiedAt: null,
            rewardGrantedAt: null,
            rejectionReason: null,
          }),
        ),
      );
    }

    for (let index = 0; index < redemptions.length; index += 1) {
      now = new Date(`2026-08-${String(10 + index).padStart(2, '0')}T08:00:00.000Z`);
      const result = await referrals.qualify(redemptions[index].id);
      expect(result.status).toBe(index < 5 ? 'qualified' : 'qualified_unrewarded');
    }

    expect(await dataSource.getRepository(RewardGrant).count()).toBe(5);
    const inviterWallet = await dataSource.getRepository(WalletBalance).findOneByOrFail({
      userId: inviter.id,
      currency: 'invite_coin',
    });
    expect(Number(inviterWallet.balance)).toBe(5);
    const sixthWallet = await dataSource.getRepository(WalletBalance).findOne({
      where: {
        userId: redemptions[5].inviteeId,
        currency: 'invite_coin',
      },
    });
    expect(Number(sixthWallet?.balance ?? 0)).toBe(0);

    const overview = await referrals.overview(inviter.id);
    expect(overview.qualifiedCount).toBe(6);
    expect(overview.monthlyQualifiedCount).toBe(6);
    expect(overview.monthlyRewardCount).toBe(5);
    expect(overview.dailyQualifiedCount).toBe(1);
    expect(overview.invitationCoins).toBe(5);
    expect(overview.rewardDescription).toContain('邀请币');
    expect(await dataSource.getRepository(OutboxEvent).count()).toBe(0);
  });

  function registration(email: string, referralToken: string): RegisterInput {
    return {
      email,
      password: PASSWORD,
      displayName: '受邀同事',
      betaAccessCode: LOCAL_DEV_BETA_ACCESS_CODE,
      referralToken,
      consents: {
        termsVersion: '2026-08-22',
        privacyVersion: '2026-08-22',
        communityGuidelinesVersion: '2026-08-22',
        adultDeclarationVersion: '2026-08-22',
      },
    };
  }

  async function activeUser(
    email: string,
    displayName: string,
    socialVerificationStatus: 'unverified' | 'verified' = 'unverified',
  ): Promise<User> {
    const user = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        email,
        emailNormalized: email,
        passwordHash: 'unused-test-hash',
        displayName,
        publicId: randomUUID(),
        accountStatus: 'active',
        socialVerificationStatus,
        emailVerifiedAt: now,
        passwordChangedAt: now,
        onboardingCompleted: true,
      }),
    );
    await dataSource.getRepository(PlayerProfile).save(
      dataSource.getRepository(PlayerProfile).create({
        userId: user.id,
        nickname: displayName,
        avatarKey: 'violet',
        bio: null,
        battleProfession: 'developer',
        privacySettings: {
          equipment: 'friends',
          battleRecord: 'friends',
          plant: 'friends',
          honors: 'friends',
          friendCount: 'self',
          recentActivity: 'self',
        },
        title: '初入工位',
      }),
    );
    return user;
  }

  async function addActivityDay(
    userId: string,
    localDate: string,
    sequence: number,
  ): Promise<void> {
    await dataSource.getRepository(CommunityCommandReceipt).save(
      dataSource.getRepository(CommunityCommandReceipt).create({
        userId,
        commandType: 'farm.care',
        idempotencyKey: `active-day-${sequence}-${randomUUID()}`,
        requestHash: String(sequence).padStart(64, '0'),
        result: { acknowledged: true },
        createdAt: new Date(`${localDate}T08:00:00.000Z`),
      }),
    );
  }
});
