import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import { Document } from '../../database/entities/document.entity';
import { ReadingDailyUsage } from '../../database/entities/reading-daily-usage.entity';
import {
  ReadingHeartbeatState,
  ReadingSession,
  ReadingSessionStatus,
} from '../../database/entities/reading-session.entity';
import { User } from '../../database/entities/user.entity';
import { OutboxService } from '../outbox';
import { PLATFORM_TIME_ZONE } from '../platform/platform.constants';
import { toBusinessLocalDate } from '../platform/platform-time';
import {
  ParsedReadingHeartbeat,
  ReadingHeartbeatDto,
  StartReadingSessionDto,
} from './dto/reading-session.dto';
import {
  READING_DAILY_GOAL_SECONDS,
  READING_DAILY_MAX_SECONDS,
  READING_HEARTBEAT_INTERVAL_SECONDS,
  READING_HEARTBEAT_MAX_CREDIT_SECONDS,
  READING_HEARTBEAT_STALE_SECONDS,
  READING_IDLE_TIMEOUT_SECONDS,
  READING_SESSION_CLOCK,
  ReadingSessionClock,
} from './reading-session.constants';

export interface ReadingSessionResponse {
  sessionId: string;
  status: ReadingSessionStatus;
  state: ReadingHeartbeatState;
  heartbeatIntervalSeconds: number;
  idleTimeoutSeconds: number;
  effectiveSeconds: number;
  dailyEffectiveSeconds: number;
  goalSeconds: number;
  goalCompleted: boolean;
  qualified: boolean;
  eventQueued: boolean;
  serverTime: string;
}

