import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import * as THREE from 'three';
import {PAPER_ARENA_MAP,PAPER_ARENA_MAP_VERSION,PAPER_ARENA_WEAPONS,type PaperArenaPlayer,type PaperArenaRoomView} from '@stealth-reader/shared';
import {getOutlineCacheStats} from '../ballpoint-breach/runtime/render/OutlinedMesh';
import {getEnemySharedResources} from '../ballpoint-breach/runtime/enemies/doodleRig';
import {DoodleMaterial} from '../ballpoint-breach/runtime/render/DoodleMaterial';
import {PaperArenaRenderer} from './PaperArenaRenderer';
import {PaperArenaWeaponPresentation} from './PaperArenaWeaponPresentation';
import {createPaperCharacter,createPaperWeapon} from './PaperArenaAssets';

const rendererMock=vi.hoisted(()=>({render:vi.fn(),clearDepth:vi.fn(),dispose:vi.fn(),forceContextLoss:vi.fn()}));
vi.mock('three',async()=>{const actual=await vi.importActual<typeof import('three')>('three');return{...actual,WebGLRenderer:class{outputColorSpace='';autoClear=true;setPixelRatio(){}getPixelRatio(){return 1;}setSize(){}render=rendererMock.render;clearDepth=rendererMock.clearDepth;dispose=rendererMock.dispose;forceContextLoss=rendererMock.forceContextLoss;}};});
function player(overrides:Partial<PaperArenaPlayer>={}):PaperArenaPlayer{return{id:'seat-1',name:'me',publicId:'public-test',team:'red',isBot:false,connected:true,x:4,y:0,z:6,vy:0,grounded:true,yaw:0,pitch:0,hp:100,ammo:30,reserve:150,weapon:'rifle',arsenal:Object.fromEntries(Object.values(PAPER_ARENA_WEAPONS).map(d=>[d.id,{ammo:d.magazineSize??0,reserve:d.initialReserve??0}])) as PaperArenaPlayer['arsenal'],aiming:false,blocking:false,sprinting:false,blockStamina:100,lastBlockAt:0,switchingUntil:0,actionUntil:0,lastShotAt:-1000,reloadingUntil:0,respawnAt:0,protectedUntil:0,kills:0,deaths:0,shotSeq:0,...overrides};}
function room(players:PaperArenaPlayer[]=[player()],time=1000):PaperArenaRoomView{return{id:'room-test',name:'test',protocolVersion:2,mapVersion:PAPER_ARENA_MAP_VERSION,maxPlayers:8,targetKills:20,requiresPassword:false,expiresAt:999999,status:'running',humans:1,hostPlayerId:'seat-1',myPlayerId:'seat-1',players,serverNow:10000,game:{tick:time/50,elapsedMs:time,scores:{red:0,blue:0},winner:null,shots:[]},rules:'test'};}
type Internals={scene:THREE.Scene;camera:THREE.PerspectiveCamera;firstPerson:PaperArenaWeaponPresentation;shotGeometry:THREE.BufferGeometry};
const active:PaperArenaRenderer[]=[];
function renderer(){const r=new PaperArenaRenderer(document.createElement('canvas'));active.push(r);return r;}
beforeEach(()=>vi.clearAllMocks());afterEach(()=>{active.splice(0).forEach(r=>r.dispose());});

