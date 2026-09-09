import { describe,it,expect,vi } from 'vitest';
import * as THREE from 'three';
import { PAPER_ARENA_MAP,type PaperArenaRoomView } from '@stealth-reader/shared';
import { getOutlineCacheStats } from '../ballpoint-breach/runtime/render/OutlinedMesh';
import { PaperArenaRenderer } from './PaperArenaRenderer';
const rendererMock=vi.hoisted(()=>({render:vi.fn(),dispose:vi.fn(),forceContextLoss:vi.fn()}));
vi.mock('three',async()=>{const actual=await vi.importActual<typeof import('three')>('three');return {...actual,WebGLRenderer:class{outputColorSpace='';setPixelRatio(){}getPixelRatio(){return 1;}setSize(){}render=rendererMock.render;dispose=rendererMock.dispose;forceContextLoss=rendererMock.forceContextLoss;}};});
describe('server-map-only paper rendering',()=>{
  it('builds exactly shared map covers and releases only owned outline resources',()=>{
    const before=getOutlineCacheStats();const canvas=document.createElement('canvas');const renderer=new PaperArenaRenderer(canvas);const scene=(renderer as unknown as {scene:THREE.Scene}).scene;
    const covers=scene.children.filter(child=>child.name==='map-cover');expect(covers).toHaveLength(PAPER_ARENA_MAP.obstacles.length);
    PAPER_ARENA_MAP.obstacles.forEach((box,index)=>expect(covers[index]!.position.toArray()).toEqual([box.x,box.h/2,box.z]));
    renderer.dispose();renderer.dispose();expect(getOutlineCacheStats()).toEqual(before);expect(rendererMock.dispose).toHaveBeenCalledTimes(1);
  });
  it('camera looks along shared yaw=0 +Z and renders authoritative positions without advancing combat',()=>{
    const canvas=document.createElement('canvas'),renderer=new PaperArenaRenderer(canvas);
    const player={id:'seat-1',name:'me',publicId:'id',team:'red',isBot:false,connected:true,x:4,z:6,yaw:0,pitch:0,hp:100,ammo:24,reloadingUntil:0,respawnAt:0,protectedUntil:0,kills:0,deaths:0,shotSeq:0};
    const room={id:'room',name:'test',status:'running',myPlayerId:'seat-1',players:[player],game:{tick:5,elapsedMs:250,scores:{red:0,blue:0},winner:null,shots:[]}} as unknown as PaperArenaRoomView;
    const copy=JSON.stringify(room);renderer.update(room);renderer.render(performance.now()+100,{yaw:0,pitch:0});const camera=(renderer as unknown as {camera:THREE.PerspectiveCamera}).camera;
    expect(camera.position.toArray()).toEqual([4,1.4,6]);const direction=camera.getWorldDirection(new THREE.Vector3());expect(direction.z).toBeCloseTo(1);expect(direction.x).toBeCloseTo(0);expect(JSON.stringify(room)).toBe(copy);renderer.dispose();
  });
});
