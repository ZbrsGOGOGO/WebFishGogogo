import { ServiceUnavailableException } from '@nestjs/common';

import { officeBattleEnabled, OfficeBattleFeatureGuard } from './office-battle-gates';

describe('Office Battle feature gate', () => {
  const originalLocal = process.env.LOCAL_DEV;
  const originalFeature = process.env.FEATURE_COMMUNITY_BATTLE_ENABLED;

  afterEach(() => {
    restore('LOCAL_DEV', originalLocal);
    restore('FEATURE_COMMUNITY_BATTLE_ENABLED', originalFeature);
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
});

function restore(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
