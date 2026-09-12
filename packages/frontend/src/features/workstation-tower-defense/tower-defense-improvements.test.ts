import { describe, expect, it } from 'vitest';
import * as e from './tower-defense-logic';
import { withLegacySingleOpening } from './tower-defense-test-fixtures';

function assets(state: e.TowerDefenseState) { const {lastAction: _feedback, ...rest}=state; return rest; }
function official(tier=0) { return e.createWorkstationCampaign(1972, {job:'specialist', mode:'story', chapter:1, promotionTier:tier, talents:{output:0,control:0,economy:0}, weekday:2}); }
function deployed() { const state=official(); return {...state, towers:[{id:'tower-owned-1',type:'shred' as const,level:3 as const,slotIndex:4,cooldown:17,invested:229}]}; }

describe('random starting supply without economy changes',()=>{
  it('covers all five deterministic starting types, always affordable with a plant and deployable without rerolls',()=>{
    const seen=new Set<string>();
    for(let index=0;index<1000;index++){
      const seed=Math.imul(index+1,2654435761)>>>0, initial=e.createTowerDefenseState(seed);
      expect(e.createTowerDefenseState(seed)).toEqual(initial);
      const type=initial.shop[0].type, cost=e.TOWER_DEFINITIONS[type].partCost;
      seen.add(type);expect(initial.shopFocus).toBe(type);
      expect(initial.shop.slice(0,3)).toEqual([1,2,3].map(()=>expect.objectContaining({type,cost,tier:1,source:'guaranteed'})));
      expect(initial.shop.slice(0,3).every(offer=>(offer.rarity??'R')==='R')).toBe(true);
      expect(initial.shop[4]).toMatchObject({type,source:'focused',cost:e.focusedTowerPartCost(type)});
      expect(initial.credits).toBe(110);expect(initial.towers).toEqual([]);expect(initial.inventory).toEqual([]);
      let state=e.upgradeTowerDefensePlant(initial).state;
      for(const offer of initial.shop.slice(0,3)) { const bought=e.buyTowerShopOffer(state,offer.id);expect(bought.ok).toBe(true);state=bought.state; }
      expect(state.credits).toBe(110-e.plantUpgradeCost(0)-cost*3);expect(state.credits).toBeGreaterThanOrEqual(0);
      expect(state.inventory).toEqual([expect.objectContaining({type,tier:2,invested:cost*3})]);
      const moved=e.deployInventoryTower(state,state.inventory[0]!.id,4);expect(moved.ok).toBe(true);
      expect(moved.state.towers[0]).toMatchObject({type,level:2,invested:cost*3});
      expect(moved.state.credits).toBe(state.credits);expect(moved.state.rngSeed).toBe(initial.rngSeed);
    }
    expect([...seen].sort()).toEqual(['push','shred','single','slow','splash']);
  });
  it('reads and acts on an old fixed opening without regenerating its shop or RNG',()=>{
    const legacy=JSON.parse(JSON.stringify(withLegacySingleOpening(official()))) as e.TowerDefenseState;
    const before=JSON.stringify(legacy), next=e.applyWorkstationCommand(legacy,{type:'buy',offerId:legacy.shop[0].id});
    expect(JSON.stringify(legacy)).toBe(before);expect(next.rngSeed).toBe(legacy.rngSeed);
    expect(next.shop).toEqual(legacy.shop.map((offer,index)=>index===0?{...offer,soldOut:true}:offer));
    expect(next.credits).toBe(92);expect(next.inventory[0]).toMatchObject({type:'single',invested:18});
  });
  it.each([
    [2654435761,'slow'],[4055616904,'splash'],[2175734977,'push'],[295853050,'shred'],[2710938419,'single'],
  ] as const)('keeps the real opening first wave playable with no injected funds (%s/%s)',(seed,type)=>{
    let run=e.createWorkstationCampaign(seed,{job:'specialist',mode:'story',chapter:1,promotionTier:0,talents:{output:0,control:0,economy:0},weekday:2});
    expect(run.shopFocus).toBe(type);run=e.applyWorkstationCommand(run,{type:'plant'});
    for(const offer of run.shop.slice(0,3))run=e.applyWorkstationCommand(run,{type:'buy',offerId:offer.id});
    run=e.applyWorkstationCommand(run,{type:'deploy',itemId:run.inventory[0]!.id,slotIndex:4});
    expect(run.towers[0]).toMatchObject({type,level:2});expect(run.credits).toBeGreaterThanOrEqual(0);
    run=e.applyWorkstationCommand(e.applyWorkstationCommand(run,{type:'start'}),{type:'go'});
    for(let tick=0;run.status==='running'&&tick<1000;tick++)run=e.stepWorkstationCampaign(run);
    expect(run.status).toBe('intermission');expect(run.coreHp).toBe(10);expect(run.credits).toBeGreaterThanOrEqual(100);
  });
});