describe('original models, authority-only presentation and exact expanded map',()=>{
 it('retains real source landmarks, replaces only old perimeter and builds every exact shared extension AABB',()=>{
  const before=getOutlineCacheStats(),r=renderer(),scene=(r as unknown as Internals).scene;
  expect(scene.getObjectByName('procedural-sky-doodles')).toBeTruthy();
  expect(scene.getObjectByName('four-level-open-scaffold')).toBeTruthy();expect(scene.getObjectByName('construction-crane')).toBeTruthy();
  expect(scene.getObjectByName('arena-ground-and-perimeter')).toBeUndefined();for(const name of PAPER_ARENA_MAP.hiddenOriginalGroups)expect(scene.getObjectByName(name)).toBeUndefined();
  const extension=scene.getObjectByName('shared-map-extension')!;expect(extension.children).toHaveLength(PAPER_ARENA_MAP.extensionBoxes.length);
  for(const box of PAPER_ARENA_MAP.extensionBoxes){const object=scene.getObjectByName(box.id)!;expect(object.position.toArray()).toEqual([box.x,box.y,box.z]);const mesh=object.children.find(o=>o instanceof THREE.Mesh) as THREE.Mesh;mesh.geometry.computeBoundingBox();expect(mesh.geometry.boundingBox!.getSize(new THREE.Vector3()).toArray()).toEqual(expect.arrayContaining([expect.closeTo(box.w,4),expect.closeTo(box.h,4),expect.closeTo(box.d,4)]));}
  r.dispose();r.dispose();expect(getOutlineCacheStats()).toEqual(before);expect(rendererMock.dispose).toHaveBeenCalledTimes(1);
 });
 it('uses server feet elevation plus 1.55m eye height and yaw=0 +Z, without mutating the room',()=>{
  const r=renderer(),snapshot=room([player({y:5.21})]),copy=JSON.stringify(snapshot);r.update(snapshot);r.render(performance.now()+100,{yaw:0,pitch:0});const camera=(r as unknown as Internals).camera;
  expect(camera.position.toArray()).toEqual([4,6.76,6]);expect(camera.getWorldDirection(new THREE.Vector3()).z).toBeCloseTo(1);expect(JSON.stringify(snapshot)).toBe(copy);expect(rendererMock.clearDepth).toHaveBeenCalledOnce();expect(rendererMock.render).toHaveBeenCalledTimes(2);
 });
 it('uses all five original viewmodels including authored hands and distinct action sockets',()=>{
  const presentation=new PaperArenaWeaponPresentation('blue');
  try{expect([...presentation.models.keys()]).toEqual(['rifle','shotgun','revolver','sniper','katana']);for(const[id,model]of presentation.models){expect(model.value.root.name).toBe('viewmodel-'+id);expect(model.value.parts.muzzle).toBeTruthy();let hands=0;model.value.root.traverse(o=>{if(o.name.includes('hand'))hands++;});expect(hands).toBeGreaterThan(0);}
   expect(presentation.models.get('shotgun')!.value.parts.pump).toBeTruthy();expect(presentation.models.get('sniper')!.value.parts.bolt).toBeTruthy();expect(presentation.models.get('revolver')!.value.parts.cylinder).toBeTruthy();expect(presentation.models.get('katana')!.value.parts.action).toBeTruthy();
  }finally{presentation.dispose();}
 });
 it('animates authoritative ADS, real magazine reload, switching, recoil and original katana swing, never ammo',()=>{
  const p=new PaperArenaWeaponPresentation('red');try{
   const base=player(),source=JSON.stringify(base),rifle=p.models.get('rifle')!.value,magazine=rifle.parts.magazine!,home=magazine.position.y;
   p.update(base,1000,.1,0);const hip=rifle.root.position.clone();let fov=68;for(let n=0;n<8;n++)fov=p.update({...base,aiming:true},1000+n*16,.016,0);expect(fov).toBeLessThan(55);expect(rifle.root.position.distanceTo(hip)).toBeGreaterThan(.05);
   p.update({...base,reloadingUntil:1800},1000,.1,0);expect(magazine.position.y).toBeLessThan(home-.1);
   p.update({...base,weapon:'sniper',switchingUntil:1230},1000,.1,0);const sniper=p.models.get('sniper')!.value;expect(sniper.root.position.y).toBeLessThan(sniper.hipPose.position.y-.3);expect(rifle.root.visible).toBe(false);
   p.update({...base,weapon:'katana',shotSeq:1,lastShotAt:900,actionUntil:1320},1000,.1,0);const katana=p.models.get('katana')!.value;expect(katana.parts.action!.rotation.toArray()).not.toEqual([0,0,0,'XYZ']);expect(katana.parts.trail!.visible).toBe(true);expect(JSON.stringify(base)).toBe(source);
  }finally{p.dispose();}
 });
 it('keeps original irregular character geometry and isolates red/blue materials from single-player caches',()=>{
  const shared=getEnemySharedResources(),originalUniforms=shared.materials.filter(m=>m instanceof DoodleMaterial).map(m=>(m as DoodleMaterial).uniforms.uInkColor!.value.getHex()),onSharedDispose=vi.fn();shared.geometries.forEach(g=>g.addEventListener('dispose',onSharedDispose));shared.materials.forEach(m=>m.addEventListener('dispose',onSharedDispose));
  const red=createPaperCharacter(3,'red'),blue=createPaperCharacter(3,'blue');
  expect(red.value.root.userData.handDrawnAsymmetry).toBe(true);expect(red.value.head.getObjectByName('regular-head-scribble-contour')).toBeTruthy();expect(red.value.root.scale.x).toBe(.84);
  const redMaterials=[...red.materials].filter(m=>m instanceof DoodleMaterial) as DoodleMaterial[],blueMaterials=[...blue.materials].filter(m=>m instanceof DoodleMaterial) as DoodleMaterial[];
  expect(redMaterials[0]).not.toBe(blueMaterials[0]);expect(redMaterials[0]!.uniforms.uInkColor!.value.getHex()).not.toBe(blueMaterials[0]!.uniforms.uInkColor!.value.getHex());redMaterials[0]!.uniforms.uInkColor!.value.setHex(0);
  red.dispose();blue.dispose();expect(onSharedDispose).not.toHaveBeenCalled();expect(shared.materials.filter(m=>m instanceof DoodleMaterial).map(m=>(m as DoodleMaterial).uniforms.uInkColor!.value.getHex())).toEqual(originalUniforms);
  shared.geometries.forEach(g=>g.removeEventListener('dispose',onSharedDispose));shared.materials.forEach(m=>m.removeEventListener('dispose',onSharedDispose));
 });
 it('reuses original weapon geometries but disposes each instance material once across repeated mounts',()=>{
  const a=createPaperWeapon('sniper','red'),b=createPaperWeapon('sniper','blue'),geometries:THREE.BufferGeometry[]=[];a.value.root.traverse(o=>{if(o instanceof THREE.Mesh)geometries.push(o.geometry);});const disposeGeometry=vi.fn(),disposeMaterial=vi.fn();geometries.forEach(g=>g.addEventListener('dispose',disposeGeometry));a.materials.forEach(m=>m.addEventListener('dispose',disposeMaterial));
  const otherGeometry:THREE.BufferGeometry[]=[];b.value.root.traverse(o=>{if(o instanceof THREE.Mesh)otherGeometry.push(o.geometry);});expect(otherGeometry).toEqual(geometries);a.dispose();a.dispose();expect(disposeMaterial).toHaveBeenCalledTimes(a.materials.size);expect(disposeGeometry).not.toHaveBeenCalled();b.dispose();geometries.forEach(g=>g.removeEventListener('dispose',disposeGeometry));
 });
 it('renders eight authoritative people, reuses a bounded trace buffer and never integrates snapshots',()=>{
  const r=renderer(),players=Array.from({length:8},(_,i)=>player({id:'seat-'+(i+1),team:i%2?'blue':'red',x:i*2,y:i===7?5.2:0,z:12,weapon:(['rifle','shotgun','revolver','sniper','katana'] as const)[i%5]})),state=room(players),saved=JSON.stringify(state);r.update(state);const internals=r as unknown as Internals;
  const geometry=internals.shotGeometry;for(let i=0;i<20;i++)r.render(performance.now()+i*16,null);expect(JSON.stringify(state)).toBe(saved);expect(internals.shotGeometry).toBe(geometry);expect(geometry.getAttribute('position').count).toBe(192);
  expect(internals.scene.children.filter(o=>o.name.startsWith('server-player-'))).toHaveLength(8);expect(internals.scene.getObjectByName('server-player-seat-1')!.visible).toBe(false);expect(internals.scene.getObjectByName('server-player-seat-8')!.position.y).toBe(5.2);
  let meshes=0;internals.scene.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Line)meshes++;});expect(meshes).toBeLessThan(7000);
 });
 it('replaces team material instances on team changes and removes disconnected seats without cache resets',()=>{
  const r=renderer();r.update(room([player(),player({id:'seat-2',team:'blue'})]));const internals=r as unknown as Internals,old=internals.scene.getObjectByName('server-player-seat-2')!;
  r.update(room([player(),player({id:'seat-2',team:'red'})],1100));expect(internals.scene.getObjectByName('server-player-seat-2')).not.toBe(old);expect(old.parent).toBeNull();r.update(room([player()],1200));expect(internals.scene.getObjectByName('server-player-seat-2')).toBeUndefined();
 });
 it('hides the physical sniper tube for the scoped HUD and expires tracers without a fresh snapshot',()=>{
  const p=new PaperArenaWeaponPresentation('red');try{const me=player({weapon:'sniper',aiming:true});for(let i=0;i<20;i++)p.update(me,1000,.016,0);expect(p.models.get('sniper')!.value.root.visible).toBe(false);p.update({...me,aiming:false},1000,.1,0);expect(p.models.get('sniper')!.value.root.visible).toBe(true);}finally{p.dispose();}
  const r=renderer(),snapshot=room();snapshot.game.shots=[{id:1,team:'red',weapon:'rifle',shooterId:'seat-1',pelletIndex:0,reflected:false,x:4,y:1.55,z:6,endX:4,endY:1.55,endZ:12,at:1000}];r.update(snapshot);r.render(performance.now()+20,null);const geometry=(r as unknown as Internals).shotGeometry;expect(geometry.drawRange.count).toBe(2);r.render(performance.now()+500,null);expect(geometry.drawRange.count).toBe(0);
 });
});
