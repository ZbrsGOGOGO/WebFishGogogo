import 'reflect-metadata';

import { MODULE_METADATA } from '@nestjs/common/constants';

import { ActivityProjectorService } from '../engagement/activity-projector.service';
import { OutboxModule } from '../outbox/outbox.module';
import { OutboxService } from '../outbox/outbox.service';
import { AuthModule } from './auth.module';

describe('AuthModule isolation', () => {
  it('does not load a legacy domain-event producer, projector, or pump', () => {
    const imports =
      (Reflect.getMetadata(MODULE_METADATA.IMPORTS, AuthModule) as unknown[]) ?? [];
    const moduleTypes = imports.map((entry) => {
      if (typeof entry === 'function') return entry;
      if (entry && typeof entry === 'object' && 'module' in entry) {
        return (entry as { module: unknown }).module;
      }
      return null;
    });

    expect(moduleTypes).not.toContain(OutboxModule);
    expect(moduleTypes.map((entry) => (entry as Function | null)?.name)).not.toContain(
      'AuthEventProducerModule',
    );
    const providers =
      (Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AuthModule) as unknown[]) ?? [];
    expect(providers).not.toContain(OutboxService);
    expect(providers).not.toContain(ActivityProjectorService);
  });
});
