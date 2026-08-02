import { ServiceUnavailableException } from '@nestjs/common';
import type { DataSource } from 'typeorm';

import { AppController } from './app.controller';
import type { StoragePort } from './modules/documents/storage';

function createController(options?: {
  databaseError?: Error;
  storageError?: Error;
}): {
  controller: AppController;
  query: jest.Mock;
  checkHealth: jest.Mock;
} {
  const query = options?.databaseError
    ? jest.fn().mockRejectedValue(options.databaseError)
    : jest.fn().mockResolvedValue([{ ok: 1 }]);
  const checkHealth = options?.storageError
    ? jest.fn().mockRejectedValue(options.storageError)
    : jest.fn().mockResolvedValue(undefined);

  const controller = new AppController(
    { query } as unknown as DataSource,
    { checkHealth } as unknown as StoragePort,
  );

  return { controller, query, checkHealth };
}

describe('AppController health endpoints', () => {
  it('keeps liveness independent from external dependencies', () => {
    const { controller } = createController({
      databaseError: new Error('database unavailable'),
      storageError: new Error('storage unavailable'),
    });

    expect(controller.getHealth()).toEqual({ status: 'ok' });
  });

  it('reports ready only after checking the database and storage', async () => {
    const { controller, query, checkHealth } = createController();

    await expect(controller.getReadiness()).resolves.toEqual({
      status: 'ready',
      checks: { database: 'ok', storage: 'ok' },
    });
    expect(query).toHaveBeenCalledWith('SELECT 1');
    expect(checkHealth).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      name: 'database',
      options: { databaseError: new Error('database unavailable') },
      checks: { database: 'failed', storage: 'ok' },
    },
    {
      name: 'storage',
      options: { storageError: new Error('storage unavailable') },
      checks: { database: 'ok', storage: 'failed' },
    },
  ])('returns 503 when $name is unavailable', async ({ options, checks }) => {
    const { controller } = createController(options);

    try {
      await controller.getReadiness();
      throw new Error('expected readiness to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect((error as ServiceUnavailableException).getResponse()).toEqual({
        status: 'unavailable',
        checks,
      });
    }
  });
});