@Injectable()
export class ReadingSessionsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly outbox: OutboxService,
    @Inject(READING_SESSION_CLOCK)
    private readonly clock: ReadingSessionClock,
  ) {}

  async start(
    userId: string,
    body: StartReadingSessionDto,
  ): Promise<ReadingSessionResponse> {
    const documentId = this.uuid(body?.documentId, 'documentId');
    const clientSessionId = this.clientSessionId(body?.clientSessionId);
    const now = this.clock.now();

    return this.dataSource.transaction(async (manager) => {
      await this.lockUser(manager, userId);
      await this.assertReadableDocument(manager, userId, documentId);
      const repo = manager.getRepository(ReadingSession);

      if (clientSessionId) {
        const replay = await repo.findOne({
          where: { userId, clientSessionId },
          lock: { mode: 'pessimistic_write' },
        });
        if (replay) {
          if (replay.documentId !== documentId) {
            throw new ConflictException({
              code: 'READING_SESSION_KEY_REUSED',
            });
          }
          return this.response(manager, replay, false, now);
        }
      } else {
        const activeForDocument = await repo.findOne({
          where: { userId, documentId, status: 'active' },
          lock: { mode: 'pessimistic_write' },
        });
        if (activeForDocument) {
          return this.response(manager, activeForDocument, false, now);
        }
      }

      await this.expireOtherActiveSession(manager, userId, null, now);
      const session = await repo.save(
        repo.create({
          userId,
          documentId,
          clientSessionId: clientSessionId ?? randomUUID(),
          status: 'active',
          lastState: 'active',
          heartbeatSequence: 0,
          effectiveSeconds: 0,
          lastChapterIdx: null,
          lastCharOffset: null,
          startedAt: now,
          lastHeartbeatAt: now,
          endedAt: null,
        }),
      );
      return this.response(manager, session, false, now);
    });
  }

  async heartbeat(
    userId: string,
    sessionId: string,
    body: ReadingHeartbeatDto,
  ): Promise<ReadingSessionResponse> {
    const id = this.uuid(sessionId, 'sessionId');
    const heartbeat = this.heartbeatInput(body);
    const now = this.clock.now();

    return this.dataSource.transaction(async (manager) => {
      await this.lockUser(manager, userId);
      const session = await this.lockOwnedSession(manager, userId, id);
      if (session.status === 'ended' || session.status === 'expired') {
        throw new ConflictException({ code: 'READING_SESSION_CLOSED' });
      }
      if (
        heartbeat.sequence != null &&
        heartbeat.sequence <= session.heartbeatSequence
      ) {
        return this.response(manager, session, false, now);
      }

      if (heartbeat.state === 'active' && session.status !== 'active') {
        await this.expireOtherActiveSession(manager, userId, session.id, now);
      }
      return this.applyTransition(manager, session, heartbeat, now, false);
    });
  }

  async end(
    userId: string,
    sessionId: string,
    body: ReadingHeartbeatDto,
  ): Promise<ReadingSessionResponse> {
    const id = this.uuid(sessionId, 'sessionId');
    const heartbeat = this.heartbeatInput(body);
    const now = this.clock.now();

    return this.dataSource.transaction(async (manager) => {
      await this.lockUser(manager, userId);
      const session = await this.lockOwnedSession(manager, userId, id);
      if (session.status === 'ended' || session.status === 'expired') {
        return this.response(manager, session, false, now);
      }
      if (heartbeat.sequence <= session.heartbeatSequence) {
        return this.response(manager, session, false, now);
      }
      return this.applyTransition(
        manager,
        session,
        heartbeat,
        now,
        true,
      );
    });
  }

  private async applyTransition(
    manager: EntityManager,
    session: ReadingSession,
    input: ParsedReadingHeartbeat,
    now: Date,
    end: boolean,
  ): Promise<ReadingSessionResponse> {
    const elapsedSeconds = Math.floor(
      (now.getTime() - session.lastHeartbeatAt.getTime()) / 1_000,
    );
    const canCredit =
      session.status === 'active' &&
      session.lastState === 'active' &&
      elapsedSeconds > 0 &&
      elapsedSeconds <= READING_HEARTBEAT_STALE_SECONDS;
    const effectiveDelta = canCredit
      ? Math.min(elapsedSeconds, READING_HEARTBEAT_MAX_CREDIT_SECONDS)
      : 0;

    session.heartbeatSequence = input.sequence;
    session.effectiveSeconds += effectiveDelta;
    session.lastHeartbeatAt = now;
    if (input.chapterIdx != null) session.lastChapterIdx = input.chapterIdx;
    if (input.charOffset != null) {
      session.lastCharOffset = String(input.charOffset);
    }
    session.lastState = input.state;
    if (end) {
      session.status = 'ended';
      session.endedAt = now;
    } else {
      session.status = input.state === 'active' ? 'active' : 'paused';
    }
    await manager.getRepository(ReadingSession).save(session);

    const credit = await this.creditDaily(
      manager,
      session,
      effectiveDelta,
      now,
    );
    return this.toResponse(
      session,
      credit.usage,
      credit.eventQueued,
      now,
    );
  }

  private async creditDaily(
    manager: EntityManager,
    session: ReadingSession,
    effectiveDelta: number,
    now: Date,
  ): Promise<{ usage: ReadingDailyUsage | null; eventQueued: boolean }> {
    const localDate = toBusinessLocalDate(now);
    const repo = manager.getRepository(ReadingDailyUsage);
    let usage = await repo.findOne({
      where: { userId: session.userId, localDate },
      lock: { mode: 'pessimistic_write' },
    });
    if (effectiveDelta <= 0 && !usage) {
      return { usage: null, eventQueued: false };
    }
    if (!usage) {
      usage = repo.create({
        userId: session.userId,
        localDate,
        timezone: PLATFORM_TIME_ZONE,
        effectiveSeconds: 0,
        goalCompletedAt: null,
      });
    }

    const acceptedDelta = Math.min(
      effectiveDelta,
      Math.max(0, READING_DAILY_MAX_SECONDS - usage.effectiveSeconds),
    );
    usage.effectiveSeconds += acceptedDelta;
    let eventQueued = false;
    if (
      usage.goalCompletedAt == null &&
      usage.effectiveSeconds >= READING_DAILY_GOAL_SECONDS
    ) {
      usage.goalCompletedAt = now;
      eventQueued = true;
    }
    usage = await repo.save(usage);

    if (eventQueued) {
      await this.outbox.enqueue(manager, {
        userId: session.userId,
        eventType: 'reading.session.completed',
        aggregateType: 'reading_daily_usage',
        aggregateId: `${session.userId}:${localDate}`,
        idempotencyKey: `reading:daily:${session.userId}:${localDate}:v1`,
        payload: {
          title: '完成今日专注阅读',
          description: '累计完成 10 分钟有效阅读',
          sourceType: 'reading_session',
          sourceId: localDate,
          occurredAt: now.toISOString(),
          metadata: {
            documentId: session.documentId,
            sessionId: session.id,
            effectiveSeconds: usage.effectiveSeconds,
            goalSeconds: READING_DAILY_GOAL_SECONDS,
          },
        },
      });
    }
    return { usage, eventQueued };
  }

  private async response(
    manager: EntityManager,
    session: ReadingSession,
    eventQueued: boolean,
    now: Date,
  ): Promise<ReadingSessionResponse> {
    const usage = await manager.getRepository(ReadingDailyUsage).findOne({
      where: {
        userId: session.userId,
        localDate: toBusinessLocalDate(now),
      },
    });
    return this.toResponse(session, usage, eventQueued, now);
  }

  private toResponse(
    session: ReadingSession,
    usage: ReadingDailyUsage | null,
    eventQueued: boolean,
    now: Date,
  ): ReadingSessionResponse {
    const dailyEffectiveSeconds = usage?.effectiveSeconds ?? 0;
    return {
      sessionId: session.id,
      status: session.status,
      state: session.lastState,
      heartbeatIntervalSeconds: READING_HEARTBEAT_INTERVAL_SECONDS,
      idleTimeoutSeconds: READING_IDLE_TIMEOUT_SECONDS,
      effectiveSeconds: session.effectiveSeconds,
      dailyEffectiveSeconds,
      goalSeconds: READING_DAILY_GOAL_SECONDS,
      goalCompleted:
        usage?.goalCompletedAt != null ||
        dailyEffectiveSeconds >= READING_DAILY_GOAL_SECONDS,
      qualified:
        usage?.goalCompletedAt != null ||
        dailyEffectiveSeconds >= READING_DAILY_GOAL_SECONDS,
      eventQueued,
      serverTime: now.toISOString(),
    };
  }

  private async lockUser(
    manager: EntityManager,
    userId: string,
  ): Promise<void> {
    const user = await manager.getRepository(User).findOne({
      where: { id: userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND' });
  }

  private async assertReadableDocument(
    manager: EntityManager,
    userId: string,
    documentId: string,
  ): Promise<void> {
    const document = await manager.getRepository(Document).findOne({
      where: { id: documentId, ownerId: userId, status: 'ready' },
    });
    if (!document) {
      throw new ForbiddenException({ code: 'DOCUMENT_NOT_READABLE' });
    }
  }

  private async lockOwnedSession(
    manager: EntityManager,
    userId: string,
    sessionId: string,
  ): Promise<ReadingSession> {
    const session = await manager.getRepository(ReadingSession).findOne({
      where: { id: sessionId, userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!session) {
      throw new NotFoundException({ code: 'READING_SESSION_NOT_FOUND' });
    }
    return session;
  }

  private async expireOtherActiveSession(
    manager: EntityManager,
    userId: string,
    keepSessionId: string | null,
    now: Date,
  ): Promise<void> {
    const repo = manager.getRepository(ReadingSession);
    const active = await repo.findOne({
      where: { userId, status: 'active' },
      lock: { mode: 'pessimistic_write' },
    });
    if (!active || active.id === keepSessionId) return;
    active.status = 'expired';
    active.endedAt = now;
    await repo.save(active);
  }

  private heartbeatInput(body: ReadingHeartbeatDto): ParsedReadingHeartbeat {
    const state = body?.state;
    if (!['active', 'hidden', 'idle', 'boss'].includes(String(state))) {
      throw new BadRequestException({ code: 'INVALID_READING_STATE' });
    }
    return {
      state: state as ReadingHeartbeatState,
      sequence: this.requiredInteger(
        body.sequence,
        'sequence',
        1,
        2_147_483_647,
      ),
      chapterIdx: this.optionalInteger(
        body.chapterIdx,
        'chapterIdx',
        0,
        2_147_483_647,
      ),
      charOffset: this.optionalInteger(
        body.charOffset,
        'charOffset',
        0,
        Number.MAX_SAFE_INTEGER,
      ),
    };
  }

  private optionalInteger(
    raw: unknown,
    field: string,
    minimum: number,
    maximum: number,
  ): number | null {
    if (raw == null) return null;
    if (
      !Number.isSafeInteger(raw) ||
      Number(raw) < minimum ||
      Number(raw) > maximum
    ) {
      throw new BadRequestException({ code: 'INVALID_READING_HEARTBEAT', field });
    }
    return Number(raw);
  }

  private requiredInteger(
    raw: unknown,
    field: string,
    minimum: number,
    maximum: number,
  ): number {
    const value = this.optionalInteger(raw, field, minimum, maximum);
    if (value == null) {
      throw new BadRequestException({
        code: 'INVALID_READING_HEARTBEAT',
        field,
      });
    }
    return value;
  }

  private uuid(raw: unknown, field: string): string {
    if (
      typeof raw !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        raw,
      )
    ) {
      throw new BadRequestException({ code: 'INVALID_UUID', field });
    }
    return raw;
  }

  private clientSessionId(raw: unknown): string | null {
    if (raw == null || raw === '') return null;
    if (
      typeof raw !== 'string' ||
      !/^[A-Za-z0-9_-]{8,64}$/.test(raw)
    ) {
      throw new BadRequestException({
        code: 'INVALID_CLIENT_SESSION_ID',
      });
    }
    return raw;
  }
}
