import { randomBytes, randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  applyWorkstationCommand, createWorkstationCampaign, stepWorkstationCampaign, workstationPromotion, workstationRewards,
  TOWER_DEFENSE_TICK_MS, WORKSTATION_JOBS,
  type TowerDefenseState, type WorkstationJob, type WorkstationMode, type WorkstationOverview, type WorkstationProfile, type WorkstationReport,
} from '@stealth-reader/shared';
import { PlatformAssetsService } from '../../platform/platform-assets.service';
import { toBusinessLocalDate } from '../../platform/platform-time';
import { OfficeHubService } from '../office-hub/office-hub.service';
import { assertWorkstationWrites, exact, integer, object, uuid, workstationCommand, workstationWritesEnabled } from './tower-defense.rules';

interface ProfileRow { user_id: string; experience: number; promotion_tier: number; unlocked_chapter: number; talents: WorkstationProfile['talents']; formation: WorkstationProfile['formation']; stats: WorkstationProfile['stats'] }
interface RunRow { id: string; user_id: string; mode: WorkstationMode; chapter: number; state: TowerDefenseState; revision: number; last_tick_at: Date; settled_at: Date | null; created_at: Date; score: number; successful_waves: number; stars: number; streak: number; coins: number }
const DEFAULT_PROFILE: WorkstationProfile = { experience: 0, promotionTier: 0, unlockedChapter: 1, talents: { output: 0, control: 0, economy: 0 }, talentPoints: 1, formation: [], stats: { runs: 0, wins: 0, waves: 0, bestScore: 0, bestStreak: 0, totalScore: 0, achievements: [] } };
const RULES = '正式局由服务器保存并按服务器时间推进，关闭页面后下次同步回放，不上传浏览器分数。每局至多 40 办公币，每日共 80；败局按实际基础收益 30% 结算，空局无奖励。每种模式昨日冠军 12 办公币。练习分不进入正式榜。无尽每局最多 60 波，离线回放不会重开新局。';

/** Bounded deterministic catch-up, no browser-provided time or score enters this path. */
export function advanceWorkstationRun(state: TowerDefenseState, lastTickAt: Date, now: Date, maxTicks = 1200): { state: TowerDefenseState; lastTickAt: Date; pending: boolean } {
  if (!['running','intermission'].includes(state.status)) return { state, lastTickAt: now, pending: false };
  const elapsed = Math.max(0, now.getTime() - lastTickAt.getTime());
  const due = Math.floor(elapsed / TOWER_DEFENSE_TICK_MS);
  let next = state;
  let applied = 0;
  for (; applied < Math.min(due, maxTicks); applied += 1) {
    next = stepWorkstationCampaign(next);
    if (!['running','intermission'].includes(next.status)) { applied += 1; break; }
  }
  const active = ['running','intermission'].includes(next.status);
  return { state: next, lastTickAt: active ? new Date(lastTickAt.getTime() + applied * TOWER_DEFENSE_TICK_MS) : now, pending: active && applied < due };
}

