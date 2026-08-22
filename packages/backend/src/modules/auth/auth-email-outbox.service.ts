import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from 'node:crypto';

import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Brackets, DataSource, EntityManager, Repository } from 'typeorm';

import { AuthEmailOutbox } from '../../database/entities/auth-email-outbox.entity';
import { hashAuthMetadata } from './auth-crypto';
import {
  EmailDeliveryService,
  PasswordResetEmailCommand,
  RegistrationEmailCommand,
} from './email-delivery.service';

const PUMP_INTERVAL_MS = 5_000;
const LEASE_MS = 30_000;
const DELIVERED_RETENTION_MS = 7 * 24 * 60 * 60_000;
const DEAD_RETENTION_MS = 30 * 24 * 60 * 60_000;

interface RegistrationEmailEnvelope {
  version: 1;
  template: 'registration-verification';
  email: string;
  code: string;
  expiresAt: string;
}

interface PasswordResetEmailEnvelope {
  version: 1;
  template: 'password-reset';
  email: string;
  token: string;
  expiresAt: string;
}

type AuthEmailEnvelope =
  | RegistrationEmailEnvelope
  | PasswordResetEmailEnvelope;

export interface EnqueueRegistrationEmail {
  registrationId: string;
  email: string;
  code: string;
  expiresAt: Date;
}

export interface EnqueuePasswordResetEmail {
  userId: string;
  email: string;
  token: string;
  expiresAt: Date;
}

export type AuthEmailDispatchResult = 'delivered' | 'queued' | 'discarded';

/**
 * Reliable, dedicated verification-email queue. Network calls always happen
 * after the caller's account transaction commits; the encrypted row provides
 * crash recovery and the lease supports multiple API replicas.
 */
