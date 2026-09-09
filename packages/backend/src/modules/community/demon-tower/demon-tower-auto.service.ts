import { ConflictException, HttpException, Inject, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DEMON_TOWER_AUTO_LIMITS, DEMON_TOWER_CATALOG, type DemonTowerAutoResponse, type DemonTowerAutoStopReason } from '@stealth-reader/shared';
import { DataSource, EntityManager } from 'typeorm';
import { DemonTowerAutoRun } from '../../../database/entities/demon-tower-auto-run.entity';
import { DemonTowerProfile, User } from '../../../database/entities';
import { AuthSession } from '../../../database/entities/auth-session.entity';
import { PLATFORM_CLOCK, systemPlatformClock, type PlatformClock } from '../../platform/platform.constants';
import { toBusinessLocalDate } from '../../platform/platform-time';
import { MembershipService } from '../progression/membership.service';
import { hash } from '../play/play.rules';
import { advanceDemonTowerState, demonTowerAutomaticAction, demonTowerMaxHp, type DemonTowerEngineState } from './demon-tower.engine';
import { assertDemonTowerAutoEnabled, demonTowerAutoEnabled, demonTowerAutoId, demonTowerAutoStart, demonTowerAutoStepRequestId, demonTowerAutoStop, demonTowerAutoView } from './demon-tower-auto.rules';
import { DemonTowerService } from './demon-tower.service';

const LIMITS = DEMON_TOWER_AUTO_LIMITS;
class StopAutomaticRun extends Error { constructor(readonly reason: DemonTowerAutoStopReason) { super('Automatic exploration must stop'); } }
function errorCode(error: unknown): string | undefined {
  if (!(error instanceof HttpException)) return undefined;
  const response = error.getResponse();
  return response && typeof response === 'object' && 'code' in response && typeof response.code === 'string' ? response.code : undefined;
}