@Injectable()
export class TowerDefenseService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private awarding = false;
  private readonly logger = new Logger(TowerDefenseService.name);
  constructor(private readonly db: DataSource, private readonly assets: PlatformAssetsService, private readonly office: OfficeHubService) {}
  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => { void this.settleDailyAwards(); }, 60_000); this.timer.unref();
  }
  onModuleDestroy(): void { if (this.timer) clearInterval(this.timer); }

  async overview(userId: string): Promise<WorkstationOverview> {
    await this.active(this.db.manager, userId, false);
    return this.view(this.db.manager, userId);
  }
  async start(userId: string, raw: unknown): Promise<WorkstationOverview> {
    assertWorkstationWrites();
    const body = object(raw); exact(body, ['requestId','mode','chapter','job']);
    const requestId = uuid(body.requestId), chapter = integer(body.chapter, 1, 6);
    const mode = this.mode(body.mode), job = body.job;
    if (typeof job !== 'string' || !Object.prototype.hasOwnProperty.call(WORKSTATION_JOBS, job)) throw new BadRequestException({ code: 'WORKSTATION_JOB_INVALID' });
    return this.transaction(userId, async (manager, profile, now) => {
      const prior: RunRow[] = await manager.query('SELECT * FROM tower_defense_runs WHERE user_id=$1 AND request_id=$2', [userId, requestId]);
      if (prior[0]) {
        if (prior[0].mode !== mode || prior[0].chapter !== chapter || prior[0].state.campaign?.job !== job) throw new ConflictException({ code: 'WORKSTATION_REQUEST_REUSED' });
        return;
      }
      const active: RunRow[] = await manager.query('SELECT * FROM tower_defense_runs WHERE user_id=$1 AND settled_at IS NULL FOR UPDATE', [userId]);
      if (active.length) throw new ConflictException({ code: 'WORKSTATION_RUN_ACTIVE' });
      if (chapter > profile.unlocked_chapter) throw new BadRequestException({ code: 'WORKSTATION_CHAPTER_LOCKED' });
      const state = createWorkstationCampaign(randomBytes(4).readUInt32LE(), { job: job as WorkstationJob, mode, chapter, promotionTier: profile.promotion_tier, talents: profile.talents, weekday: new Date(now.getTime() + 8 * 3600000).getUTCDay() });
      await manager.query('INSERT INTO tower_defense_runs (id,user_id,request_id,mode,chapter,state,last_tick_at,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$7)', [randomUUID(),userId,requestId,mode,chapter,JSON.stringify(state),now]);
    });
  }

  async sync(userId: string, raw: unknown): Promise<WorkstationOverview> {
    assertWorkstationWrites(); exact(object(raw), []);
    return this.transaction(userId, async (manager, profile, now) => {
      const run = await this.latest(manager, userId, true);
      if (run && !run.settled_at) await this.advance(manager, profile, run, now);
    });
  }
  async command(userId: string, raw: unknown): Promise<WorkstationOverview> {
    assertWorkstationWrites();
    const body = object(raw); exact(body, ['runId','revision','command']);
    const runId = uuid(body.runId), revision = integer(body.revision, 1, 2000000000), command = workstationCommand(body.command);
    return this.transaction(userId, async (manager, profile, now) => {
      const run = await this.latest(manager, userId, true);
      if (!run || run.id !== runId) throw new NotFoundException({ code: 'WORKSTATION_RUN_NOT_FOUND' });
      if (run.revision !== revision) throw new ConflictException({ code: 'WORKSTATION_REVISION_CONFLICT' });
      if (run.settled_at) throw new ConflictException({ code: 'WORKSTATION_RUN_FINISHED' });
      const advanced = advanceWorkstationRun(run.state, new Date(run.last_tick_at), now);
      if (advanced.pending) throw new ConflictException({ code: 'WORKSTATION_CATCHUP_REQUIRED' });
      run.state = advanced.state; run.last_tick_at = advanced.lastTickAt;
      // A finished offline run cannot be revived by a late client command.
      if (!['won','lost'].includes(run.state.status)) run.state = applyWorkstationCommand(run.state, command);
      await this.persist(manager, profile, run, now);
    });
  }
  async talents(userId: string, raw: unknown): Promise<WorkstationOverview> {
    assertWorkstationWrites(); const body = object(raw); exact(body, ['output','control','economy','expectedTalents']);
    const talents = { output: integer(body.output,0,5), control: integer(body.control,0,5), economy: integer(body.economy,0,5) };
    let expected: WorkstationProfile['talents'] | undefined;
    if (body.expectedTalents !== undefined) {
      const value = object(body.expectedTalents); exact(value, ['output','control','economy']);
      expected = { output: integer(value.output,0,5), control: integer(value.control,0,5), economy: integer(value.economy,0,5) };
    }
    return this.transaction(userId, async (manager, profile) => {
      if (talents.output + talents.control + talents.economy > Math.min(15,1 + Math.floor(profile.experience / 120))) throw new BadRequestException({ code: 'WORKSTATION_TALENT_POINTS' });
      const same = (value: WorkstationProfile['talents']) => (['output','control','economy'] as const).every(key => value[key] === profile.talents[key]);
      // Replaying the same desired allocation is harmless even if its CAS
      // baseline predates the first response. A different stale draft is not.
      if (same(talents)) return;
      if (expected && !same(expected)) throw new ConflictException({ code: 'WORKSTATION_TALENTS_CONFLICT' });
      // Running/paused/preparation states retain campaign.talents captured by
      // createWorkstationCampaign. Only the NEXT run reads this profile plan.
      await manager.query('UPDATE tower_defense_profiles SET talents=$2 WHERE user_id=$1', [userId,JSON.stringify(talents)]);
    });
  }
  async formation(userId: string, raw: unknown): Promise<WorkstationOverview> {
    assertWorkstationWrites(); exact(object(raw), []);
    return this.transaction(userId, async (manager) => {
      const run = await this.latest(manager,userId,true);
      if (!run) throw new NotFoundException({ code: 'WORKSTATION_RUN_NOT_FOUND' });
      const formation = run.state.towers.map(({type,slotIndex}) => ({type,slotIndex}));
      await manager.query('UPDATE tower_defense_profiles SET formation=$2 WHERE user_id=$1', [userId,JSON.stringify(formation)]);
    });
  }

  async leaderboard(rawMode?: unknown, rawDate?: unknown) {
    const mode = this.mode(rawMode ?? 'story');
    const today = toBusinessLocalDate(new Date());
    const date = rawDate ?? today;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0,10) !== date || date > today) throw new BadRequestException({ code: 'WORKSTATION_DATE_INVALID' });
    const rows = await this.ranking(this.db.manager, mode, date);
    return { mode, date, items: rows.map((row: Record<string, unknown>, index: number) => ({ ...row, rank: index + 1 })), dailyChampionCoins: 12, rules: RULES };
  }
  private mode(value: unknown): WorkstationMode {
    if (value !== 'story' && value !== 'endless' && value !== 'extreme') throw new BadRequestException({ code: 'WORKSTATION_MODE_INVALID' });
    return value;
  }
  private async active(manager: EntityManager, userId: string, lock: boolean): Promise<void> {
    const rows = await manager.query(`SELECT id FROM users WHERE id=$1 AND account_status='active'${lock ? ' FOR NO KEY UPDATE' : ''}`, [userId]);
    if (!rows.length) throw new UnauthorizedException({ code: 'WORKSTATION_ACTIVE_ACCOUNT_REQUIRED' });
  }
  private async transaction(userId: string, operation: (manager: EntityManager, profile: ProfileRow, now: Date) => Promise<void>): Promise<WorkstationOverview> {
    return this.db.transaction(async (manager) => {
      assertWorkstationWrites(); await this.active(manager,userId,true);
      await manager.query('INSERT INTO tower_defense_profiles(user_id) VALUES ($1) ON CONFLICT DO NOTHING', [userId]);
      const rows: ProfileRow[] = await manager.query('SELECT * FROM tower_defense_profiles WHERE user_id=$1 FOR UPDATE', [userId]);
      const now = new Date();
      await operation(manager, rows[0]!, now);
      assertWorkstationWrites();
      return this.view(manager,userId);
    });
  }
  private async latest(manager: EntityManager, userId: string, lock = false): Promise<RunRow | null> {
    const rows: RunRow[] = await manager.query(`SELECT * FROM tower_defense_runs WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [userId]);
    return rows[0] ?? null;
  }
  private async advance(manager: EntityManager, profile: ProfileRow, run: RunRow, now: Date): Promise<void> {
    const result = advanceWorkstationRun(run.state,new Date(run.last_tick_at),now);
    run.state = result.state; run.last_tick_at = result.lastTickAt;
    await this.persist(manager,profile,run,now);
  }
  private async persist(manager: EntityManager, profile: ProfileRow, run: RunRow, now: Date): Promise<void> {
    // Recorded by successful server-engine merges, never inferred from a victory rating.
    if (run.state.campaign?.mergedThree && !profile.stats.achievements.includes('tower_first_three')) {
      profile.stats = {...profile.stats,achievements:[...profile.stats.achievements,'tower_first_three']};
      await manager.query('UPDATE tower_defense_profiles SET stats=$2 WHERE user_id=$1',[run.user_id,JSON.stringify(profile.stats)]);
    }
    if (!run.settled_at && ['won','lost'].includes(run.state.status)) {
      const reward = workstationRewards(run.state);
      const date = toBusinessLocalDate(now);
      const start = new Date(`${date}T00:00:00+08:00`), end = new Date(start.getTime()+86400000);
      const total: { coins: string; experience: string }[] = await manager.query('SELECT COALESCE(sum(coins),0)::text AS coins, count(*)::text AS experience FROM tower_defense_runs WHERE user_id=$1 AND settled_at >= $2 AND settled_at < $3', [run.user_id,start,end]);
      const coins = Math.min(reward.coins,Math.max(0,80 - Number(total[0]?.coins ?? 0)));
      // Growth cannot be farmed indefinitely with automated starts either: first 12 meaningful daily runs.
      const experience = Number(total[0]?.experience ?? 0) < 12 ? reward.experience : 0;
      const stats = { ...profile.stats, runs: profile.stats.runs + 1, wins: profile.stats.wins + (run.state.status === 'won' ? 1 : 0), waves: profile.stats.waves + reward.waves,
        bestScore: Math.max(profile.stats.bestScore,run.state.score), bestStreak: Math.max(profile.stats.bestStreak,reward.streak), totalScore: profile.stats.totalScore + run.state.score,
        achievements: [...new Set([...profile.stats.achievements,...reward.achievements,...(profile.stats.totalScore + run.state.score >= 10000 ? ['tower_score_10000'] : [])])] };
      const nextExperience = Math.min(100000000,profile.experience + experience), tier = workstationPromotion(nextExperience);
      const chapter = run.mode === 'story' && run.state.status === 'won' ? Math.max(profile.unlocked_chapter, Math.min(6,run.chapter + 1)) : profile.unlocked_chapter;
      if (coins > 0) await this.assets.creditWallet(manager,run.user_id,'office_coin',coins,{ sourceType: 'workstation_run',sourceId: run.id,reason: '工位防守可信结算',idempotencyKey: `workstation:run:${run.id}` });
      await manager.query('UPDATE tower_defense_profiles SET experience=$2,promotion_tier=$3,unlocked_chapter=$4,stats=$5 WHERE user_id=$1', [run.user_id,nextExperience,tier,chapter,JSON.stringify(stats)]);
      await this.office.recordTowerSettlement(manager,run.user_id,{ runId: run.id, successfulWaves: reward.waves,promotionTier: tier,score: run.state.score,stars: reward.stars,streak: reward.streak });
      await manager.query('UPDATE tower_defense_runs SET settled_at=$2,score=$3,successful_waves=$4,stars=$5,streak=$6,coins=$7 WHERE id=$1', [run.id,now,run.state.score,reward.waves,reward.stars,reward.streak,coins]);
    }
    await manager.query('UPDATE tower_defense_runs SET state=$2,revision=revision+1,last_tick_at=$3,updated_at=$4 WHERE id=$1', [run.id,JSON.stringify(run.state),run.last_tick_at,now]);
  }
  private async view(manager: EntityManager, userId: string): Promise<WorkstationOverview> {
    const profiles: ProfileRow[] = await manager.query('SELECT * FROM tower_defense_profiles WHERE user_id=$1',[userId]);
    const p = profiles[0];
    const run = await this.latest(manager,userId);
    const reports: RunRow[] = await manager.query('SELECT * FROM tower_defense_runs WHERE user_id=$1 AND settled_at IS NOT NULL ORDER BY settled_at DESC LIMIT 12',[userId]);
    return { appearance: await this.office.getAppearance(manager,userId), profile: p ? { experience:p.experience,promotionTier:p.promotion_tier,unlockedChapter:p.unlocked_chapter,talents:p.talents,formation:p.formation,stats:p.stats,talentPoints:Math.min(15,1+Math.floor(p.experience/120)) } : structuredClone(DEFAULT_PROFILE),
      run: run ? { id: run.id,state: run.state,revision: run.revision,catchupPending: !run.settled_at && ['running','intermission'].includes(run.state.status) && Date.now() - new Date(run.last_tick_at).getTime() >= TOWER_DEFENSE_TICK_MS * 2 } : null,
      reports: reports.map((r): WorkstationReport => ({ id:r.id,mode:r.mode,chapter:r.chapter,score:r.score,successfulWaves:r.successful_waves,stars:r.stars,streak:r.streak,coins:r.coins,outcome:r.state.status,settledAt:new Date(r.settled_at!).toISOString(),formation:r.state.towers.map(({type,slotIndex,level})=>({type,slotIndex,level})) })), writesEnabled:workstationWritesEnabled(),rules:RULES };
  }
  private ranking(manager: EntityManager, mode: WorkstationMode, date: string) {
    const start = new Date(`${date}T00:00:00+08:00`), end = new Date(start.getTime()+86400000);
    return manager.query(`SELECT public_id AS "publicId",COALESCE(display_name,username,'同事') AS "displayName",score,successful_waves AS waves,streak FROM (
      SELECT DISTINCT ON (u.id) u.id,u.public_id,u.display_name,u.username,r.score,r.successful_waves,r.streak,r.settled_at
      FROM tower_defense_runs r JOIN users u ON u.id=r.user_id WHERE u.account_status='active' AND r.mode=$1 AND r.score>0 AND r.settled_at >= $2 AND r.settled_at < $3
      ORDER BY u.id,r.score DESC,r.settled_at ASC,r.id ASC
    ) ranked ORDER BY score DESC,settled_at ASC,public_id ASC LIMIT 50`,[mode,start,end]);
  }
  async settleDailyAwards(): Promise<void> {
    if (this.awarding || !workstationWritesEnabled()) return;
    this.awarding = true;
    try {
      const cutoff = toBusinessLocalDate(new Date(Date.now() - 300000));
      const pending: { date: string; mode: WorkstationMode }[] = await this.db.query(`SELECT DISTINCT ((r.settled_at AT TIME ZONE 'Asia/Shanghai')::date)::text AS date,r.mode FROM tower_defense_runs r LEFT JOIN tower_defense_daily_awards a ON a.service_date=(r.settled_at AT TIME ZONE 'Asia/Shanghai')::date AND a.mode=r.mode WHERE r.score>0 AND (r.settled_at AT TIME ZONE 'Asia/Shanghai')::date<$1::date AND a.service_date IS NULL ORDER BY date,r.mode LIMIT 12`,[cutoff]);
      for (const entry of pending) await this.db.transaction(async (manager) => {
        assertWorkstationWrites();
        const claim = await manager.query('INSERT INTO tower_defense_daily_awards(service_date,mode,coins,created_at) VALUES($1,$2,0,now()) ON CONFLICT DO NOTHING RETURNING service_date',[entry.date,entry.mode]);
        if (!claim.length) return;
        const ranked = await this.ranking(manager,entry.mode,entry.date);
        for (const candidate of ranked) {
          const users: { id: string }[] = await manager.query("SELECT id FROM users WHERE public_id=$1 AND account_status='active' FOR NO KEY UPDATE",[candidate.publicId]);
          if (!users[0]) continue;
          const id = `${entry.date}:${entry.mode}`;
          await this.assets.creditWallet(manager,users[0].id,'office_coin',12,{sourceType:'workstation_champion',sourceId:id,reason:'工位塔防每日冠军',idempotencyKey:`workstation:champion:${id}`});
          await manager.query('UPDATE tower_defense_daily_awards SET user_id=$3,coins=12 WHERE service_date=$1 AND mode=$2',[entry.date,entry.mode,users[0].id]);
          assertWorkstationWrites(); break;
        }
      });
    } catch { this.logger.warn('Workstation daily award deferred; atomic claims retained for retry.'); }
    finally { this.awarding = false; }
  }
}