@Injectable()
export class AuthEmailOutboxService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(AuthEmailOutboxService.name);
  private pumpTimer: NodeJS.Timeout | null = null;
  private running = false;
  private pumpRuns = 0;

  constructor(
    private readonly dataSource: DataSource,
    private readonly emailDelivery: EmailDeliveryService,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.AUTH_EMAIL_OUTBOX_PUMP_ENABLED === 'false') return;
    this.pumpTimer = setInterval(() => {
      void this.drain();
    }, PUMP_INTERVAL_MS);
    this.pumpTimer.unref();
    void this.drain();
  }

  onModuleDestroy(): void {
    if (this.pumpTimer) clearInterval(this.pumpTimer);
    this.pumpTimer = null;
  }

  assertRegistrationDeliveryAvailable(): void {
    this.encryptionConfiguration();
    this.emailDelivery.assertRegistrationDeliveryAvailable();
  }

  assertPasswordResetDeliveryAvailable(): void {
    this.encryptionConfiguration();
    this.emailDelivery.assertPasswordResetDeliveryAvailable();
  }

  async enqueueRegistrationCode(
    manager: EntityManager,
    command: EnqueueRegistrationEmail,
    now = new Date(),
  ): Promise<AuthEmailOutbox> {
    this.assertRegistrationDeliveryAvailable();
    const id = randomUUID();
    const envelope: RegistrationEmailEnvelope = {
      version: 1,
      template: 'registration-verification',
      email: command.email,
      code: command.code,
      expiresAt: command.expiresAt.toISOString(),
    };
    const encrypted = this.encrypt(id, envelope);
    const correlationHash = hashAuthMetadata(
      'auth-email-registration',
      command.registrationId,
    );
    return this.persistEnvelope(
      manager,
      id,
      command.email,
      correlationHash,
      envelope,
      encrypted,
      command.expiresAt,
      now,
    );
  }

  async enqueuePasswordReset(
    manager: EntityManager,
    command: EnqueuePasswordResetEmail,
    now = new Date(),
  ): Promise<AuthEmailOutbox> {
    this.assertPasswordResetDeliveryAvailable();
    const id = randomUUID();
    const envelope: PasswordResetEmailEnvelope = {
      version: 1,
      template: 'password-reset',
      email: command.email,
      token: command.token,
      expiresAt: command.expiresAt.toISOString(),
    };
    const encrypted = this.encrypt(id, envelope);
    return this.persistEnvelope(
      manager,
      id,
      command.email,
      hashAuthMetadata('auth-email-password-reset', command.userId),
      envelope,
      encrypted,
      command.expiresAt,
      now,
    );
  }

  async cancelRegistration(
    manager: EntityManager,
    registrationId: string,
    reason: 'AUTH_EMAIL_EXPIRED' | 'AUTH_EMAIL_VERIFIED',
  ): Promise<void> {
    const repository = manager.getRepository(AuthEmailOutbox);
    await this.cancelByCorrelation(
      repository,
      hashAuthMetadata('auth-email-registration', registrationId),
      reason,
    );
  }

  async cancelPasswordReset(
    manager: EntityManager,
    userId: string,
    reason: 'PASSWORD_RESET_CONSUMED' | 'ACCOUNT_DELETED',
  ): Promise<void> {
    await this.cancelByCorrelation(
      manager.getRepository(AuthEmailOutbox),
      hashAuthMetadata('auth-email-password-reset', userId),
      reason,
    );
  }

  async purgeRecipient(manager: EntityManager, email: string): Promise<void> {
    await manager.getRepository(AuthEmailOutbox).delete({
      recipientHash: hashAuthMetadata(
        'auth-email-recipient',
        email.trim().normalize('NFC').toLowerCase(),
      ),
    });
  }

  /** Best-effort immediate delivery; durable retry remains queued on failure. */
  async dispatchNow(id: string): Promise<AuthEmailDispatchResult> {
    try {
      return await this.dispatchClaimed(id);
    } catch {
      // The committed row is the source of truth; a later pump can retry it.
      this.logger.error('Immediate auth email dispatch failed');
      return 'queued';
    }
  }

  private async dispatchClaimed(id: string): Promise<AuthEmailDispatchResult> {
    const leaseOwner = randomUUID();
    const row = await this.claim(id, leaseOwner, new Date());
    if (!row) return 'discarded';

    let command: RegistrationEmailCommand | PasswordResetEmailCommand;
    let template: AuthEmailEnvelope['template'];
    try {
      const envelope = this.decrypt(row);
      template = envelope.template;
      command =
        envelope.template === 'registration-verification'
          ? {
              email: envelope.email,
              code: envelope.code,
              expiresAt: new Date(envelope.expiresAt),
              idempotencyKey: row.id,
            }
          : {
              email: envelope.email,
              token: envelope.token,
              expiresAt: new Date(envelope.expiresAt),
              idempotencyKey: row.id,
            };
      if (
        !Number.isFinite(command.expiresAt.getTime()) ||
        command.expiresAt.getTime() <= Date.now()
      ) {
        await this.markDead(row.id, leaseOwner, 'AUTH_EMAIL_EXPIRED');
        return 'discarded';
      }
    } catch {
      await this.recordFailure(
        row.id,
        leaseOwner,
        'AUTH_EMAIL_PAYLOAD_UNAVAILABLE',
      );
      return 'queued';
    }

    try {
      if (template === 'registration-verification') {
        await this.emailDelivery.sendRegistrationCode(
          command as RegistrationEmailCommand,
        );
      } else {
        await this.emailDelivery.sendPasswordReset(
          command as PasswordResetEmailCommand,
        );
      }
      await this.markDelivered(row.id, leaseOwner, new Date());
      return 'delivered';
    } catch {
      await this.recordFailure(row.id, leaseOwner, 'EMAIL_DELIVERY_FAILED');
      return 'queued';
    }
  }

  async dispatchPendingBatch(limit = 20): Promise<number> {
    const boundedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const now = new Date();
    const rows = await this.dataSource
      .getRepository(AuthEmailOutbox)
      .createQueryBuilder('message')
      .select(['message.id'])
      .where('message.expiresAt > :now', { now })
      .andWhere(
        new Brackets((query) => {
          query
            .where(
              'message.status = :pending AND message.availableAt <= :now',
              { pending: 'pending', now },
            )
            .orWhere(
              'message.status = :processing AND message.leaseUntil <= :now',
              { processing: 'processing', now },
            );
        }),
      )
      .orderBy('message.availableAt', 'ASC')
      .limit(boundedLimit)
      .getMany();

    let delivered = 0;
    for (const row of rows) {
      if ((await this.dispatchNow(row.id)) === 'delivered') delivered += 1;
    }
    return delivered;
  }

  async cleanup(now = new Date()): Promise<void> {
    const deliveredBefore = new Date(
      now.getTime() - DELIVERED_RETENTION_MS,
    );
    const deadBefore = new Date(now.getTime() - DEAD_RETENTION_MS);
    await this.dataSource
      .getRepository(AuthEmailOutbox)
      .createQueryBuilder()
      .delete()
      .where(
        '("status" = :delivered AND "delivered_at" < :deliveredBefore)',
        { delivered: 'delivered', deliveredBefore },
      )
      .orWhere(
        '("status" = :dead AND "updated_at" < :deadBefore)',
        { dead: 'dead', deadBefore },
      )
      .orWhere(
        '("status" IN (:...unfinished) AND "expires_at" < :deadBefore)',
        { unfinished: ['pending', 'processing'], deadBefore },
      )
      .execute();
  }

  private async claim(
    id: string,
    leaseOwner: string,
    now: Date,
  ): Promise<AuthEmailOutbox | null> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(AuthEmailOutbox);
      const row = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row || row.status === 'delivered' || row.status === 'dead') {
        return null;
      }
      if (row.expiresAt.getTime() <= now.getTime()) {
        row.status = 'dead';
        row.lastErrorCode = 'AUTH_EMAIL_EXPIRED';
        row.leaseOwner = null;
        row.leaseUntil = null;
        await repository.save(row);
        return null;
      }
      if (row.availableAt.getTime() > now.getTime()) return null;
      if (
        row.status === 'processing' &&
        row.leaseUntil !== null &&
        row.leaseUntil.getTime() > now.getTime()
      ) {
        return null;
      }
      row.status = 'processing';
      row.leaseOwner = leaseOwner;
      row.leaseUntil = new Date(now.getTime() + LEASE_MS);
      await repository.save(row);
      return row;
    });
  }

  private async cancelByCorrelation(
    repository: Repository<AuthEmailOutbox>,
    correlationHash: string,
    reason: string,
  ): Promise<void> {
    await repository
      .createQueryBuilder()
      .update()
      .set({ status: 'dead', lastErrorCode: reason })
      .where('correlation_hash = :correlationHash', { correlationHash })
      .andWhere('status = :status', { status: 'pending' })
      .execute();
  }

  private async persistEnvelope(
    manager: EntityManager,
    id: string,
    email: string,
    correlationHash: string,
    envelope: AuthEmailEnvelope,
    encrypted: {
      keyId: string;
      ciphertext: string;
      nonce: string;
      authTag: string;
    },
    expiresAt: Date,
    now: Date,
  ): Promise<AuthEmailOutbox> {
    const repository = manager.getRepository(AuthEmailOutbox);
    await this.cancelByCorrelation(
      repository,
      correlationHash,
      'AUTH_EMAIL_SUPERSEDED',
    );
    return repository.save(
      repository.create({
        id,
        template: envelope.template,
        recipientHash: hashAuthMetadata(
          'auth-email-recipient',
          email.trim().normalize('NFC').toLowerCase(),
        ),
        correlationHash,
        keyId: encrypted.keyId,
        ciphertext: encrypted.ciphertext,
        nonce: encrypted.nonce,
        authTag: encrypted.authTag,
        status: 'pending',
        attempts: 0,
        maxAttempts: 5,
        availableAt: now,
        expiresAt,
        leaseOwner: null,
        leaseUntil: null,
        deliveredAt: null,
        lastErrorCode: null,
      }),
    );
  }

  private async markDelivered(
    id: string,
    leaseOwner: string,
    now: Date,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(AuthEmailOutbox);
      const row = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row || row.status !== 'processing' || row.leaseOwner !== leaseOwner) {
        return;
      }
      row.status = 'delivered';
      row.deliveredAt = now;
      row.lastErrorCode = null;
      row.leaseOwner = null;
      row.leaseUntil = null;
      await repository.save(row);
    });
  }

  private async recordFailure(
    id: string,
    leaseOwner: string,
    errorCode: string,
  ): Promise<void> {
    const now = new Date();
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(AuthEmailOutbox);
      const row = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row || row.status !== 'processing' || row.leaseOwner !== leaseOwner) {
        return;
      }
      row.attempts = Math.min(row.maxAttempts, row.attempts + 1);
      row.lastErrorCode = errorCode;
      row.leaseOwner = null;
      row.leaseUntil = null;
      if (
        row.attempts >= row.maxAttempts ||
        row.expiresAt.getTime() <= now.getTime()
      ) {
        row.status = 'dead';
      } else {
        row.status = 'pending';
        row.availableAt = new Date(
          now.getTime() + Math.min(15 * 60_000, 5_000 * 2 ** row.attempts),
        );
      }
      await repository.save(row);
    });
  }

  private async markDead(
    id: string,
    leaseOwner: string,
    errorCode: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(AuthEmailOutbox);
      const row = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row || row.leaseOwner !== leaseOwner) return;
      row.status = 'dead';
      row.lastErrorCode = errorCode;
      row.leaseOwner = null;
      row.leaseUntil = null;
      await repository.save(row);
    });
  }

  private encrypt(
    id: string,
    envelope: AuthEmailEnvelope,
  ): {
    keyId: string;
    ciphertext: string;
    nonce: string;
    authTag: string;
  } {
    const { key, keyId } = this.encryptionConfiguration();
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(this.aad(id, envelope.template));
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(envelope), 'utf8'),
      cipher.final(),
    ]);
    return {
      keyId,
      ciphertext: ciphertext.toString('base64url'),
      nonce: nonce.toString('base64url'),
      authTag: cipher.getAuthTag().toString('base64url'),
    };
  }

  private decrypt(row: AuthEmailOutbox): AuthEmailEnvelope {
    const { key, keyId } = this.encryptionConfiguration();
    if (row.keyId !== keyId) throw new Error('unknown email encryption key');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(row.nonce, 'base64url'),
    );
    decipher.setAAD(this.aad(row.id, row.template));
    decipher.setAuthTag(Buffer.from(row.authTag, 'base64url'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(row.ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
    const parsed = JSON.parse(plaintext) as Partial<AuthEmailEnvelope>;
    if (
      parsed.version !== 1 ||
      (parsed.template !== 'registration-verification' &&
        parsed.template !== 'password-reset') ||
      typeof parsed.email !== 'string' ||
      typeof parsed.expiresAt !== 'string'
    ) {
      throw new Error('invalid email envelope');
    }
    if (
      parsed.template === 'registration-verification' &&
      (!('code' in parsed) ||
        typeof parsed.code !== 'string' ||
        !/^\d{6}$/.test(parsed.code))
    ) {
      throw new Error('invalid email envelope');
    }
    if (
      parsed.template === 'password-reset' &&
      (!('token' in parsed) ||
        typeof parsed.token !== 'string' ||
        !/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{32,100}$/i.test(parsed.token))
    ) {
      throw new Error('invalid email envelope');
    }
    return parsed as AuthEmailEnvelope;
  }

  private aad(id: string, template: AuthEmailEnvelope['template']): Buffer {
    return Buffer.from(
      template === 'registration-verification'
        ? `auth-email-outbox:${id}:registration-verification:v1`
        : `auth-email-outbox:${id}:password-reset:v1`,
      'utf8',
    );
  }

  private encryptionConfiguration(): { key: Buffer; keyId: string } {
    const keyId = process.env.AUTH_EMAIL_OUTBOX_ENCRYPTION_KEY_ID ?? 'v1';
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(keyId)) {
      throw new ServiceUnavailableException({
        code: 'AUTH_EMAIL_OUTBOX_KEY_NOT_CONFIGURED',
      });
    }
    const configured = process.env.AUTH_EMAIL_OUTBOX_ENCRYPTION_KEY;
    if (
      !configured &&
      process.env.LOCAL_DEV === 'true' &&
      process.env.NODE_ENV !== 'production'
    ) {
      return {
        key: createHash('sha256')
          .update('webfish-local-auth-email-outbox-key', 'utf8')
          .digest(),
        keyId: 'local-dev-v1',
      };
    }
    let key: Buffer;
    try {
      key = Buffer.from(configured ?? '', 'base64');
    } catch {
      key = Buffer.alloc(0);
    }
    if (key.length !== 32) {
      throw new ServiceUnavailableException({
        code: 'AUTH_EMAIL_OUTBOX_KEY_NOT_CONFIGURED',
      });
    }
    return { key, keyId };
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.dispatchPendingBatch();
      this.pumpRuns += 1;
      if (this.pumpRuns % 120 === 0) await this.cleanup();
    } catch {
      this.logger.error('Auth email outbox pump failed');
    } finally {
      this.running = false;
    }
  }
}
