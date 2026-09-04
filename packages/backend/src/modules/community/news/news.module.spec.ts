import { MODULE_METADATA } from '@nestjs/common/constants';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import type { DynamicModule, Provider } from '@nestjs/common';

import { PlayerProfile } from '../../../database/entities';
import { NewsModule } from './news.module';

describe('NewsModule entity boundary', () => {
  it('registers the shared player profile without the retired battle profile', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, NewsModule) as Array<
      DynamicModule | unknown
    >;
    const feature = imports.find(
      (entry): entry is DynamicModule =>
        typeof entry === 'object' &&
        entry !== null &&
        'module' in entry &&
        entry.module === TypeOrmModule,
    );

    expect(feature).toBeDefined();
    const providerTokens = (feature?.providers ?? []).map((provider: Provider) =>
      typeof provider === 'object' && provider !== null && 'provide' in provider
        ? provider.provide
        : provider,
    );
    expect(providerTokens).toContain(getRepositoryToken(PlayerProfile));
    expect(providerTokens).not.toContain('OfficeBattleProfileRepository');
  });
});
