import { PATH_METADATA } from '@nestjs/common/constants';

import type { AccountLifecycleService } from './account-lifecycle.service';
import {
  AccountAppealAdminController,
  AccountLifecycleController,
  AccountSecurityPublicController,
  SocialVerificationController,
} from './account-security.controller';
import type { PasswordResetService } from './password-reset.service';
import type { SocialVerificationService } from './social-verification.service';

describe('Account security controller contracts', () => {
  const passwordReset = {
    request: jest.fn().mockResolvedValue(undefined),
    reset: jest.fn().mockResolvedValue(undefined),
  };
  const socialVerification = {
    get: jest.fn().mockResolvedValue({ status: 'not_started' }),
    create: jest.fn().mockResolvedValue({
      sessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      launchUrl: 'https://verification.example.test/start',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }),
    callback: jest.fn().mockResolvedValue({ accepted: true, status: 'verified' }),
  };
  const lifecycle = {
    getStatus: jest.fn(),
    getDeletion: jest.fn(),
    requestDeletion: jest.fn().mockResolvedValue({ status: 'cooling_off' }),
    cancelDeletion: jest.fn(),
    submitAppeal: jest.fn(),
    adminAppealDetail: jest.fn(),
    decideAppeal: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('publishes only the frozen v1 controller roots', () => {
    expect(Reflect.getMetadata(PATH_METADATA, AccountSecurityPublicController)).toBe(
      'v1/auth',
    );
    expect(Reflect.getMetadata(PATH_METADATA, SocialVerificationController)).toBe(
      'v1/me',
    );
    expect(Reflect.getMetadata(PATH_METADATA, AccountLifecycleController)).toBe(
      'v1/me',
    );
    expect(Reflect.getMetadata(PATH_METADATA, AccountAppealAdminController)).toBe(
      'v1/admin/account-appeals',
    );
  });

  it('keeps password-reset requests response-free and forwards normalized metadata', async () => {
    const controller = new AccountSecurityPublicController(
      passwordReset as unknown as PasswordResetService,
      socialVerification as unknown as SocialVerificationService,
    );
    await expect(
      controller.requestPasswordReset(
        { email: ' Person@Example.com ' },
        '203.0.113.8',
        'jest-agent',
      ),
    ).resolves.toBeUndefined();
    expect(passwordReset.request).toHaveBeenCalledWith('person@example.com', {
      ipAddress: '203.0.113.8',
      userAgent: 'jest-agent',
    });
  });

  it('requires the fixed return path and rejects identity fields from the browser', async () => {
    const controller = new SocialVerificationController(
      socialVerification as unknown as SocialVerificationService,
    );
    await expect(
      controller.create(
        'user-id',
        { returnPath: '/settings/verification' },
        '127.0.0.1',
        'jest',
      ),
    ).resolves.toMatchObject({ launchUrl: expect.stringMatching(/^https:\/\//) });
    expect(socialVerification.create).toHaveBeenCalledWith('user-id', {
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
    });
    expect(() =>
      controller.create('user-id', {
        returnPath: '/settings/verification',
        fullName: 'Must never enter this API',
      }),
    ).toThrow();
  });

  it('requires Nest rawBody before accepting a signed provider callback', async () => {
    const controller = new AccountSecurityPublicController(
      passwordReset as unknown as PasswordResetService,
      socialVerification as unknown as SocialVerificationService,
    );
    const body = {
      sessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      providerReference: 'provider-reference',
      status: 'verified',
      occurredAt: new Date().toISOString(),
    };
    expect(() =>
      controller.callback(
        body,
        {},
        '1234567890',
        'nonce-value-with-16-chars',
        'event-123',
        'a'.repeat(64),
      ),
    ).toThrow();
    const rawBody = Buffer.from(JSON.stringify(body));
    await controller.callback(
      body,
      { rawBody },
      '1234567890',
      'nonce-value-with-16-chars',
      'event-123',
      'a'.repeat(64),
      '203.0.113.9',
      'provider-agent',
    );
    expect(socialVerification.callback).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'verified' }),
      expect.objectContaining({ eventId: 'event-123' }),
      rawBody,
      { ipAddress: '203.0.113.9', userAgent: 'provider-agent' },
    );
  });

  it('requires DELETE confirmation and an idempotency key for account deletion', async () => {
    const controller = new AccountLifecycleController(
      lifecycle as unknown as AccountLifecycleService,
    );
    await expect(
      controller.requestDeletion(
        'user-id',
        'session-id',
        { confirmation: 'DELETE' },
        'account-delete-key',
      ),
    ).resolves.toMatchObject({ status: 'cooling_off' });
    expect(lifecycle.requestDeletion).toHaveBeenCalledWith(
      'user-id',
      'session-id',
      'account-delete-key',
    );
    expect(() =>
      controller.requestDeletion(
        'user-id',
        'session-id',
        { confirmation: 'delete' },
        'account-delete-key',
      ),
    ).toThrow();
  });
});
