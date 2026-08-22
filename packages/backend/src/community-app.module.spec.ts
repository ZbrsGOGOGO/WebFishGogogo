import 'reflect-metadata';

import { MODULE_METADATA } from '@nestjs/common/constants';

import { CommunityAppModule } from './community-app.module';
import { CommunityHealthController } from './community-health.controller';
import { AuthController, CurrentAccountController } from './modules/auth/auth.controller';
import {
  AccountAppealAdminController,
  AccountLifecycleController,
  AccountSecurityPublicController,
  SocialVerificationController,
} from './modules/auth/account-security.controller';
import { CheckinsController } from './modules/platform/checkins.controller';
import { PlatformController } from './modules/platform/platform.controller';
import { DeskPlantController } from './modules/community/desk-plant.controller';
import { FeedController } from './modules/community/feed.controller';
import { NotificationController } from './modules/community/notification.controller';
import { PublicProfileController } from './modules/community/public-profile.controller';
import { ReferralController } from './modules/community/referral.controller';
import { RelationshipController } from './modules/community/relationship.controller';
import { ContentController } from './modules/community/content.controller';
import { ModerationController } from './modules/community/moderation.controller';
import { ActivityProjectorService } from './modules/engagement/activity-projector.service';
import { LocalOutboxPumpService } from './modules/outbox/local-outbox-pump.service';
import { OutboxModule } from './modules/outbox/outbox.module';
import { OutboxProcessorService } from './modules/outbox/outbox-processor.service';
import { OutboxService } from './modules/outbox/outbox.service';
import { OfficeBattleController } from './modules/community/office-battle/office-battle.controller';
import { OfficeBattleModule } from './modules/community/office-battle/office-battle.module';
import {
  NewsAdminController,
  NewsPreferenceController,
  NewsPublicController,
} from './modules/community/news/news.controller';
import { NewsModule } from './modules/community/news/news.module';
import { WorkerModule } from './worker.module';

describe('CommunityAppModule route allowlist', () => {
  it('only exposes account and community controllers, never legacy platform routes', () => {
    const controllers = collectControllers(CommunityAppModule);

    expect(controllers).toEqual(
      expect.arrayContaining([
        CommunityHealthController,
        AuthController,
        CurrentAccountController,
        AccountSecurityPublicController,
        SocialVerificationController,
        AccountLifecycleController,
        AccountAppealAdminController,
        RelationshipController,
        PublicProfileController,
        ReferralController,
        FeedController,
        DeskPlantController,
        NotificationController,
        ContentController,
        ModerationController,
        OfficeBattleController,
        NewsPublicController,
        NewsPreferenceController,
        NewsAdminController,
      ]),
    );
    expect(controllers).not.toContain(PlatformController);
    expect(controllers).not.toContain(CheckinsController);

    const modules = collectModules(CommunityAppModule);
    expect(modules).toContain(OfficeBattleModule);
    expect(modules).toContain(NewsModule);
    expect(modules).not.toContain(OutboxModule);
    expect(modules).not.toContain(WorkerModule);
    expect(modules.map((module) => module.name)).not.toContain(
      'AuthEventProducerModule',
    );

    const providers = collectProviders(CommunityAppModule);
    expect(providers).not.toContain(OutboxService);
    expect(providers).not.toContain(OutboxProcessorService);
    expect(providers).not.toContain(LocalOutboxPumpService);
    expect(providers).not.toContain(ActivityProjectorService);
  });
});

function collectModules(root: Function, visited = new Set<Function>()): Function[] {
  if (visited.has(root)) return [];
  visited.add(root);
  const imports =
    (Reflect.getMetadata(MODULE_METADATA.IMPORTS, root) as unknown[] | undefined) ?? [];
  return [
    root,
    ...imports.flatMap((entry) => {
      const imported = dynamicModuleType(entry);
      return imported ? collectModules(imported, visited) : [];
    }),
  ];
}

function collectControllers(
  root: Function,
  visited = new Set<Function>(),
): Function[] {
  if (visited.has(root)) return [];
  visited.add(root);
  const own =
    (Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, root) as Function[] | undefined) ??
    [];
  const imports =
    (Reflect.getMetadata(MODULE_METADATA.IMPORTS, root) as unknown[] | undefined) ?? [];
  return [
    ...own,
    ...imports.flatMap((entry) => {
      const imported = dynamicModuleType(entry);
      return imported ? collectControllers(imported, visited) : [];
    }),
  ];
}

function collectProviders(root: Function, visited = new Set<Function>()): unknown[] {
  if (visited.has(root)) return [];
  visited.add(root);
  const own =
    (Reflect.getMetadata(MODULE_METADATA.PROVIDERS, root) as unknown[] | undefined) ??
    [];
  const imports =
    (Reflect.getMetadata(MODULE_METADATA.IMPORTS, root) as unknown[] | undefined) ?? [];
  return [
    ...own,
    ...imports.flatMap((entry) => {
      const imported = dynamicModuleType(entry);
      return imported ? collectProviders(imported, visited) : [];
    }),
  ];
}

function dynamicModuleType(entry: unknown): Function | null {
  if (typeof entry === 'function') return entry;
  if (
    entry !== null &&
    typeof entry === 'object' &&
    'module' in entry &&
    typeof (entry as { module?: unknown }).module === 'function'
  ) {
    return (entry as { module: Function }).module;
  }
  return null;
}
