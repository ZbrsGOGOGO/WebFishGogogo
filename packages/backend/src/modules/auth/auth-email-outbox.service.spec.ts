import { randomUUID } from 'node:crypto';

import { newDb } from 'pg-mem';
import type { DataSource } from 'typeorm';

import { AuthEmailOutbox } from '../../database/entities/auth-email-outbox.entity';
import { AuthEmailOutboxService } from './auth-email-outbox.service';
import type { EmailDeliveryService } from './email-delivery.service';

const TOKEN_PEPPER = 'test-auth-token-pepper-with-32-plus-characters';

describe('AuthEmailOutboxService', () => {
  let dataSource: DataSource;
  let sendRegistrationCode: jest.Mock;
  let sendPasswordReset: jest.Mock;
  let service: AuthEmailOutboxService;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    process.env.LOCAL_DEV = 'true';
    process.env.NODE_ENV = 'test';
    process.env.AUTH_TOKEN_PEPPER = TOKEN_PEPPER;
    delete process.env.AUTH_EMAIL_OUTBOX_ENCRYPTION_KEY;
    delete process.env.AUTH_EMAIL_OUTBOX_ENCRYPTION_KEY_ID;
    dataSource = await createDataSource();
    sendRegistrationCode = jest.fn().mockResolvedValue(undefined);
    sendPasswordReset = jest.fn().mockResolvedValue(undefined);
    service = new AuthEmailOutboxService(
      dataSource,
      {
        assertRegistrationDeliveryAvailable: jest.fn(),
        assertPasswordResetDeliveryAvailable: jest.fn(),
        sendRegistrationCode,
        sendPasswordReset,
      } as unknown as EmailDeliveryService,
    );
  });

  afterEach(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('persists no plaintext recipient/code and dispatches after commit with idempotency', async () => {
    const expiresAt = new Date(Date.now() + 10 * 60_000);
    const queued = await dataSource.transaction((manager) =>
      service.enqueueRegistrationCode(manager, {
        registrationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        email: 'private@example.com',
        code: '123456',
        expiresAt,
      }),
    );

    const persistedBefore = await dataSource
      .getRepository(AuthEmailOutbox)
      .findOneByOrFail({ id: queued.id });
    expect(JSON.stringify(persistedBefore)).not.toContain('private@example.com');
    expect(JSON.stringify(persistedBefore)).not.toContain('123456');

    await expect(service.dispatchNow(queued.id)).resolves.toBe('delivered');
    expect(sendRegistrationCode).toHaveBeenCalledWith({
      email: 'private@example.com',
      code: '123456',
      expiresAt,
      idempotencyKey: queued.id,
    });
    await expect(
      dataSource.getRepository(AuthEmailOutbox).findOneByOrFail({ id: queued.id }),
    ).resolves.toMatchObject({ status: 'delivered', attempts: 0 });
  });

  it('keeps a failed post-commit delivery durable for background retry', async () => {
    sendRegistrationCode.mockRejectedValueOnce(new Error('webhook unavailable'));
    const queued = await enqueue(service, dataSource);

    await expect(service.dispatchNow(queued.id)).resolves.toBe('queued');
    const persisted = await dataSource
      .getRepository(AuthEmailOutbox)
      .findOneByOrFail({ id: queued.id });
    expect(persisted).toMatchObject({
      status: 'pending',
      attempts: 1,
      lastErrorCode: 'EMAIL_DELIVERY_FAILED',
    });
    expect(persisted.availableAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('encrypts password-reset recipients and tokens and dispatches the one-time command', async () => {
    const expiresAt = new Date(Date.now() + 30 * 60_000);
    const token = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.' + 'x'.repeat(43);
    const queued = await dataSource.transaction((manager) =>
      service.enqueuePasswordReset(manager, {
        userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        email: 'reset-private@example.com',
        token,
        expiresAt,
      }),
    );
    const persisted = await dataSource
      .getRepository(AuthEmailOutbox)
      .findOneByOrFail({ id: queued.id });
    expect(JSON.stringify(persisted)).not.toContain('reset-private@example.com');
    expect(JSON.stringify(persisted)).not.toContain(token);

    await expect(service.dispatchNow(queued.id)).resolves.toBe('delivered');
    expect(sendPasswordReset).toHaveBeenCalledWith({
      email: 'reset-private@example.com',
      token,
      expiresAt,
      idempotencyKey: queued.id,
    });
  });

  it('lets the compensation pump deliver a committed pending row', async () => {
    const queued = await enqueue(service, dataSource);
    await expect(service.dispatchPendingBatch()).resolves.toBe(1);
    expect(sendRegistrationCode).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: queued.id }),
    );
  });

  it('supersedes an undelivered older code for the same registration', async () => {
    const first = await enqueue(service, dataSource);
    const second = await dataSource.transaction((manager) =>
      service.enqueueRegistrationCode(manager, {
        registrationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        email: 'private@example.com',
        code: '654321',
        expiresAt: new Date(Date.now() + 10 * 60_000),
      }),
    );
    const repository = dataSource.getRepository(AuthEmailOutbox);
    await expect(repository.findOneByOrFail({ id: first.id })).resolves.toMatchObject({
      status: 'dead',
      lastErrorCode: 'AUTH_EMAIL_SUPERSEDED',
    });
    await expect(repository.findOneByOrFail({ id: second.id })).resolves.toMatchObject({
      status: 'pending',
    });
  });

  it('never sends an expired queued code', async () => {
    const queued = await dataSource.transaction((manager) =>
      service.enqueueRegistrationCode(
        manager,
        {
          registrationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          email: 'private@example.com',
          code: '123456',
          expiresAt: new Date(Date.now() - 1_000),
        },
        new Date(Date.now() - 2_000),
      ),
    );
    await expect(service.dispatchNow(queued.id)).resolves.toBe('discarded');
    expect(sendRegistrationCode).not.toHaveBeenCalled();
    await expect(
      dataSource.getRepository(AuthEmailOutbox).findOneByOrFail({ id: queued.id }),
    ).resolves.toMatchObject({
      status: 'dead',
      lastErrorCode: 'AUTH_EMAIL_EXPIRED',
    });
  });

  it('fails closed outside local development when the encryption key is absent', () => {
    process.env.LOCAL_DEV = 'false';
    process.env.NODE_ENV = 'production';
    expect(() => service.assertRegistrationDeliveryAvailable()).toThrow(
      expect.objectContaining({
        response: { code: 'AUTH_EMAIL_OUTBOX_KEY_NOT_CONFIGURED' },
      }),
    );
  });
});

async function enqueue(
  service: AuthEmailOutboxService,
  dataSource: DataSource,
): Promise<AuthEmailOutbox> {
  return dataSource.transaction((manager) =>
    service.enqueueRegistrationCode(manager, {
      registrationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      email: 'private@example.com',
      code: '123456',
      expiresAt: new Date(Date.now() + 10 * 60_000),
    }),
  );
}

async function createDataSource(): Promise<DataSource> {
  const db = newDb({ autoCreateForeignKeyIndices: true });
  db.public.registerFunction({
    name: 'gen_random_uuid',
    returns: 'uuid' as never,
    implementation: () => randomUUID(),
    impure: true,
  });
  db.public.registerFunction({
    name: 'uuid_generate_v4',
    returns: 'uuid' as never,
    implementation: () => randomUUID(),
    impure: true,
  });
  db.public.registerFunction({
    name: 'version',
    returns: 'text' as never,
    implementation: () => 'PostgreSQL 16.0 (pg-mem auth email test)',
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
    entities: [AuthEmailOutbox],
    synchronize: true,
  }) as DataSource;
  await source.initialize();
  return source;
}
