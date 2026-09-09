import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { entities,User,WalletLedger } from '../../../database/entities';
import { migrations } from '../../../database/migrations';
import { PlatformAssetsService } from '../../platform/platform-assets.service';
import { OfficeHubService } from '../office-hub/office-hub.service';
import { TowerDefenseService } from './tower-defense.service';

/** Opt in only on a dedicated disposable test database; never guesses a production URL. */
const enabled=Boolean(process.env.TEST_PG_URL);
(enabled?describe:describe.skip)('workstation real PostgreSQL transactions',()=>{
  let db:DataSource,service:TowerDefenseService,office:OfficeHubService,assets:PlatformAssetsService;
  const users:string[]=[],old={...process.env};
  beforeAll(async()=>{
    const url=new URL(process.env.TEST_PG_URL!);const database=decodeURIComponent(url.pathname.slice(1));
    if(process.env.TEST_PG_ALLOW_INTEGRATION!=='true'||!/^webfish_test_[a-z0-9_]+$/.test(database))throw new Error('Requires TEST_PG_ALLOW_INTEGRATION=true and dedicated webfish_test_* database.');
    db=new DataSource({type:'postgres',url:process.env.TEST_PG_URL,entities,migrations,synchronize:false,migrationsRun:false,logging:false});await db.initialize();
    const identity=await db.query('SELECT current_database() AS name');if(identity[0]?.name!==database)throw new Error('Unexpected test database identity');
    await db.runMigrations();
    const existing=await db.query("SELECT count(*)::int AS total FROM users WHERE email NOT LIKE '%test.invalid' AND email NOT LIKE '%@example.invalid'");
    if(existing[0]?.total>0)throw new Error('Refusing test operations in a database containing non-synthetic accounts');
    process.env.FEATURE_COMMUNITY_WRITES_ENABLED='true';process.env.FEATURE_WORKSTATION_CAMPAIGN_ENABLED='true';process.env.FEATURE_OFFICE_HUB_ENABLED='true';
    assets=new PlatformAssetsService({now:()=>new Date()});office=new OfficeHubService(db,assets);service=new TowerDefenseService(db,assets,office);
  },60000);
  afterAll(async()=>{jest.restoreAllMocks();if(db?.isInitialized){for(const id of users)await db.getRepository(User).delete({id});await db.destroy();}process.env=old;});
  async function user():Promise<User>{const key=randomUUID();const actor=await db.getRepository(User).save(db.getRepository(User).create({email:`${key}@tower-pg.test.invalid`,username:`tp_${key.slice(0,9)}`,displayName:'隔离塔防测试',passwordHash:'synthetic-test-only',accountStatus:'active'}));users.push(actor.id);return actor;}
  const input=()=>({requestId:randomUUID(),mode:'story',chapter:1,job:'specialist'});
  async function terminal(actor:User){const first=await service.start(actor.id,input());const state={...first.run!.state,status:'won',score:4000,tick:300,defeated:30,campaign:{...first.run!.state.campaign!,completedWaves:2,bestStreak:2}};await db.query('UPDATE tower_defense_runs SET state=$2 WHERE id=$1',[first.run!.id,JSON.stringify(state)]);return first.run!;}
  it('serializes parallel starts so exactly one active run exists',async()=>{
    const actor=await user();const results=await Promise.allSettled([service.start(actor.id,input()),service.start(actor.id,input())]);expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);expect(await db.query('SELECT id FROM tower_defense_runs WHERE user_id=$1 AND settled_at IS NULL',[actor.id])).toHaveLength(1);
  });
  it('parallel identical revisions apply a purchase only once',async()=>{
    const actor=await user(),first=await service.start(actor.id,input());const body={runId:first.run!.id,revision:first.run!.revision,command:{type:'buy',offerId:'offer-1'}};
    const results=await Promise.allSettled([service.command(actor.id,body),service.command(actor.id,body)]);expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);expect((await service.overview(actor.id)).run!.state.credits).toBe(92);
  });
  it('simultaneous offline settlements grant one wallet ledger and one company contribution',async()=>{
    const actor=await user();await terminal(actor);await Promise.all([service.sync(actor.id,{}),service.sync(actor.id,{})]);
    expect(await db.getRepository(WalletLedger).count({where:{userId:actor.id,sourceType:'workstation_run'}})).toBe(1);const view=await service.overview(actor.id);expect(view.profile.experience).toBe(34);expect(view.reports).toHaveLength(1);expect(view.reports[0]!.coins).toBe(22);
    const events=await db.query('SELECT waves,score FROM office_hub_tower_events WHERE user_id=$1',[actor.id]);expect(events).toHaveLength(1);expect(events[0]).toMatchObject({waves:2,score:4000});
  });
  it('rolls back wallet/profile/run together if downstream company recording fails, then retries cleanly',async()=>{
    const actor=await user(),run=await terminal(actor);const failure=jest.spyOn(office,'recordTowerSettlement').mockRejectedValueOnce(new Error('isolated rollback rehearsal'));
    await expect(service.sync(actor.id,{})).rejects.toThrow('isolated rollback rehearsal');failure.mockRestore();
    expect(await db.getRepository(WalletLedger).count({where:{userId:actor.id,sourceType:'workstation_run'}})).toBe(0);expect((await db.query('SELECT settled_at FROM tower_defense_runs WHERE id=$1',[run.id]))[0].settled_at).toBeNull();expect((await service.overview(actor.id)).profile.experience).toBe(0);expect(await db.query('SELECT run_id FROM office_hub_tower_events WHERE user_id=$1',[actor.id])).toHaveLength(0);
    await service.sync(actor.id,{});expect(await db.getRepository(WalletLedger).count({where:{userId:actor.id,sourceType:'workstation_run'}})).toBe(1);
  });
  it('replica races on daily champion awards result in exactly one 12-coin grant',async()=>{
    const actor=await user(),run=await terminal(actor);await service.sync(actor.id,{});
    const past=new Date(Date.now()-2*86400000);await db.query('UPDATE tower_defense_runs SET settled_at=$2,score=999999 WHERE id=$1',[run.id,past]);
    const replica=new TowerDefenseService(db,assets,office);await Promise.all([service.settleDailyAwards(),replica.settleDailyAwards()]);await service.settleDailyAwards();
    expect(await db.getRepository(WalletLedger).count({where:{userId:actor.id,sourceType:'workstation_champion'}})).toBe(1);const awards=await db.query('SELECT coins FROM tower_defense_daily_awards WHERE user_id=$1',[actor.id]);expect(awards).toHaveLength(1);expect(awards[0].coins).toBe(12);
  });
});
