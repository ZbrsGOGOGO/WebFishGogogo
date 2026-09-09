import { describe,it,expect } from 'vitest';
import * as e from './tower-defense-logic';
function state(options:Partial<Parameters<typeof e.createWorkstationCampaign>[1]>={}):e.TowerDefenseState{
  return e.createWorkstationCampaign(123,{job:'specialist',mode:'story',chapter:1,promotionTier:0,talents:{output:0,control:0,economy:0},weekday:2,...options});
}
describe('official campaign gameplay',()=>{
  it('uses an explicit start, five-second preparation, skippable GO and automatic next wave',()=>{
    let run=e.applyWorkstationCommand(state(),{type:'start'});expect(run.campaign!.countdown).toBe(18);
    run=e.stepWorkstationCampaign(run);expect(run.enemies).toHaveLength(0);
    run=e.applyWorkstationCommand(run,{type:'go'});run=e.stepWorkstationCampaign(run);expect(run.enemies).toHaveLength(1);
    run={...run,status:'intermission',campaign:{...run.campaign!,countdown:2}};
    run=e.stepWorkstationCampaign(e.stepWorkstationCampaign(run));expect(run.wave).toBe(2);expect(run.status).toBe('running');
  });
  it('keeps chapter and endless waves increasing, not an empty won screen after the second wave',()=>{
    expect(e.campaignSpawns(4,1,'endless')[0]!.hp).toBeGreaterThan(e.campaignSpawns(2,1,'endless')[0]!.hp);
    expect(e.campaignSpawns(2,6,'story')[0]!.hp).toBeGreaterThan(e.campaignSpawns(2,1,'story')[0]!.hp);
    const run=state({mode:'endless'});expect(run.campaign!.totalWaves).toBe(60);
    const next=e.stepWorkstationCampaign({...run,status:'running',wave:2,spawnQueue:[],enemies:[]});expect(next.status).toBe('intermission');
    expect(e.applyWorkstationCommand(next,{type:'go'}).spawnQueue.length).toBeGreaterThan(0);
  });
  it('makes strict first-wave qualification an actual extreme-mode rule',()=>{
    const base=state({mode:'extreme'});
    const failed=e.stepWorkstationCampaign({...base,status:'running',spawnQueue:[],enemies:[]});expect(failed.status).toBe('lost');expect(failed.lastAction?.message).toContain('三星');
    const good=e.stepWorkstationCampaign({...base,status:'running',spawnQueue:[],enemies:[],towers:[{id:'field',type:'single',level:3,slotIndex:4,cooldown:0,invested:162}]});expect(good.status).toBe('intermission');
    expect(e.stepWorkstationCampaign({...base,status:'running',breached:1,spawnQueue:[],enemies:[],towers:good.towers}).status).toBe('lost');
  });
  it('opens more real tower slots through promotion but never mints blueprint towers',()=>{
    const low=state(),high=state({promotionTier:7});
    const item={id:'item-1',type:'single' as const,tier:2 as const,invested:54};
    expect(e.deployInventoryTower({...low,inventory:[item]},item.id,8).ok).toBe(false);
    expect(e.deployInventoryTower({...high,inventory:[item]},item.id,8).ok).toBe(true);
    expect(high.towers).toHaveLength(0);
  });
  it('uses deterministic 5% rare flash offers with no rare price or paid power increase',()=>{
    let run=state(),rare=0,total=0;run={...run,credits:100000};
    for(let i=0;i<500;i++){run=e.refreshTowerDefenseShop(run).state;for(const offer of run.shop.slice(0,4)){total++;if(offer.rarity!=='R')rare++;expect(offer.tier).toBe(1);expect(offer.cost).toBe(e.TOWER_DEFINITIONS[offer.type].partCost);}}
    expect(rare/total).toBeGreaterThan(.035);expect(rare/total).toBeLessThan(.07);
  });
  it('controls real guard durability and plant damage, rather than cosmetic-only red flashes',()=>{
    const base=state();const enemy:e.TowerDefenseEnemy={id:'breach',name:'稽查',pathIndex:14,hp:99,maxHp:99,speedTicks:1,slowTicks:0,shredTicks:0,shredStacks:0,archetype:'elite',armor:99,singleTargetDamageCap:null,reward:1,score:1,coreDamage:3,boss:false};
    const near=e.stepTowerDefense({...base,status:'running',spawnQueue:[],hero:{...base.hero,x:11,y:6,autoCooldown:999},enemies:[enemy]});
    expect(near.hero.hp).toBe(10);expect(near.coreHp).toBe(8);expect(near.campaign!.plantHurtTick).toBe(1);expect(near.hero.hurtTick).toBe(1);
    const away=e.stepTowerDefense({...base,status:'running',spawnQueue:[],hero:{...base.hero,x:0,y:0,autoCooldown:999},enemies:[enemy]});expect(away.coreHp).toBe(7);
  });
  it('lets the guard collect a moving bag once with temporary combat boost',()=>{
    const base=state();const run={...base,campaign:{...base.campaign!,bag:{x:8,y:6,coins:50,expires:36}}};
    const next=e.applyWorkstationCommand(run,{type:'move',direction:'right'});expect(next.credits).toBe(160);expect(next.campaign!.bag).toBeNull();expect(next.campaign!.boostUntil).toBe(11);
    expect(e.applyWorkstationCommand(next,{type:'move',direction:'left'}).credits).toBe(160);
  });
  it('Sunday rest creates a real 60-second refill window and does not advance enemies',()=>{
    const base=state({weekday:0});let run=e.applyWorkstationCommand({...base,status:'intermission',plantLevel:1},{type:'next'});
    expect(run.campaign!.event).toContain('60 秒');const count=run.spawnQueue.length;
    for(let i=0;i<214;i++)run=e.stepWorkstationCampaign(run);
    expect(run.spawnQueue).toHaveLength(count);expect(run.enemies).toHaveLength(0);expect(run.credits).toBeGreaterThan(base.credits);
    run=e.stepWorkstationCampaign(e.stepWorkstationCampaign(run));expect(run.enemies.length).toBeGreaterThan(0);
  });
  it('three and five perfect waves earn real streak multipliers, a breach resets the chain',()=>{
    const base=state({mode:'endless'});let run={...base,status:'running' as const,wave:3,spawnQueue:[],campaign:{...base.campaign!,streak:2}};
    let next=e.stepWorkstationCampaign(run);expect(next.campaign!.streak).toBe(3);expect(next.campaign!.bestStreak).toBe(3);
    next=e.stepWorkstationCampaign({...run,breached:1});expect(next.campaign!.streak).toBe(0);
    next=e.stepWorkstationCampaign({...run,campaign:{...run.campaign,streak:4}});expect(next.campaign!.streak).toBe(5);
  });
  it('earns first-three from a successful merge and retains it even after selling, never from a rating',()=>{
    const base=state();const parts=[{id:'p1',type:'single' as const,tier:2 as const,invested:54},{id:'p2',type:'single' as const,tier:2 as const,invested:54}];
    const withTower={...base,towers:[{id:'tower',type:'single' as const,level:2 as const,slotIndex:4,cooldown:0,invested:54}]};
    expect(e.applyWorkstationCommand(withTower,{type:'merge',slotIndex:4}).campaign!.mergedThree).toBeUndefined();
    const merged=e.applyWorkstationCommand({...withTower,inventory:parts},{type:'merge',slotIndex:4});expect(merged.campaign!.mergedThree).toBe(true);
    const sold=e.applyWorkstationCommand(merged,{type:'sell-tower',slotIndex:4});expect(sold.towers).toHaveLength(0);expect(e.workstationRewards(sold).achievements).toContain('tower_first_three');expect(e.workstationRewards(sold).stars).toBe(3);
    expect(e.workstationRewards({...base,status:'won',towers:[{...withTower.towers[0]!,level:3}]}).achievements).not.toContain('tower_first_three');
  });
  it('Sunday refill respects plant durability and economic talents just like normal combat',()=>{
    const base=state({weekday:0,talents:{output:0,control:0,economy:5}});
    const rest=e.applyWorkstationCommand({...base,status:'intermission',plantLevel:1,plantIncomeTick:e.TOWER_PLANT_INCOME_INTERVAL-1},{type:'next'});
    const live=e.stepWorkstationCampaign({...rest,campaign:{...rest.campaign!,plantHp:9}});
    expect(live.credits-rest.credits).toBe(Math.floor(e.plantIncomePerPayout(1)*1.4));
    const dead=e.stepWorkstationCampaign({...rest,campaign:{...rest.campaign!,plantHp:0}});
    expect(dead.credits).toBe(rest.credits);expect(dead.plantIncomeTick).toBe(0);
  });
  it('unlock skills are gated by actual level and cooldown, and manual rush changes spawn spacing not time',()=>{
    const base={...state(),status:'running' as const};expect(e.applyWorkstationCommand(base,{type:'skill2'})).toBe(base);
    const high={...base,hero:{...base.hero,level:5,hp:7}};const buff=e.applyWorkstationCommand(high,{type:'skill2'});expect(buff.hero.hp).toBe(9);expect(buff.campaign!.boostUntil).toBe(22);expect(e.applyWorkstationCommand(buff,{type:'skill2'})).toBe(buff);
    const rush=e.applyWorkstationCommand(base,{type:'rush'});expect(rush.tick).toBe(base.tick);expect(rush.spawnQueue.every(spawn=>spawn.spawnDelayTicks===1)).toBe(true);
  });
  it.each([0,31,2027])('retains a viable real-resource chapter-one strategy, seed %s',(seed)=>{
    let run=e.createWorkstationCampaign(seed,{job:'specialist',mode:'story',chapter:1,promotionTier:0,talents:{output:0,control:0,economy:0},weekday:2});
    run=e.applyWorkstationCommand(run,{type:'plant'});
    for(const offer of run.shop.slice(0,3))run=e.applyWorkstationCommand(run,{type:'buy',offerId:offer.id});
    run=e.applyWorkstationCommand(run,{type:'deploy',itemId:run.inventory[0]!.id,slotIndex:4});
    run=e.applyWorkstationCommand(e.applyWorkstationCommand(run,{type:'start'}),{type:'go'});
    for(let tick=0;run.status==='running'&&tick<1000;tick++)run=e.stepWorkstationCampaign(run);
    expect(run.status).toBe('intermission');
    for(let i=0;i<6;i++){if(run.shop[4]!.soldOut)run=e.applyWorkstationCommand(run,{type:'refresh'});const offer=run.shop[4]!;expect(run.credits).toBeGreaterThanOrEqual(offer.cost);run=e.applyWorkstationCommand(run,{type:'buy',offerId:offer.id});}
    run=e.applyWorkstationCommand(run,{type:'merge',slotIndex:4});expect(run.towers[0]!.level).toBe(3);
    run=e.applyWorkstationCommand(run,{type:'next'});
    for(let tick=0;run.status==='running'&&tick<1000;tick++)run=e.stepWorkstationCampaign(e.applyWorkstationCommand(run,{type:'pulse'}));
    expect(run.status).toBe('won');expect(run.coreHp).toBeGreaterThan(0);expect(e.workstationRewards(run).coins).toBeGreaterThan(0);expect(run.credits).toBeGreaterThanOrEqual(0);
  });
});
