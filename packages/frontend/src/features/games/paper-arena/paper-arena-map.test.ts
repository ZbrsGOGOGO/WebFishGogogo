import {describe,it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {buildArena} from '../ballpoint-breach/runtime/level/ArenaBuilder';
import {serializeOriginalPaperArena} from './paper-arena-map-extraction';
import {PAPER_ARENA_MAP as MAP,PAPER_ARENA_ORIGINAL_METADATA as SOURCE,paperArenaMapBodyClear as clear,paperArenaMapFloor as floor,paperArenaMapNavEdge as edge,getPaperArenaNavigation,getPaperArenaSpawnPoints} from '../../../../../shared/src/paper-arena-map';

describe('source-derived authoritative Paper map',()=>{
 it('matches every original collider, shooting-only mesh, waypoint, spawn and source hash',()=>{
  const actual=serializeOriginalPaperArena(buildArena);
  actual.source.builderSha256=createHash('sha256').update(readFileSync('src/features/games/ballpoint-breach/runtime/level/ArenaBuilder.ts')).digest('hex');
  expect(actual).toEqual(SOURCE);expect(SOURCE.colliders).toHaveLength(316);expect(SOURCE.raycastBoxes).toHaveLength(388);
  expect(SOURCE.waypoints).toHaveLength(36);expect(SOURCE.spawns).toHaveLength(22);
 });
 it('is deterministic across two builds without mutating the old solo ground or breakables',()=>{
  expect(serializeOriginalPaperArena(buildArena)).toEqual(serializeOriginalPaperArena(buildArena));
  const arena=buildArena();try{expect(arena.colliders.find(c=>c.id==='collider-main-ground')!.max.x).toBe(36);expect(arena.breakables.every(b=>!b.broken&&b.collider.enabled)).toBe(true);}finally{arena.dispose();}
 });
 it('preserves every non-perimeter movement AABB with only explicit rendered additions',()=>{
  const ids=new Set(MAP.colliders.map(c=>c.id));expect(ids.size).toBe(MAP.colliders.length);
  for(const c of SOURCE.colliders){const b=MAP.colliders.find(b=>b.id===c.id);if(MAP.removedOriginalIds.includes(c.id.replace('collider-','') as never)){expect(b).toBeUndefined();continue;}expect(b).toBeDefined();for(const [axis,size,index]of [['x','w',0],['y','h',1],['z','d',2]] as const){expect(b![axis]-b![size]/2).toBeCloseTo(c.min[index],10);expect(b![axis]+b![size]/2).toBeCloseTo(c.max[index],10);}}
  expect(MAP.extensionBoxes.every(b=>ids.has(b.id)&&b.material&&b.source==='extension')).toBe(true);
  expect(MAP.extensionBoxes).toHaveLength(33);expect(MAP.bounds).toEqual({minX:-48,maxX:48,minZ:-58,maxZ:44});
  for(const side of ['north','south','east','west'])expect(MAP.extensionBoxes.filter(b=>b.tags.includes('outer-ring')&&b.tags.includes(side)).length).toBeGreaterThanOrEqual(6);
 });
 it('separates movement, raycast-only details and noninteractive decoration',()=>{
  for(const id of ['utility-roof-water-tank','crane-hook','crane-hook-cable','west-yard-building-door-top-accent']){expect(MAP.raycastBoxes.some(b=>b.id===id)).toBe(true);expect(MAP.colliders.some(b=>b.id==='collider-'+id)).toBe(false);}
  expect(MAP.raycastBoxes.some(b=>b.id.startsWith('supply-')||b.id.startsWith('sky-scout-'))).toBe(false);
  expect(MAP.hiddenOriginalGroups).toHaveLength(10);expect(MAP.colliders.filter(b=>b.category==='breakable')).toHaveLength(6);
  for(const b of [...MAP.colliders,...MAP.raycastBoxes])expect([b.x,b.y,b.z,b.w,b.h,b.d].every(Number.isFinite)&&b.w>0&&b.h>0&&b.d>0).toBe(true);
 });
 it('handles real undercrofts, rooftops, first steps, headroom and out-of-bounds data',()=>{
  expect(floor(0,-32,1)).toBe(0);expect(clear(0,0,-32)).toBe(true);expect(floor(0,-32,6)).toBeCloseTo(5.27,6);expect(clear(0,5.27,-32)).toBe(true);
  expect(clear(-10,0,-13)).toBe(false);expect(clear(-28.2,4.5,-4.5)).toBe(false);
  const step=MAP.stairHints.find(s=>s.id==='collider-west-yard-roof-stairs-step-0')!;expect(floor(step.x,step.z,step.y+.46)).toBeGreaterThan(step.y);
  expect(clear(48,0,0)).toBe(false);expect(clear(0,NaN,0)).toBe(false);expect(floor(0,0,Infinity)).toBeNull();expect(floor(49,0,10)).toBeNull();
 });
 it('builds a connected physically sampled graph containing all ten stair flights and major decks',()=>{
  const graph=getPaperArenaNavigation(),nodes=graph.nodes;expect(nodes.length).toBeGreaterThan(9500);expect(nodes.length).toBeLessThan(13000);expect(graph.stairNodeCount).toBeGreaterThan(350);expect(getPaperArenaNavigation()).toBe(graph);
  const visited=new Set([0]),queue=[0];for(let i=0;i<queue.length;i++)for(const n of nodes[queue[i]].neighbors)if(!visited.has(n)){visited.add(n);queue.push(n);}expect(visited.size).toBe(nodes.length);
  const flights=[...new Set(MAP.stairHints.map(s=>s.id.replace(/-step-\d+$/,'')))];expect(flights).toHaveLength(10);for(const f of flights){const flightNodes=nodes.filter(n=>n.id.startsWith(f+'-step'));expect(flightNodes.length,f).toBeGreaterThanOrEqual(20);expect(Math.max(...flightNodes.map(n=>n.y))-Math.min(...flightNodes.map(n=>n.y)),f).toBeGreaterThan(1);}
  for(const [x,y,z]of [[-8,7.71,-15],[12,5.2,-12],[22,3.7,0],[-28,5.5,-5],[-20,7.74,-15],[0,5.27,-32],[15,3.75,-5]])expect(nodes.some(n=>Math.hypot(n.x-x,n.z-z)<.7&&Math.abs(n.y-y)<.05),`${x}/${y}/${z}`).toBe(true);
 });
 it('rechecks every graph edge against collision and support, not original decorative links',()=>{
  const nodes=getPaperArenaNavigation().nodes;for(const [i,n]of nodes.entries()){expect(clear(n.x,n.y,n.z),n.id).toBe(true);expect(floor(n.x,n.z,n.y+.001),n.id).toBeCloseTo(n.y,5);for(const j of n.neighbors){expect(j).toBeGreaterThanOrEqual(0);expect(j).toBeLessThan(nodes.length);expect(nodes[j].neighbors).toContain(i);expect(edge(n,nodes[j]),`${n.id}/${nodes[j].id}`).toBe(true);}}
  expect(edge({x:-5,y:0,z:-13},{x:-5,y:5.21,z:-13})).toBe(false);expect(edge({x:-10.6,y:0,z:-13},{x:-9.4,y:0,z:-13})).toBe(false);
 },20000);
 it('offers only clear reachable ground spawns in old yard and all four covered outer routes',()=>{
  const spawns=getPaperArenaSpawnPoints(),nodes=getPaperArenaNavigation().nodes;expect(spawns.length).toBeGreaterThanOrEqual(36);expect(MAP.spawnPoints).toBe(spawns);
  for(const s of spawns){expect(s.y).toBeLessThan(.5);expect(clear(s.x,s.y,s.z,.65)).toBe(true);expect(floor(s.x,s.z,s.y+.001,.65)).toBeCloseTo(s.y,5);expect(nodes.some(n=>Math.abs(n.y-s.y)<.02&&Math.hypot(n.x-s.x,n.z-s.z)<1.1)).toBe(true);}
  expect(spawns.some(s=>s.x>40)).toBe(true);expect(spawns.some(s=>s.x< -40)).toBe(true);expect(spawns.some(s=>s.z< -50)).toBe(true);expect(spawns.some(s=>s.z>40)).toBe(true);
  expect(new Set(spawns.map(s=>s.id)).size).toBe(spawns.length);
 });
});
