import { ServiceUnavailableException } from '@nestjs/common';
import type { DataSource } from 'typeorm';

import { CommunityHealthController } from './community-health.controller';

describe('CommunityHealthController', () => {
  it('reports the isolated community liveness response', () => {
    const dataSource = { query: jest.fn() } as unknown as DataSource;
    const controller = new CommunityHealthController(dataSource);

    expect(controller.getHealth()).toEqual({
      status: 'ok',
      mode: 'community',
    });
  });

  it('reports ready only after the database responds', async () => {
    const query = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
    const controller = new CommunityHealthController({
      query,
    } as unknown as DataSource);

    await expect(controller.getReadiness()).resolves.toEqual({
      status: 'ready',
      mode: 'community',
      checks: { database: 'ok' },
    });
    expect(query).toHaveBeenCalledWith('SELECT 1');
  });

  it('fails readiness without leaking the database error', async () => {
    const controller = new CommunityHealthController({
      query: jest.fn().mockRejectedValue(new Error('connection detail')),
    } as unknown as DataSource);

    await expect(controller.getReadiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
