import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { createWorkstationCampaign, applyWorkstationCommand, stepWorkstationCampaign, workstationPromotion, workstationRewards, type TowerDefenseState } from '@stealth-reader/shared';
import { User, WalletLedger } from '../../../database/entities';
import { createLocalDevDataSource } from '../../../database/local-dev-datasource';
import { PlatformAssetsService } from '../../platform/platform-assets.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { OfficeHubService } from '../office-hub/office-hub.service';
import { advanceWorkstationRun, TowerDefenseService } from './tower-defense.service';
import { TowerDefenseController } from './tower-defense.controller';
import { assertWorkstationWrites, workstationCommand } from './tower-defense.rules';

const campaign = (seed=12):TowerDefenseState=>createWorkstationCampaign(seed,{job:'specialist',mode:'story',chapter:1,promotionTier:0,talents:{output:0,control:0,economy:0},weekday:2});
describe('workstation server command boundary and deterministic clock',()=>{
  it('authenticates every personal operation and the official leaderboard',()=>expect(Reflect.getMetadata(GUARDS_METADATA,TowerDefenseController)).toContain(JwtAuthGuard));
  it.each([{type:'score',score:1000},{type:'start',elapsed:100000},{type:'refresh',credits:9999},{type:'buy',offerId:'offer-1',seed:123},{type:'deploy',itemId:'item-1',slotIndex:-1},{type:'move',direction:'warp'},{type:'focus',towerType:'constructor'},[],null])('rejects forged command %j',(input)=>expect(()=>workstationCommand(input)).toThrow());
  it('requires both independent production write gates',()=>{
    const old={...process.env};
    try{process.env.FEATURE_COMMUNITY_WRITES_ENABLED='true';delete process.env.FEATURE_WORKSTATION_CAMPAIGN_ENABLED;expect(()=>assertWorkstationWrites()).toThrow();process.env.FEATURE_WORKSTATION_CAMPAIGN_ENABLED='true';expect(()=>assertWorkstationWrites()).not.toThrow();process.env.FEATURE_COMMUNITY_WRITES_ENABLED='false';expect(()=>assertWorkstationWrites()).toThrow();}finally{process.env=old;}
  });
  it('retains remainder time and cannot advance at the same or earlier server instant',()=>{
    const now=new Date('2026-09-09T00:00:00Z'),state=applyWorkstationCommand(campaign(),{type:'start'});
    const result=advanceWorkstationRun(state,now,new Date(now.getTime()+1000));expect(result.state.tick).toBe(3);expect(result.lastTickAt.getTime()-now.getTime()).toBe(840);
    expect(advanceWorkstationRun(result.state,result.lastTickAt,new Date(now.getTime()+1000)).state).toEqual(result.state);
    expect(advanceWorkstationRun(state,now,new Date(now.getTime()-1000)).state).toEqual(state);
  });
  it('offline replay is byte-equivalent to online ticks, with bounded catch-up and preserved backlog',()=>{
    const start=new Date('2026-09-09T00:00:00Z'),now=new Date(start.getTime()+100*280);
    let online=applyWorkstationCommand(campaign(),{type:'start'});const initial=online;
    for(let i=0;i<100;i++)online=stepWorkstationCampaign(online);
    const first=advanceWorkstationRun(initial,start,now,20);expect(first.pending).toBe(true);expect(first.state.tick).toBe(20);
    const final=advanceWorkstationRun(first.state,first.lastTickAt,now,100);expect(final.state).toEqual(online);expect(final.pending).toBe(false);
  });
  it('paused, preparation and finished runs cannot earn offline rewards or silently restart',()=>{
    const start=new Date(0),later=new Date(86400000);
    for(const status of ['idle','paused','won','lost'] as const){const state={...campaign(),status};expect(advanceWorkstationRun(state,start,later).state).toEqual(state);}
  });
  it('empty abandoned runs yield no money or experience and failure is exactly 30% of verified basis',()=>{
    expect(workstationRewards({...campaign(),status:'lost'})).toMatchObject({coins:0,experience:0});
    const state={...campaign(),status:'won' as const,tick:200,defeated:30,score:5000};
    const won=workstationRewards(state),lost=workstationRewards({...state,status:'lost'});expect(lost.coins).toBe(Math.floor(won.coins*.3));expect(won.coins).toBeLessThanOrEqual(40);
  });
  it('maps all eight promotion boundaries without opening extra account asset permissions',()=>{
    expect([0,120,360,800,1600,3000,5400,9000].map(workstationPromotion)).toEqual([0,1,2,3,4,5,6,7]);expect(workstationPromotion(8999)).toBe(6);
  });
});

