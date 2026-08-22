import { randomUUID } from 'node:crypto';

import { newDb } from 'pg-mem';
import type { DataSource } from 'typeorm';

import { AuthRateLimitBucket } from '../../database/entities/auth-rate-limit-bucket.entity';
import { AuthRateLimitException } from './auth-rate-limit.exception';
import { AuthRateLimitExceptionFilter } from './auth-rate-limit.filter';
import { AuthRateLimitService } from './auth-rate-limit.service';

const TOKEN_PEPPER = 'test-auth-token-pepper-with-32-plus-characters';

describe('AuthRateLimitService', () => {
  let dataSource: DataSource;
  let service: AuthRateLimitService;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    process.env.LOCAL_DEV = 'true';
    process.env.NODE_ENV = 'test';
    process.env.AUTH_TOKEN_PEPPER = TOKEN_PEPPER;
    dataSource = await createDataSource();
    service = new AuthRateLimitService(dataSource);
  });

  afterEach(async () => {
    if (dataSource.isInitialized) await dataSource.destroy();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('shares counters across service instances and returns a stable 429 contract', async () => {
    const now = new Date('2026-08-22T00:00:00.000Z');
    const policy = [
      {
        scope: 'login:email',
        dimension: 'private@example.com',
        limit: 1,
        windowMs: 60_000,
      },
    ];

    await service.consume(policy, now);
    const secondReplica = new AuthRateLimitService(dataSource);
    await expect(secondReplica.consume(policy, now)).rejects.toMatchObject({
      status: 429,
      response: { code: 'AUTH_RATE_LIMITED', retryAfter: 60 },
    });

    const persisted = JSON.stringify(
      await dataSource.getRepository(AuthRateLimitBucket).find(),
    );
    expect(persisted).not.toContain('private@example.com');
    expect(persisted).not.toContain('127.0.0.1');
  });

  it('starts a fresh counter after the persisted window ends', async () => {
    const policy = [
      {
        scope: 'register:ip',
        dimension: '127.0.0.1',
        limit: 1,
        windowMs: 60_000,
      },
    ];
    await service.consume(policy, new Date('2026-08-22T00:00:00.000Z'));
    await expect(
      service.consume(policy, new Date('2026-08-22T00:01:01.000Z')),
    ).resolves.toBeUndefined();
  });

  it('fails closed when the shared database is unavailable', async () => {
    await dataSource.destroy();
    await expect(
      service.consume([
        {
          scope: 'login:ip',
          dimension: '127.0.0.1',
          limit: 1,
          windowMs: 60_000,
        },
      ]),
    ).rejects.toMatchObject({
      response: { code: 'AUTH_RATE_LIMIT_UNAVAILABLE' },
    });
  });

  it('writes Retry-After as both a standard header and response field', () => {
    const response = {
      setHeader: jest.fn(),
      status: jest.fn(),
      json: jest.fn(),
    };
    response.status.mockReturnValue(response);
    const host = {
      switchToHttp: () => ({ getResponse: () => response }),
    };

    new AuthRateLimitExceptionFilter().catch(
      new AuthRateLimitException(12.1),
      host as never,
    );

    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '13');
    expect(response.status).toHaveBeenCalledWith(429);
    expect(response.json).toHaveBeenCalledWith({
      code: 'AUTH_RATE_LIMITED',
      retryAfter: 13,
    });
  });
});

async function createDataSource(): Promise<DataSource> {
  const db = newDb({ autoCreateForeignKeyIndices: true });
  db.public.registerFunction({
    name: 'gen_random_uuid',
    returns: 'uuid' as never,
    implementation: () => randomUUID(),
    impure: true,
  });
  db.public.registerFunction({
    name: 'version',
    returns: 'text' as never,
    implementation: () => 'PostgreSQL 16.0 (pg-mem auth rate-limit test)',
    impure: true,
  });
  db.public.registerFunction({
    name: 'current_database',
    returns: 'text' as never,
    implementation: () => 'stealth_reader',
    impure: true,
  });
  const source = db.adapters.createTypeormDataSource({
    type: 'postgres',
    entities: [AuthRateLimitBucket],
    synchronize: true,
  }) as DataSource;
  await source.initialize();
  return source;
}