@Injectable()
export class DemonTowerAutoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DemonTowerAutoService.name);
  private timer?: ReturnType<typeof setInterval>;
  private draining = false;
  constructor(private readonly db: DataSource, private readonly tower: DemonTowerService, private readonly membership: MembershipService,
    @Inject(PLATFORM_CLOCK) private readonly clock: PlatformClock = systemPlatformClock) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    // The worker also cancels disabled/expired runs. Feature off never advances the engine.
    this.timer = setInterval(() => { void this.drainDue(); }, 1000); this.timer.unref();
  }
  onModuleDestroy(): void { if (this.timer) clearInterval(this.timer); }

  async read(userId: string): Promise<DemonTowerAutoResponse> {
    return this.db.transaction(async manager => {
      await this.lockActiveUser(manager, userId);
      const run = await this.latest(manager, userId);
      return this.response(manager, userId, run, false);
    });
  }

  async start(userId: string, sessionId: string, raw: unknown): Promise<DemonTowerAutoResponse> {
    const input = demonTowerAutoStart(raw), requestHash = hash({ expectedVersion: input.expectedVersion, floor: input.floor, maxExplorations: input.maxExplorations });
    assertDemonTowerAutoEnabled();
    return this.db.transaction(async manager => {
      await this.lockActiveUser(manager, userId);
      const session = await this.lockSession(manager, userId, sessionId);
      const prior = await this.query(manager).where('run.user_id = :userId AND run.start_request_id = :requestId', { userId, requestId: input.requestId }).getOne();
      if (prior) {
        if (prior.requestHash !== requestHash) throw new ConflictException({ code: 'DEMON_TOWER_AUTO_IDEMPOTENCY_CONFLICT' });
        // Never restart a completed/stopped run when a lost start response is replayed.
        return this.response(manager, userId, prior, true);
      }
      assertDemonTowerAutoEnabled();
      if (!session || session.revokedAt !== null || session.expiresAt.getTime() <= this.clock.now().getTime()) throw new UnauthorizedException({ code: 'INVALID_SESSION' });
      if (await manager.getRepository(DemonTowerAutoRun).exist({ where: { userId, status: 'running' } })) throw new ConflictException({ code: 'DEMON_TOWER_AUTO_RUNNING' });
      const profile = await this.profile(manager, userId);
      if (!profile) throw new ConflictException({ code: 'DEMON_TOWER_ENROLL_REQUIRED' });
      if (profile.version !== input.expectedVersion) throw new ConflictException({ code: 'DEMON_TOWER_VERSION_CONFLICT', currentVersion: profile.version });
      await this.tower.lockWorldInTransaction(manager);
      const now = this.clock.now(), serviceDate = toBusinessLocalDate(now);
      await this.membership.requireVip(manager, userId, now);
      const state = advanceDemonTowerState(profile.state as unknown as DemonTowerEngineState, now.getTime(), serviceDate);
      if (state.battle) throw new ConflictException({ code: 'DEMON_TOWER_BATTLE_IN_PROGRESS' });
      if (state.selectedFloor !== input.floor) throw new ConflictException({ code: 'DEMON_TOWER_AUTO_FLOOR_CHANGED' });
      if (state.hp * 100 <= demonTowerMaxHp(state) * LIMITS.startHealthPercent) throw new ConflictException({ code: 'DEMON_TOWER_AUTO_LOW_HEALTH' });
      if (state.stamina < DEMON_TOWER_CATALOG.rules.exploreCost) throw new ConflictException({ code: 'DEMON_TOWER_NOT_ENOUGH_STAMINA' });
      const starts = await manager.getRepository(DemonTowerAutoRun).createQueryBuilder('run').where('run.user_id = :userId AND run.created_at > :since', { userId, since: new Date(now.getTime() - 3_600_000) }).getCount();
      if (starts >= 20) throw new HttpException({ code: 'DEMON_TOWER_AUTO_START_LIMIT' }, 429);
      const run = manager.getRepository(DemonTowerAutoRun).create({ id: randomUUID(), userId, originAuthSessionId: session.id,
        startRequestId: input.requestId, requestHash, version: 1, status: 'running', stopReason: null, serviceDate,
        floor: input.floor, maxExplorations: input.maxExplorations, startedExplorations: 0, completedExplorations: 0,
        steps: 0, expectedProfileVersion: profile.version, officeCoinsGranted: 0, failureCount: 0,
        nextStepAt: now, expiresAt: new Date(now.getTime() + LIMITS.durationMs), createdAt: now, updatedAt: now, stoppedAt: null });
      await manager.getRepository(DemonTowerAutoRun).save(run);
      const result = await this.response(manager, userId, run, false);
      await this.fence(manager, run, session, this.clock.now());
      return result;
    }).catch(error => {
      if (error instanceof StopAutomaticRun) throw new ConflictException({ code: 'DEMON_TOWER_AUTO_START_CANCELLED', reason: error.reason });
      throw error;
    });
  }

  async stop(userId: string, rawId: unknown, raw: unknown): Promise<DemonTowerAutoResponse> {
    const id = demonTowerAutoId(rawId); demonTowerAutoStop(raw);
    // Cancellation intentionally needs neither current VIP nor feature/write enablement.
    // It changes only owned automation metadata, never game state, rewards or a battle.
    return this.db.transaction(async manager => {
      await this.lockActiveUser(manager, userId);
      const run = await this.query(manager).where('run.id = :id AND run.user_id = :userId', { id, userId }).setLock('pessimistic_write').getOne();
      if (!run) throw new NotFoundException({ code: 'DEMON_TOWER_AUTO_NOT_FOUND' });
      const replayed = run.status !== 'running';
      if (!replayed) await this.finish(manager, run, 'manual_stop', this.clock.now());
      return this.response(manager, userId, run, replayed);
    });
  }

  /** Bounded, restart-safe scheduler. Never claim an auto row before the user lock. */
  async drainDue(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      const due = await this.db.getRepository(DemonTowerAutoRun).createQueryBuilder('run').select(['run.id'])
        .where('run.status = :status AND run.next_step_at <= :now', { status: 'running', now: this.clock.now() })
        .orderBy('run.nextStepAt', 'ASC').addOrderBy('run.id', 'ASC').take(8).getMany();
      for (const run of due) {
        try { await this.runOne(run.id); }
        catch { this.logger.warn('Automatic exploration step deferred; private error details suppressed.'); }
      }
    } catch { this.logger.warn('Automatic exploration scan deferred; private error details suppressed.'); }
    finally { this.draining = false; }
  }

  /** Public for isolated integration tests, NOT exposed by a controller. Production always skips busy users. */
  async runOne(id: string, skipLocked = true): Promise<boolean> {
    const reference = await this.query(this.db.manager).where('run.id = :id', { id }).getOne();
    if (!reference || reference.status !== 'running') return false;
    let attemptedVersion: number | null = null;
    try {
      return await this.db.transaction(async manager => {
        const userQuery = manager.getRepository(User).createQueryBuilder('user').where('user.id = :id', { id: reference.userId }).setLock('for_no_key_update');
        if (skipLocked) userQuery.setOnLocked('skip_locked');
        const user = await userQuery.getOne();
        if (!user) return false;
        // Match auth lifecycle lock order. The locked session cannot be revoked mid-step.
        const session = reference.originAuthSessionId ? await this.lockSession(manager, user.id, reference.originAuthSessionId) : null;
        const run = await this.query(manager).where('run.id = :id AND run.user_id = :userId', { id, userId: user.id }).setLock('pessimistic_write').getOne();
        if (!run || run.status !== 'running' || run.nextStepAt.getTime() > this.clock.now().getTime()) return false;
        attemptedVersion = run.version;
        const nowBeforeWorld = this.clock.now();
        if (user.accountStatus !== 'active') { await this.finish(manager, run, 'account_inactive', nowBeforeWorld); return true; }
        if (!demonTowerAutoEnabled()) { await this.finish(manager, run, 'maintenance', nowBeforeWorld); return true; }
        if (!session || session.id !== run.originAuthSessionId || session.revokedAt !== null || session.expiresAt.getTime() <= nowBeforeWorld.getTime()) { await this.finish(manager, run, 'session_ended', nowBeforeWorld); return true; }
        await this.tower.lockWorldInTransaction(manager);
        const now = this.clock.now();
        await this.fence(manager, run, session, now);
        const profile = await this.profile(manager, user.id);
        if (!profile || profile.version !== run.expectedProfileVersion) { await this.finish(manager, run, 'profile_changed', now); return true; }
        const state = advanceDemonTowerState(profile.state as unknown as DemonTowerEngineState, now.getTime(), run.serviceDate);
        if (state.selectedFloor !== run.floor) { await this.finish(manager, run, 'floor_changed', now); return true; }
        if (run.steps >= LIMITS.maxSteps) { await this.finish(manager, run, 'step_limit', now); return true; }
        if (!state.battle && run.startedExplorations >= run.maxExplorations) { await this.finish(manager, run, 'completed', now); return true; }
        const threshold = state.battle ? LIMITS.battleHealthPercent : LIMITS.startHealthPercent;
        const hp = state.battle?.player.hp ?? state.hp, maxHp = state.battle?.player.maxHp ?? demonTowerMaxHp(state);
        if (hp * 100 <= maxHp * threshold) { await this.finish(manager, run, 'low_health', now); return true; }
        if (!state.battle && state.stamina < DEMON_TOWER_CATALOG.rules.exploreCost) { await this.finish(manager, run, 'stamina_empty', now); return true; }
        const action = demonTowerAutomaticAction(state), wasBattle = state.battle !== null;
        const receipt = await this.tower.applyActionInTransaction(manager, user.id,
          { ...action, requestId: demonTowerAutoStepRequestId(run.id, run.steps), expectedVersion: profile.version },
          { runId: run.id, fence: at => this.fence(manager, run, session, at) });
        if (receipt.replayed || !receipt.overview.profile || receipt.effectiveBossDamage !== 0 || receipt.passageContribution !== 0) throw new Error('Automatic step atomicity invariant');
        run.steps += 1; run.expectedProfileVersion = receipt.overview.profile.version; run.officeCoinsGranted += receipt.officeCoinsGranted;
        run.failureCount = 0; run.version += 1; run.updatedAt = now; run.nextStepAt = new Date(now.getTime() + LIMITS.stepIntervalMs);
        if (action.kind === 'explore') run.startedExplorations += 1;
        if (!receipt.overview.profile.battle) run.completedExplorations += 1;
        const outcome = wasBattle && !receipt.overview.profile.battle ? receipt.overview.profile.lastReport?.outcome : null;
        if (outcome === 'defeat') await this.finish(manager, run, 'defeat', now);
        else if (outcome === 'timeout') await this.finish(manager, run, 'battle_timeout', now);
        else if (run.completedExplorations >= run.maxExplorations) await this.finish(manager, run, 'completed', now);
        else await manager.getRepository(DemonTowerAutoRun).save(run);
        // Includes the final run.save wait, not only the wallet/projection await.
        await this.fence(manager, run, session, this.clock.now());
        return true;
      });
    } catch (error) {
      if (attemptedVersion === null) throw error;
      // A failing engine/credit/date fence rolled back the ENTIRE step. Only then
      // may a separate metadata-only transaction stop or defer this same cursor.
      await this.afterFailedStep(reference.userId, id, attemptedVersion, error);
      return false;
    }
  }

  private async afterFailedStep(userId: string, id: string, version: number, error: unknown): Promise<void> {
    await this.db.transaction(async manager => {
      const user = await manager.getRepository(User).createQueryBuilder('user').where('user.id = :userId', { userId }).setLock('for_no_key_update').getOne();
      if (!user) return;
      const run = await this.query(manager).where('run.id = :id AND run.user_id = :userId', { id, userId }).setLock('pessimistic_write').getOne();
      if (!run || run.status !== 'running' || run.version !== version) return;
      const code = errorCode(error), now = this.clock.now();
      let reason: DemonTowerAutoStopReason | null = error instanceof StopAutomaticRun ? error.reason : null;
      if (code === 'DEMON_TOWER_DAY_CHANGED') reason = 'day_changed';
      if (code === 'COMMUNITY_WRITES_DISABLED' || code === 'DEMON_TOWER_DISABLED') reason = 'maintenance';
      if (code === 'DEMON_TOWER_DAILY_ACTION_LIMIT') reason = 'quota_reached';
      if (reason) { await this.finish(manager, run, reason, now); return; }
      if (code !== 'DEMON_TOWER_ACTION_RATE_LIMIT') run.failureCount += 1;
      if (run.failureCount >= 3) { await this.finish(manager, run, 'server_error', now); return; }
      run.nextStepAt = new Date(now.getTime() + 5000); run.updatedAt = now; run.version += 1;
      await manager.getRepository(DemonTowerAutoRun).save(run);
      if (code !== 'DEMON_TOWER_ACTION_RATE_LIMIT') this.logger.warn('Automatic exploration rolled back and deferred; private error details suppressed.');
    });
  }
  private async fence(manager: EntityManager, run: DemonTowerAutoRun, session: AuthSession, now: Date): Promise<void> {
    const check = (at: Date, vipExpiresAt?: string | null): void => {
      if (!demonTowerAutoEnabled()) throw new StopAutomaticRun('maintenance');
      if (toBusinessLocalDate(at) !== run.serviceDate) throw new StopAutomaticRun('day_changed');
      if (at.getTime() >= run.expiresAt.getTime()) throw new StopAutomaticRun('time_limit');
      if (session.revokedAt !== null || at.getTime() >= session.expiresAt.getTime()) throw new StopAutomaticRun('session_ended');
      if (vipExpiresAt && at.getTime() >= Date.parse(vipExpiresAt)) throw new StopAutomaticRun('vip_expired');
    };
    check(now);
    let vip;
    try { vip = await this.membership.requireVip(manager, run.userId, now); }
    catch (error) {
      if (errorCode(error) === 'VIP_REQUIRED') throw new StopAutomaticRun('vip_expired');
      if (errorCode(error) === 'PROGRESSION_DISABLED') throw new StopAutomaticRun('maintenance');
      if (errorCode(error) === 'PROGRESSION_ACTIVE_ACCOUNT_REQUIRED') throw new StopAutomaticRun('account_inactive');
      throw error;
    }
    check(this.clock.now(), vip.expiresAt); // No await after this last authoritative-time check.
  }
  private async finish(manager: EntityManager, run: DemonTowerAutoRun, reason: DemonTowerAutoStopReason, now: Date): Promise<void> {
    run.status = reason === 'completed' ? 'completed' : 'stopped'; run.stopReason = reason;
    run.stoppedAt = now; run.updatedAt = now; run.version += 1;
    await manager.getRepository(DemonTowerAutoRun).save(run);
  }
  private query(manager: EntityManager) { return manager.getRepository(DemonTowerAutoRun).createQueryBuilder('run').addSelect(['run.originAuthSessionId', 'run.startRequestId', 'run.requestHash', 'run.failureCount']); }
  private async latest(manager: EntityManager, userId: string): Promise<DemonTowerAutoRun | null> {
    return await manager.getRepository(DemonTowerAutoRun).findOneBy({ userId, status: 'running' }) ?? manager.getRepository(DemonTowerAutoRun).findOne({ where: { userId }, order: { createdAt: 'DESC', id: 'DESC' } });
  }
  private profile(manager: EntityManager, userId: string) { return manager.getRepository(DemonTowerProfile).createQueryBuilder('profile').addSelect('profile.state').where('profile.user_id = :userId', { userId }).getOne(); }
  private async lockActiveUser(manager: EntityManager, userId: string): Promise<User> {
    const user = await manager.getRepository(User).createQueryBuilder('user').where('user.id = :userId', { userId }).setLock('for_no_key_update').getOne();
    if (!user || user.accountStatus !== 'active') throw new UnauthorizedException({ code: 'DEMON_TOWER_ACTIVE_ACCOUNT_REQUIRED' });
    return user;
  }
  private lockSession(manager: EntityManager, userId: string, id: string) { return manager.getRepository(AuthSession).createQueryBuilder('session').where('session.id = :id AND session.user_id = :userId', { id, userId }).setLock('for_no_key_update').getOne(); }
  private async response(manager: EntityManager, userId: string, run: DemonTowerAutoRun | null, replayed: boolean): Promise<DemonTowerAutoResponse> {
    return { enabled: demonTowerAutoEnabled(), replayed, run: run ? demonTowerAutoView(run) : null, overview: await this.tower.overviewInTransaction(manager, userId) };
  }
}