describe('stable unlocked positions and owned-tower moves',()=>{
  it('does not reorder legacy slot indexes; left/right unlock at tiers 2/4 and final slot at 6',()=>{
    expect(e.TOWER_SLOTS).toEqual([{x:1,y:1},{x:3,y:1},{x:5,y:1},{x:2,y:3},{x:7,y:4},{x:9,y:4},{x:6,y:6},{x:8,y:6},{x:10,y:6}]);
    expect(e.TOWER_SLOTS.map((_,index)=>e.towerSlotRequiredPromotionTier(index))).toEqual([0,0,0,0,0,0,2,4,6]);
    for(let tier=0;tier<=7;tier++) expect(e.TOWER_SLOTS.filter((_,index)=>e.isTowerSlotUnlocked(official(tier),index))).toHaveLength(Math.min(9,6+Math.floor(tier/2)));
    expect(e.TOWER_SLOTS.every((_,index)=>e.isTowerSlotUnlocked(e.createTowerDefenseState(),index))).toBe(true);
    for(const index of [-1,9,.5,NaN,Infinity]){expect(e.isTowerSlotUnlocked(official(),index)).toBe(false);expect(e.towerSlotRequiredPromotionTier(index)).toBeNull();}
  });
  it.each(['idle','running','intermission'] as const)('moves exactly one tower while %s without touching assets, RNG, clocks or input',status=>{
    const initial={...deployed(),status}, before=JSON.stringify(initial), command={type:'move-tower' as const,towerId:initial.towers[0].id,fromSlotIndex:4,toSlotIndex:1};
    const result=e.moveDeployedTower(initial,4,1,command.towerId);expect(result.ok).toBe(true);
    expect(assets(result.state)).toEqual({...assets(initial),towers:[{...initial.towers[0],slotIndex:1}]});
    expect(JSON.stringify(initial)).toBe(before);expect(e.applyWorkstationCommand(initial,command)).toEqual(result.state);
    const repeated=e.applyWorkstationCommand(result.state,command);expect(repeated.lastAction?.code).toBe('tower_missing');expect(assets(repeated)).toEqual(assets(result.state));
    const same=e.moveDeployedTower(result.state,1,1,command.towerId);expect(same.ok).toBe(true);expect(assets(same.state)).toEqual(assets(result.state));
  });
  it.each(['paused','won','lost'] as const)('rejects moving while %s',status=>{
    const initial={...deployed(),status}, result=e.moveDeployedTower(initial,4,1,initial.towers[0].id);
    expect(result.code).toBe('invalid_status');expect(assets(result.state)).toEqual(assets(initial));
  });
  it('rejects locked, occupied, hero-blocked, missing or stale identities atomically',()=>{
    const initial=deployed(), id=initial.towers[0].id;
    const cases:[e.TowerDefenseState,number,number,string,string][]=[
      [initial,4,6,id,'invalid_slot'],[initial,4,9,id,'invalid_slot'],[initial,.5,1,id,'invalid_slot'],
      [initial,4,1,'another-tower','tower_missing'],[initial,3,1,id,'tower_missing'],
      [{...initial,towers:[...initial.towers,{...initial.towers[0],id:'other',slotIndex:1}]},4,1,id,'slot_occupied'],
      [{...initial,hero:{...initial.hero,...e.TOWER_SLOTS[1]}},4,1,id,'hero_blocking'],
    ];
    for(const [state,from,to,towerId,code] of cases){ const before=JSON.stringify(state), result=e.moveDeployedTower(state,from,to,towerId);expect(result.ok).toBe(false);expect(result.code).toBe(code);expect(assets(result.state)).toEqual(assets(state));expect(JSON.stringify(state)).toBe(before); }
  });
});