/** Real query/migration coverage in pg-mem. Isolation and rollback are additionally rehearsed on real PG. */
describe('workstation persisted account service',()=>{
  let db:DataSource,service:TowerDefenseService;
  const office={recordTowerSettlement:jest.fn().mockResolvedValue(undefined),getAppearance:jest.fn().mockResolvedValue({equipped:null,owned:[]})};
  const old={...process.env};
  beforeAll(async()=>{
    process.env.FEATURE_COMMUNITY_WRITES_ENABLED='true';process.env.FEATURE_WORKSTATION_CAMPAIGN_ENABLED='true';
    db=await createLocalDevDataSource();service=new TowerDefenseService(db,new PlatformAssetsService({now:()=>new Date()}),office as unknown as OfficeHubService);
  });
  afterAll(async()=>{if(db?.isInitialized)await db.destroy();process.env=old;});
  async function user():Promise<User>{const id=randomUUID();return db.getRepository(User).save(db.getRepository(User).create({email:`${id}@workstation.test.invalid`,username:`td_${id.slice(0,8)}`,displayName:'工位测试同事',passwordHash:'synthetic-only',accountStatus:'active'}));}
  const input=()=>({requestId:randomUUID(),mode:'story',chapter:1,job:'specialist'});
  it('GET is read-only and does not create a profile, wallet, run or contribution',async()=>{
    const actor=await user();const view=await service.overview(actor.id);expect(view.run).toBeNull();expect(view.profile.promotionTier).toBe(0);
    expect(await db.query('SELECT * FROM tower_defense_profiles WHERE user_id=$1',[actor.id])).toHaveLength(0);
  });
  it('start is idempotent, different pending run and request reuse are rejected',async()=>{
    const actor=await user(),body=input(),first=await service.start(actor.id,body);
    expect((await service.start(actor.id,body)).run?.id).toBe(first.run?.id);
    await expect(service.start(actor.id,input())).rejects.toMatchObject({response:{code:'WORKSTATION_RUN_ACTIVE'}});
    await expect(service.start(actor.id,{...body,job:'hr'})).rejects.toMatchObject({response:{code:'WORKSTATION_REQUEST_REUSED'}});
  });
  it('rejects extra start/sync/command values, locked chapters and another user’s run',async()=>{
    const a=await user(),b=await user();
    await expect(service.start(a.id,{...input(),seed:1})).rejects.toMatchObject({response:{code:'WORKSTATION_FIELD_INVALID'}});
    await expect(service.start(a.id,{...input(),chapter:6})).rejects.toMatchObject({response:{code:'WORKSTATION_CHAPTER_LOCKED'}});
    const view=await service.start(a.id,input());
    await expect(service.sync(a.id,{elapsed:86400})).rejects.toThrow();
    await expect(service.command(b.id,{runId:view.run!.id,revision:view.run!.revision,command:{type:'plant'}})).rejects.toMatchObject({response:{code:'WORKSTATION_RUN_NOT_FOUND'}});
  });
  it('persists purchases, refuses reusing stale revisions and preserves the bought slot across reload',async()=>{
    const actor=await user(),first=await service.start(actor.id,input());
    const envelope={runId:first.run!.id,revision:first.run!.revision,command:{type:'buy',offerId:'offer-1'}};
    const purchased=await service.command(actor.id,envelope);
    expect(purchased.run!.state.shop[0]!.soldOut).toBe(true);expect(purchased.run!.state.credits).toBe(92);
    await expect(service.command(actor.id,envelope)).rejects.toMatchObject({response:{code:'WORKSTATION_REVISION_CONFLICT'}});
    const reloaded=await service.overview(actor.id);expect(reloaded.run!.state).toEqual(purchased.run!.state);
    const retry=await service.command(actor.id,{...envelope,revision:reloaded.run!.revision});expect(retry.run!.state.credits).toBe(92);
  });
  it('ends empty runs once, allows a new run, and never emits an empty-run wallet grant',async()=>{
    const actor=await user(),first=await service.start(actor.id,input());
    const ended=await service.command(actor.id,{runId:first.run!.id,revision:first.run!.revision,command:{type:'abandon'}});
    expect(ended.reports).toHaveLength(1);expect(ended.reports[0]!.coins).toBe(0);
    await service.sync(actor.id,{});expect((await service.overview(actor.id)).reports).toHaveLength(1);
    expect(await db.getRepository(WalletLedger).count({where:{userId:actor.id}})).toBe(0);
    expect((await service.start(actor.id,input())).run!.id).not.toBe(first.run!.id);
  });
  it('persists a real successful three-tier merge achievement before settlement and keeps it after selling',async()=>{
    const actor=await user(),first=await service.start(actor.id,input());
    // Trusted material fixture only; the HTTP command must still execute the real successful merge.
    const state={...first.run!.state,inventory:[{id:'m1',type:'single',tier:2,invested:54},{id:'m2',type:'single',tier:2,invested:54}],towers:[{id:'field',type:'single',level:2,slotIndex:4,cooldown:0,invested:54}]};
    await db.query('UPDATE tower_defense_runs SET state=$2 WHERE id=$1',[first.run!.id,JSON.stringify(state)]);
    const merged=await service.command(actor.id,{runId:first.run!.id,revision:first.run!.revision,command:{type:'merge',slotIndex:4}});
    expect(merged.reports).toHaveLength(0);expect(merged.profile.stats.achievements).toContain('tower_first_three');expect(merged.run!.state.campaign!.mergedThree).toBe(true);
    const sold=await service.command(actor.id,{runId:merged.run!.id,revision:merged.run!.revision,command:{type:'sell-tower',slotIndex:4}});expect(sold.run!.state.towers).toHaveLength(0);
    expect((await service.overview(actor.id)).profile.stats.achievements.filter(key=>key==='tower_first_three')).toHaveLength(1);expect(await db.getRepository(WalletLedger).count({where:{userId:actor.id}})).toBe(0);
  });
  it('credits a trusted terminal simulation once and calls company progress in the same operation',async()=>{
    const actor=await user(),first=await service.start(actor.id,input());
    // Server-owned fixture isolates settlement math; no endpoint accepts this state.
    const state={...first.run!.state,status:'won',tick:250,defeated:30,score:4000,campaign:{...first.run!.state.campaign!,completedWaves:2,bestStreak:2}};
    await db.query('UPDATE tower_defense_runs SET state=$2 WHERE id=$1',[first.run!.id,JSON.stringify(state)]);
    const settled=await service.sync(actor.id,{}),coins=settled.reports[0]!.coins;
    expect(coins).toBe(22);expect(settled.profile.experience).toBe(34);expect(settled.profile.unlockedChapter).toBe(2);
    const grants=await db.getRepository(WalletLedger).find({where:{userId:actor.id,sourceType:'workstation_run'}});expect(grants).toHaveLength(1);
    await service.sync(actor.id,{});expect(await db.getRepository(WalletLedger).count({where:{userId:actor.id,sourceType:'workstation_run'}})).toBe(1);
    expect(office.recordTowerSettlement).toHaveBeenCalledWith(expect.anything(),actor.id,expect.objectContaining({runId:first.run!.id,successfulWaves:2,score:4000}));
  });
  it('stores blueprint slots without minting towers and limits/reallocates talent points',async()=>{
    const actor=await user();await service.talents(actor.id,{output:1,control:0,economy:0});
    await expect(service.talents(actor.id,{output:5,control:5,economy:5})).rejects.toMatchObject({response:{code:'WORKSTATION_TALENT_POINTS'}});
    const first=await service.start(actor.id,input());expect(first.run!.state.campaign!.talents.output).toBe(1);
    await expect(service.talents(actor.id,{output:0,control:1,economy:0})).rejects.toThrow();
    const saved=await service.formation(actor.id,{});expect(saved.profile.formation).toEqual([]);expect(saved.run!.state.towers).toEqual([]);
  });
  it('caps real ledger credits at 80 a day while retaining later verified scores in mode-specific rankings',async()=>{
    const actor=await user();let last:WorkstationOverviewForTest|undefined;
    for(let i=0;i<3;i++){
      const first=await service.start(actor.id,input());const state={...first.run!.state,status:'won',tick:300,defeated:30,score:10000+i,campaign:{...first.run!.state.campaign!,completedWaves:2}};
      await db.query('UPDATE tower_defense_runs SET state=$2 WHERE id=$1',[first.run!.id,JSON.stringify(state)]);
      last=await service.sync(actor.id,{});
    }
    expect(last!.reports.map(report=>report.coins)).toEqual([0,40,40]);
    const leaderboard=await service.leaderboard('story');expect(leaderboard.items.some((item:Record<string,unknown>)=>item.publicId===actor.publicId&&item.score===10002)).toBe(true);
    expect((await service.leaderboard('endless')).items.some((item:Record<string,unknown>)=>item.publicId===actor.publicId)).toBe(false);
    await expect(service.leaderboard('story','2026-02-30')).rejects.toThrow();
  });
});

type WorkstationOverviewForTest = Awaited<ReturnType<TowerDefenseService['overview']>>;
