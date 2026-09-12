import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DemonTowerProfileView } from '@stealth-reader/shared';
import { DemonTowerInventory } from './DemonTowerInventory';
import { towerBattle, towerCatalog, towerProfile } from './test-fixtures';

const catalog=towerCatalog();
const weaponName=(id:string)=>catalog.weapons.find(item=>item.id===id)!.name;
function card(id:string){return screen.getByRole('article',{name:weaponName(id)});}
function props(profile=towerProfile()){return {profile,catalog,disabled:false,onAction:vi.fn().mockResolvedValue(true),onWorkshop:vi.fn()};}
function click(name:string){fireEvent.click(screen.getByRole('button',{name}));}
function allOwned():DemonTowerProfileView{return towerProfile({level:120,weapons:catalog.weapons.map(item=>({id:item.id,quality:3,spareCopies:2,star:2,favor:7})),skills:catalog.skills.map(item=>({id:item.id,quality:2,spareCopies:1}))});}
afterEach(cleanup);

describe('compact demon tower inventory and dedicated cultivation navigation',()=>{
  it('bounds every page to six cards and makes every weapon and skill reachable without a request',()=>{
    const p=props();render(<DemonTowerInventory {...p}/>);expect(screen.getAllByRole('article')).toHaveLength(3);
    click('查看完整图鉴');const weapons:string[]=[];
    for(let page=0;page<4;page++){
      const cards=screen.getAllByRole('article');expect(cards.length).toBeLessThanOrEqual(6);weapons.push(...cards.map(item=>item.getAttribute('aria-label')!));
      if(page<3)click('下一页');
    }
    expect(weapons).toEqual(catalog.weapons.map(item=>item.name));expect(new Set(weapons).size).toBe(20);expect(screen.getByRole('button',{name:'下一页'})).toBeDisabled();
    click('技能');expect(screen.getByLabelText('物品分页进度')).toHaveTextContent('第 1 / 3 页');const skills:string[]=[];
    for(let page=0;page<3;page++){skills.push(...screen.getAllByRole('article').map(item=>item.getAttribute('aria-label')!));if(page<2)click('下一页');}
    expect(skills).toEqual(catalog.skills.map(item=>item.name));expect(p.onAction).not.toHaveBeenCalled();expect(p.onWorkshop).not.toHaveBeenCalled();
  });
  it('resets the page on ownership filtering and clamps a shrinking server inventory to a real page',()=>{
    const p=props(allOwned()),view=render(<DemonTowerInventory {...p}/>);click('下一页');click('下一页');click('下一页');
    expect(screen.getByLabelText('物品分页进度')).toHaveTextContent('第 4 / 4 页');
    view.rerender(<DemonTowerInventory {...p} profile={towerProfile()}/>);expect(screen.getAllByRole('article')).toHaveLength(3);expect(screen.getByLabelText('物品分页进度')).toHaveTextContent('第 1 / 1 页');
    click('查看完整图鉴');expect(screen.getByLabelText('物品分页进度')).toHaveTextContent('第 1 / 4 页');click('下一页');click('切回已拥有');expect(screen.getByLabelText('物品分页进度')).toHaveTextContent('第 1 / 1 页');
  });
  it('passes the exact owned item ID to cultivation and never directly upgrades or saves the draft',()=>{
    const p=props();render(<DemonTowerInventory {...p}/>);
    fireEvent.click(within(card('w5')).getByRole('button',{name:'选作主手'}));
    fireEvent.click(within(card('w5')).getByRole('button',{name:'去养成'}));expect(p.onWorkshop).toHaveBeenCalledWith('w5');expect(p.onAction).not.toHaveBeenCalled();
    expect(screen.queryByRole('button',{name:'品质强化'})).not.toBeInTheDocument();expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button',{name:'保存配装'})).toBeEnabled();
    click('技能');fireEvent.click(within(screen.getByRole('article',{name:catalog.skills[0]!.name})).getByRole('button',{name:'去养成'}));expect(p.onWorkshop).toHaveBeenLastCalledWith('s1');expect(p.onAction).not.toHaveBeenCalled();
  });
  it('preserves a changed loadout across pages and submits only the explicit save',async()=>{
    const p=props(allOwned());render(<DemonTowerInventory {...p}/>);fireEvent.click(within(card('w5')).getByRole('button',{name:'选作主手'}));click('下一页');click('上一页');
    expect(within(card('w5')).getByRole('button',{name:'当前主手'})).toBeDisabled();expect(p.onAction).not.toHaveBeenCalled();
    await act(async()=>{click('保存配装');});expect(p.onAction).toHaveBeenCalledWith({kind:'equip',payload:{...p.profile.loadout,mainHand:'w5'}});
  });
  it('retains server-conflict protection and restores the latest server plan explicitly',()=>{
    const p=props(),view=render(<DemonTowerInventory {...p}/>);fireEvent.click(within(card('w5')).getByRole('button',{name:'选作主手'}));
    view.rerender(<DemonTowerInventory {...p} profile={{...p.profile,version:2,loadout:{...p.profile.loadout,artifact:null}}}/>);
    expect(screen.getByRole('alert')).toHaveTextContent('其他页面发生变化');expect(screen.getByRole('button',{name:'保存配装'})).toBeDisabled();
    click('读取最新配装');expect(screen.queryByRole('alert')).not.toBeInTheDocument();expect(within(card('w1')).getByRole('button',{name:'当前主手'})).toBeDisabled();expect(p.onAction).not.toHaveBeenCalled();
  });
  it('retains artifact uniqueness and skill-slot ordering without an implicit save',async()=>{
    const p=props();render(<DemonTowerInventory {...p}/>);fireEvent.click(within(card('w17')).getByRole('button',{name:'选作主手'}));
    expect(within(card('w17')).getByRole('button',{name:'主手不可重复'})).toBeDisabled();expect(screen.queryByRole('button',{name:'卸下法器'})).not.toBeInTheDocument();
    click(catalog.skills.find(skill=>skill.id==='s2')!.name+'优先级上移');expect(p.onAction).not.toHaveBeenCalled();
    await act(async()=>{click('保存配装');});expect(p.onAction).toHaveBeenCalledWith({kind:'equip',payload:{mainHand:'w17',artifact:null,activeSkills:['s2','s1','s3'],passiveSkills:[]}});
  });
  it('retains the full description and drop conditions in a reachable detail modal',()=>{
    const p=props(allOwned());render(<DemonTowerInventory {...p}/>);click('下一页');click('下一页');click('下一页');
    const item=catalog.weapons.at(-1)!;fireEvent.click(within(card(item.id)).getByRole('button',{name:'详情'}));
    const modal=screen.getByRole('dialog',{name:item.name});expect(within(modal).getByText(item.description)).toBeInTheDocument();expect(modal).toHaveTextContent('常规条件概率');expect(modal).toHaveTextContent('获取 Lv');
    click('关闭'+item.name);expect(screen.getByLabelText('物品分页进度')).toHaveTextContent('第 4 / 4 页');expect(p.onAction).not.toHaveBeenCalled();
  });
  it('keeps upgrade calculations out of the fixed-height cards and exposes them in the owned-item detail modal',()=>{
    const current=towerProfile({weapons:[{id:'w1',quality:2,spareCopies:1,star:2,favor:9}]});const p=props(current);
    render(<DemonTowerInventory {...p}/>);const item=card('w1');
    expect(within(item).queryByText(/实际生效数值/)).toBeNull();
    fireEvent.click(within(item).getByRole('button',{name:'详情'}));
    const modal=screen.getByRole('dialog',{name:weaponName('w1')});
    expect(within(modal).getByLabelText(weaponName('w1')+'实际成长数值')).toHaveTextContent('装备后力量+7→+8');
    expect(modal).toHaveTextContent('普攻星级倍率×1.1→×1.2');
    expect(modal).toHaveTextContent('熟练度 9/30');expect(p.onAction).not.toHaveBeenCalled();
  });
  it('shows an owned breakthrough weapon current rarity and expanded quality cap in details',()=>{
    const current=towerProfile({level:61,weapons:[{id:'w1',quality:5,spareCopies:0,star:2,favor:0,breakthrough:1}]});
    render(<DemonTowerInventory {...props(current)}/>);fireEvent.click(within(card('w1')).getByRole('button',{name:'详情'}));
    const modal=screen.getByRole('dialog',{name:weaponName('w1')});expect(modal).toHaveTextContent('灵 · Lv16 · 品质上限 +7');
    expect(modal).toHaveTextContent('装备后力量+12→+13');expect(modal).toHaveTextContent('突破另使速度+4');
  });
  it('shows real quality, star, copies and proficiency without expanded training panels',()=>{
    const profile=towerProfile({weapons:[{id:'w1',quality:7,spareCopies:3,star:2,favor:9,qualityExperience:12}]});render(<DemonTowerInventory {...props(profile)}/>);
    const item=card('w1');expect(item).toHaveTextContent('+7');expect(item).toHaveTextContent('★ 2/5');expect(item).toHaveTextContent('副本 3');expect(item).toHaveTextContent('品质经验 12');expect(item).toHaveTextContent('熟练度 9 / 30');
    expect(within(item).getByRole('progressbar',{name:weaponName('w1')+'升星熟练度'})).toHaveAttribute('max','30');
    const guide=screen.getByText('收集与培养说明').closest('details');expect(guide).not.toHaveAttribute('open');expect(screen.queryByRole('button',{name:'前往升星与突破'})).not.toBeInTheDocument();
  });
  it('keeps unowned items inspectable but not equippable or usable as a cultivation target',()=>{
    const p=props();render(<DemonTowerInventory {...p}/>);click('查看完整图鉴');
    const unowned=card('w2');expect(within(unowned).getByRole('button',{name:/选作主手|需要 Lv/})).toBeDisabled();expect(within(unowned).getByRole('button',{name:'去养成'})).toBeDisabled();
    fireEvent.click(within(unowned).getByRole('button',{name:'详情'}));expect(screen.getByRole('dialog')).toBeInTheDocument();expect(p.onAction).not.toHaveBeenCalled();
  });
  it('retains actual skill star and proficiency fields when supplied without inventing them for old skills',()=>{
    const profile=towerProfile({skills:[{id:'s1',quality:3,spareCopies:2,star:2,favor:17},{id:'s2',quality:1,spareCopies:0}]});
    render(<DemonTowerInventory {...props(profile)}/>);click('技能');
    const skill=screen.getByRole('article',{name:catalog.skills[0]!.name});expect(skill).toHaveTextContent('★ 2/5');expect(skill).toHaveTextContent('熟练度 17');
    expect(screen.getByRole('article',{name:catalog.skills[1]!.name})).not.toHaveTextContent('熟练度');
  });
  it('keeps read-only and combat inventories navigable without issuing mutations',()=>{
    const p=props(towerProfile({battle:towerBattle(),availableActions:['attack']}));render(<DemonTowerInventory {...p} disabled/>);
    expect(screen.getByRole('button',{name:'保存配装'})).toBeDisabled();expect(within(card('w5')).getByRole('button',{name:'选作主手'})).toBeDisabled();
    fireEvent.click(within(card('w5')).getByRole('button',{name:'去养成'}));expect(p.onWorkshop).toHaveBeenCalledWith('w5');expect(p.onAction).not.toHaveBeenCalled();
  });
});
