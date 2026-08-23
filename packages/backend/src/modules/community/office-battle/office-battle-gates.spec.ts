import {
  ForbiddenException,
  ServiceUnavailableException,
  type ExecutionContext,
} from '@nestjs/common';
import type { DataSource } from 'typeorm';

import {
  officeBattleEnabled,
  OfficeBattleFeatureGuard,
  OfficeBattleVerifiedGuard,
} from './office-battle-gates';

describe('Office Battle feature gate', () => {
  const originalLocal = process.env.LOCAL_DEV;
  const originalFeature = process.env.FEATURE_COMMUNITY_BATTLE_ENABLED;
  const originalVerification = process.env.FEATURE_SOCIAL_VERIFICATION_ENABLED;

  afterEach(() => {
    restore('LOCAL_DEV', originalLocal);
    restore('FEATURE_COMMUNITY_BATTLE_ENABLED', originalFeature);
    restore('FEATURE_SOCIAL_VERIFICATION_ENABLED', originalVerification);
  });

  it('defaults on only in LOCAL_DEV and fails closed in production', () => {
    delete process.env.FEATURE_COMMUNITY_BATTLE_ENABLED;
    process.env.LOCAL_DEV = 'true';
    expect(officeBattleEnabled()).toBe(true);
    process.env.LOCAL_DEV = 'false';
    expect(officeBattleEnabled()).toBe(false);
    expect(() => new OfficeBattleFeatureGuard().canActivate()).toThrow(
      ServiceUnavailableException,
    );
  });

  it('honors explicit true/false without truthy coercion', () => {
    process.env.LOCAL_DEV = 'true';
    process.env.FEATURE_COMMUNITY_BATTLE_ENABLED = 'false';
    expect(officeBattleEnabled()).toBe(false);
    process.env.FEATURE_COMMUNITY_BATTLE_ENABLED = 'true';
    expect(officeBattleEnabled()).toBe(true);
  });

  it('allows active username accounts when social verification is disabled', async () => {
    process.env.FEATURE_SOCIAL_VERIFICATION_ENABLED = 'false';
    const guard = new OfficeBattleVerifiedGuard(dataSourceFor('unverified'));
    await expect(guard.canActivate(contextFor('user-1'))).resolves.toBe(true);
  });

  it('still enforces social verification when that feature is enabled', async () => {
    process.env.FEATURE_SOCIAL_VERIFICATION_ENABLED = 'true';
    const guard = new OfficeBattleVerifiedGuard(dataSourceFor('unverified'));
    await expect(guard.canActivate(contextFor('user-1'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

function dataSourceFor(status: 'unverified' | 'verified'): DataSource {
  return {
    getRepository: () => ({
      findOne: jest.fn().mockResolvedValue({
        id: 'user-1',
        accountStatus: 'active',
        socialVerificationStatus: status,
      }),
    }),
  } as unknown as DataSource;
}

function contextFor(userId: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user: { id: userId } }),
    }),
  } as unknown as ExecutionContext;
}

function restore(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
