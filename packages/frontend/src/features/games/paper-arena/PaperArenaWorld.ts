import * as THREE from 'three';
import {PAPER_ARENA_MAP} from '@stealth-reader/shared';
import {buildArena} from '../ballpoint-breach/runtime/level/ArenaBuilder';
import {DoodleMaterial} from '../ballpoint-breach/runtime/render/DoodleMaterial';
import {createOutlinedMesh,type OutlinedMeshGroup} from '../ballpoint-breach/runtime/render/OutlinedMesh';
import {DOODLE_PALETTE} from '../ballpoint-breach/runtime/render/palette';

/** Original landmarks plus the exact shared extension. No local collision/destruction is run. */
export function createPaperArenaWorld(){
 const arena=buildArena(),root=arena.root;root.name='paper-arena-original-landmarks-and-extension';
 root.getObjectByName('arena-ground-and-perimeter')?.removeFromParent();
 for(const supply of arena.supplyPoints)root.getObjectByName(supply.id)?.removeFromParent();
 const extension=new THREE.Group();extension.name='shared-map-extension';root.add(extension);
 const colors={paper:DOODLE_PALETTE.paperLight,shade:DOODLE_PALETTE.paperShade,lavender:0xb8bbd8,orange:0xe7b76b,deep:0x9298be};
 const materials=new Map<string,DoodleMaterial>(),geometries:THREE.BufferGeometry[]=[],outlines:OutlinedMeshGroup[]=[];
 for(const box of PAPER_ARENA_MAP.extensionBoxes){
  let material=materials.get(box.material);if(!material){material=new DoodleMaterial({surfaceColor:colors[box.material as keyof typeof colors]??DOODLE_PALETTE.paperShade,hatchStrength:.65,seed:23});materials.set(box.material,material);}
  const geometry=new THREE.BoxGeometry(box.w,box.h,box.d);geometries.push(geometry);
  const mesh=createOutlinedMesh(geometry,material,{color:DOODLE_PALETTE.ink,irregularity:.02,irregularitySeed:13,doubleStroke:true,opacity:.88});mesh.position.set(box.x,box.y,box.z);mesh.name=box.id;mesh.userData.sharedColliderId=box.id;extension.add(mesh);outlines.push(mesh);
 }
 let disposed=false;
 return{root,arena,update(delta:number){if(!disposed)arena.update(Math.min(.05,Math.max(0,delta)));},dispose(){if(disposed)return;disposed=true;outlines.forEach(o=>o.releaseOutlineResources());geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());arena.dispose();root.removeFromParent();root.clear();}};
}
