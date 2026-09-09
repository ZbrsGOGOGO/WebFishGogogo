import { BadRequestException, ConflictException, HttpException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { DEMON_TOWER_CATALOG, type DemonTowerActionReceipt, type DemonTowerCatalog, type DemonTowerOverview } from '@stealth-reader/shared';
import { DataSource, EntityManager } from 'typeorm';
import { DemonTowerCommand, DemonTowerContribution, DemonTowerDailyProgress, DemonTowerProfile, DemonTowerWorldFloor, User, WalletBalance } from '../../../database/entities';
import { DemonTowerAutoRun } from '../../../database/entities/demon-tower-auto-run.entity';
import { PlatformAssetsService } from '../../platform/platform-assets.service';
import { PLATFORM_CLOCK, systemPlatformClock, type PlatformClock } from '../../platform/platform.constants';
import { toBusinessLocalDate } from '../../platform/platform-time';
import { hash } from '../play/play.rules';
import { actDemonTower, advanceDemonTowerState, createDemonTowerState, demonTowerProfileView, DemonTowerEngineError, type DemonTowerEngineResult, type DemonTowerEngineState, type DemonTowerWorldEffect } from './demon-tower.engine';
import { assertDemonTowerWrites, DEMON_TOWER_DAILY_ACTION_LIMIT, DEMON_TOWER_DAILY_COINS, demonTowerAction, demonTowerEnabled, demonTowerWorldView, demonTowerWritesEnabled, initialDemonTowerWorld } from './demon-tower.rules';
import { demonTowerAutoView } from './demon-tower-auto.rules';

interface StoredReceipt {
  events: string[]; officeCoinsGranted: number; effectiveBossDamage: number; passageContribution: number;
}

@Injectable()
export class DemonTowerService {
  constructor(
    private readonly db: DataSource,
    private readonly assets: PlatformAssetsService,
    @Inject(PLATFORM_CLOCK) private readonly clock: PlatformClock = systemPlatformClock,
  ) {}

  catalog(): DemonTowerCatalog { return { ...DEMON_TOWER_CATALOG, enabled: demonTowerEnabled() }; }

  async overview(userId: string): Promise<DemonTowerOverview> {
    return this.db.transaction(manager => this.overviewInTransaction(manager, userId));
  }
  /** Internal transaction composition. Never exposes a caller-provided user or automation bypass to HTTP. */
  async overviewInTransaction(manager: EntityManager, userId: string): Promise<DemonTowerOverview> {
      // Read requests also serialize against suspension/deletion, but never initialize or persist a save.
      await this.activeUser(manager, userId);
      return this.project(manager, userId, await this.profile(manager, userId));
  }

  async action(userId: string, raw: unknown): Promise<DemonTowerActionReceipt> {
    return this.db.transaction(manager => this.applyActionInTransaction(manager, userId, raw));
  }
  /** Worker owns the SAME transaction as its durable step. Do not call public action() from a locked worker. */
  async applyActionInTransaction(manager: EntityManager, userId: string, raw: unknown, auto?: { runId: string; fence: (now: Date) => Promise<void> }): Promise<DemonTowerActionReceipt> {
    assertDemonTowerWrites();
    const input = demonTowerAction(raw);
    const requestHash = hash({ expectedVersion: input.expectedVersion, kind: input.kind, payload: input.payload });
      await this.activeUser(manager, userId);
      assertDemonTowerWrites();
      const commandRepo = manager.getRepository(DemonTowerCommand);
      const previous = await commandRepo.createQueryBuilder('command').addSelect(['command.requestHash', 'command.receipt'])
        .where('command.user_id = :userId AND command.request_id = :requestId', { userId, requestId: input.requestId }).getOne();
      let profile = await this.profile(manager, userId);
      if (previous) {
        if (previous.requestHash !== requestHash) throw new ConflictException({ code: 'DEMON_TOWER_IDEMPOTENCY_CONFLICT' });
        if (!profile) throw new Error('Demon tower receipt invariant failed');
        // Receipt is immutable; current state and current balance are intentionally NOT stored in it.
        return { requestId: input.requestId, replayed: true, overview: await this.project(manager, userId, profile), ...this.receipt(previous.receipt) };
      }
      const running = await manager.getRepository(DemonTowerAutoRun).findOneBy({ userId, status: 'running' });
      if (running && running.id !== auto?.runId) throw new ConflictException({ code: 'DEMON_TOWER_AUTO_RUNNING' });
      if (auto && (!running || running.id !== auto.runId || !['explore', 'attack', 'skill'].includes(input.kind))) throw new ConflictException({ code: 'DEMON_TOWER_AUTO_NOT_RUNNING' });
      const version = profile?.version ?? 0;
      if (input.expectedVersion !== version) throw new ConflictException({ code: 'DEMON_TOWER_VERSION_CONFLICT', currentVersion: version });
      if (input.kind === 'enroll' && profile) throw new ConflictException({ code: 'DEMON_TOWER_ALREADY_ENROLLED' });
      if (input.kind !== 'enroll' && !profile) throw new ConflictException({ code: 'DEMON_TOWER_ENROLL_REQUIRED' });

      // The shared world is read and locked BEFORE simulation, so two final hits cannot race old HP.
      const worlds = await this.lockWorldInTransaction(manager);
      assertDemonTowerWrites();
      const now = this.clock.now(); // Time and business date are always taken after the potentially waiting locks.
      const serviceDate = toBusinessLocalDate(now);
      if (auto) await auto.fence(now);
      const world = demonTowerWorldView(worlds);
      if (input.kind === 'challenge_boss' || input.kind === 'donate') {
        // Bind the player's displayed target, not an ever-changing HP version. Same-floor cooperation remains valid.
        const floor = input.payload.floor;
        if (!Number.isInteger(floor) || floor < 1 || floor > 9) throw new BadRequestException({ code: 'DEMON_TOWER_INVALID_FLOOR' });
        if (floor !== world.currentFloor) throw new ConflictException({ code: 'DEMON_TOWER_WORLD_FLOOR_CHANGED' });
      }
      const dailyRepo = manager.getRepository(DemonTowerDailyProgress);
      const daily = await dailyRepo.findOneBy({ userId, serviceDate }) ?? dailyRepo.create({ userId, serviceDate, officeCoins: 0, bossDamage: 0, passageContribution: 0, bossAttempts: 0, actionCount: 0, level: 1, achievedAt: now, updatedAt: now });
      if (daily.actionCount >= DEMON_TOWER_DAILY_ACTION_LIMIT) throw new HttpException({ code: 'DEMON_TOWER_DAILY_ACTION_LIMIT' }, 429);
      if (input.kind === 'challenge_boss' && daily.bossAttempts >= DEMON_TOWER_CATALOG.rules.bossAttemptsPerDay) throw new ConflictException({ code: 'DEMON_TOWER_BOSS_DAILY_LIMIT' });
      if (profile?.actionWindowAt && now.getTime() - profile.actionWindowAt.getTime() < 1000 && profile.actionWindowCount >= 6) throw new HttpException({ code: 'DEMON_TOWER_ACTION_RATE_LIMIT' }, 429);

      let result: DemonTowerEngineResult;
      try {
        result = profile ? actDemonTower(this.state(profile), { kind: input.kind, payload: input.payload }, { now: now.getTime(), serviceDate, world })
          : { state: createDemonTowerState(now.getTime(), serviceDate, randomBytes(32).toString('hex')), events: ['九层妖塔角色已建立，初始装备与基础技能已入库；全程免费。'], worldEffect: null, officeCoinIntent: 0 };
      } catch (error) { this.rethrowEngine(error); }
      if (!Number.isSafeInteger(result!.officeCoinIntent) || result!.officeCoinIntent < 0 || result!.officeCoinIntent > DEMON_TOWER_DAILY_COINS) throw new Error('Demon tower reward invariant failed');
      if ((result!.worldEffect?.kind === 'boss_damage') !== (input.kind === 'challenge_boss') || (result!.worldEffect?.kind === 'construction') !== (input.kind === 'donate')) throw new Error('Demon tower action effect invariant failed');
      const applied = await this.applyWorld(manager, worlds, result!.worldEffect, now);
      // The only mutable copy is our fresh engine result; logs never carry account names or wallet balances.
      if (result!.worldEffect?.kind === 'boss_damage' && result!.state.lastReport?.kind === 'boss') result!.state.lastReport.damage = applied.effectiveBossDamage;
      const officeCoinsGranted = Math.min(DEMON_TOWER_DAILY_COINS - daily.officeCoins, result!.officeCoinIntent);
      const stored: StoredReceipt = {
        events: [...result!.events, ...applied.events].slice(-12).map((event) => event.slice(0, 240)),
        officeCoinsGranted, effectiveBossDamage: applied.effectiveBossDamage, passageContribution: applied.passageContribution,
      };
      if (result!.officeCoinIntent > officeCoinsGranted) stored.events.push('已达到妖塔当日日常办公币上限；经验与绑定材料正常结算。');
      if (!profile) {
        profile = manager.getRepository(DemonTowerProfile).create({ userId, version: 1, state: result!.state as unknown as Record<string, unknown>, actionWindowAt: now, actionWindowCount: 1, createdAt: now, updatedAt: now });
      } else {
        if (!profile.actionWindowAt || now.getTime() - profile.actionWindowAt.getTime() >= 1000) { profile.actionWindowAt = now; profile.actionWindowCount = 0; }
        profile.actionWindowCount += 1; profile.version += 1; profile.updatedAt = now;
        profile.state = result!.state as unknown as Record<string, unknown>;
      }
      daily.actionCount += 1; daily.officeCoins += officeCoinsGranted; daily.level = result!.state.level; daily.updatedAt = now;
      if (input.kind === 'challenge_boss') daily.bossAttempts += 1;
      if (applied.effectiveBossDamage > 0) { daily.bossDamage += applied.effectiveBossDamage; daily.achievedAt = now; }
      daily.passageContribution += applied.passageContribution;
      await manager.getRepository(DemonTowerProfile).save(profile);
      await dailyRepo.save(daily);
      if (result!.worldEffect && (applied.effectiveBossDamage > 0 || applied.passageContribution > 0)) {
        const repo = manager.getRepository(DemonTowerContribution);
        const contribution = await repo.findOneBy({ floor: result!.worldEffect.floor, userId }) ?? repo.create({ floor: result!.worldEffect.floor, userId, bossDamage: 0, passageContribution: 0, level: result!.state.level, updatedAt: now });
        contribution.bossDamage += applied.effectiveBossDamage; contribution.passageContribution += applied.passageContribution;
        contribution.level = result!.state.level; contribution.updatedAt = now;
        await repo.save(contribution);
      }
      if (officeCoinsGranted > 0) {
        await this.assets.grantReward(manager, { userId, sourceType: 'demon_tower_action', sourceId: input.requestId, ruleKey: 'demon-tower-action-v1', reward: { currencies: { office_coin: officeCoinsGranted } } });
      }
      assertDemonTowerWrites(); // Also covers a maintenance switch while waiting on downstream wallet locks.
      await commandRepo.insert({ userId, requestId: input.requestId, kind: input.kind, expectedVersion: input.expectedVersion, appliedVersion: profile.version, requestHash, receipt: stored, createdAt: now });
      const overview = await this.project(manager, userId, profile, worlds, now);
      // Wallet locks or even the final projection may cross midnight after simulation. Never commit
      // yesterday's contribution/quota with today's credit: roll back the entire still-open transaction.
      // An unconsumed request UUID can then be retried against the unchanged save on the new day.
      assertDemonTowerWrites();
      if (auto) await auto.fence(this.clock.now());
      if (toBusinessLocalDate(this.clock.now()) !== serviceDate) throw new ConflictException({ code: 'DEMON_TOWER_DAY_CHANGED' });
      return { requestId: input.requestId, replayed: false, overview, ...stored };
  }

  private async activeUser(manager: EntityManager, userId: string): Promise<User> {
    const user = await manager.getRepository(User).createQueryBuilder('user')
      .where('user.id = :userId AND user.account_status = :status', { userId, status: 'active' }).setLock('for_no_key_update').getOne();
    if (!user || user.accountStatus !== 'active') throw new UnauthorizedException({ code: 'DEMON_TOWER_ACTIVE_ACCOUNT_REQUIRED' });
    return user;
  }
  private profile(manager: EntityManager, userId: string): Promise<DemonTowerProfile | null> {
    return manager.getRepository(DemonTowerProfile).createQueryBuilder('profile').addSelect('profile.state').where('profile.user_id = :userId', { userId }).getOne();
  }
  private state(profile: DemonTowerProfile): DemonTowerEngineState { return profile.state as unknown as DemonTowerEngineState; }
  async lockWorldInTransaction(manager: EntityManager): Promise<DemonTowerWorldFloor[]> {
    const repo = manager.getRepository(DemonTowerWorldFloor);
    if (!await repo.exist()) {
      await repo.createQueryBuilder().insert().values(initialDemonTowerWorld(this.clock.now())).orIgnore().execute();
    }
    const rows = await repo.createQueryBuilder('world').orderBy('world.floor', 'ASC').setLock('pessimistic_write').getMany();
    demonTowerWorldView(rows); // Enforce the complete nine-row invariant, including after a concurrent first enrollment.
    return rows;
  }
  private async project(manager: EntityManager, userId: string, profile: DemonTowerProfile | null, worlds?: DemonTowerWorldFloor[], providedNow?: Date): Promise<DemonTowerOverview> {
    const now = providedNow ?? this.clock.now();
    const writesEnabled = demonTowerWritesEnabled();
    const state = profile ? writesEnabled ? advanceDemonTowerState(this.state(profile), now.getTime(), toBusinessLocalDate(now)) : this.state(profile) : null;
    const daily = profile ? await manager.getRepository(DemonTowerDailyProgress).findOneBy({ userId, serviceDate: state!.daily.serviceDate }) : null;
    const wallet = await manager.getRepository(WalletBalance).findOneBy({ userId, currency: 'office_coin' });
    const balance = Number(wallet?.balance ?? 0);
    if (!Number.isSafeInteger(balance) || balance < 0) throw new Error('Demon tower wallet invariant failed');
    const auto = await manager.getRepository(DemonTowerAutoRun).findOneBy({ userId, status: 'running' }) ?? await manager.getRepository(DemonTowerAutoRun).findOne({ where: { userId }, order: { createdAt: 'DESC', id: 'DESC' } });
    const profileView = profile && state ? demonTowerProfileView(state, now.getTime(), profile.version, daily?.officeCoins ?? 0) : null;
    if (profileView && auto?.status === 'running') profileView.availableActions = [];
    return {
      serverNow: now.getTime(), profile: profileView, autoExplore: auto ? demonTowerAutoView(auto) : null,
      world: demonTowerWorldView(worlds ?? await manager.getRepository(DemonTowerWorldFloor).find({ order: { floor: 'ASC' } })),
      wallet: { officeCoinBalance: balance }, writesEnabled,
    };
  }
  private receipt(raw: Record<string, unknown>): StoredReceipt {
    if (!Array.isArray(raw.events) || raw.events.length > 13 || raw.events.some((event) => typeof event !== 'string' || event.length > 240)) throw new Error('Demon tower receipt invariant failed');
    for (const key of ['officeCoinsGranted', 'effectiveBossDamage', 'passageContribution']) if (!Number.isSafeInteger(raw[key]) || (raw[key] as number) < 0) throw new Error('Demon tower receipt invariant failed');
    return { events: [...raw.events], officeCoinsGranted: raw.officeCoinsGranted as number, effectiveBossDamage: raw.effectiveBossDamage as number, passageContribution: raw.passageContribution as number };
  }
  private async applyWorld(manager: EntityManager, worlds: DemonTowerWorldFloor[], effect: DemonTowerWorldEffect | null, now: Date): Promise<{ effectiveBossDamage: number; passageContribution: number; events: string[] }> {
    const result = { effectiveBossDamage: 0, passageContribution: 0, events: [] as string[] };
    if (!effect) return result;
    const current = demonTowerWorldView(worlds);
    if (effect.floor !== current.currentFloor || !Number.isSafeInteger(effect.amount) || effect.amount < 0) throw new Error('Demon tower world effect invariant failed');
    const row = worlds[effect.floor - 1];
    if (effect.kind === 'boss_damage') {
      if (current.phase !== 'boss' || row.bossHp <= 0) throw new ConflictException({ code: 'DEMON_TOWER_BOSS_UNAVAILABLE' });
      result.effectiveBossDamage = Math.min(effect.amount, row.bossHp);
      if (!result.effectiveBossDamage) return result;
      row.bossHp -= result.effectiveBossDamage;
      if (row.bossHp === 0) { row.defeatedAt = now; result.events.push('本层守关者已被全服合力击败，通道建设现已开放。'); }
    } else if (effect.kind === 'construction') {
      if (current.phase !== 'passage' || row.passageProgress >= row.passageRequired) throw new ConflictException({ code: 'DEMON_TOWER_PASSAGE_UNAVAILABLE' });
      if (effect.amount <= 0 || effect.amount > row.passageRequired - row.passageProgress) throw new Error('Demon tower construction invariant failed');
      result.passageContribution = effect.amount; row.passageProgress += effect.amount;
      if (row.passageProgress === row.passageRequired) {
        row.completedAt = now;
        if (row.floor < 9) {
          const next = worlds[row.floor];
          if (next.unlockedAt !== null) throw new Error('Demon tower unlock invariant failed');
          next.unlockedAt = now; next.updatedAt = now; next.version += 1;
          await manager.getRepository(DemonTowerWorldFloor).save(next);
          result.events.push(`第${row.floor + 1}层已解锁，达到个人等级要求即可前往；无需补打已击败的守关者。`);
        } else result.events.push('九层通道全部贯通，已解锁楼层仍可自由探索。');
      }
    } else throw new Error('Demon tower world effect invariant failed');
    row.version += 1; row.updatedAt = now;
    await manager.getRepository(DemonTowerWorldFloor).save(row);
    return result;
  }
  private rethrowEngine(error: unknown): never {
    if (error instanceof DemonTowerEngineError) {
      const body = { code: `DEMON_TOWER_${error.code}` };
      if (error.code.startsWith('INVALID_')) throw new BadRequestException(body);
      throw new ConflictException(body);
    }
    throw error;
  }
}
