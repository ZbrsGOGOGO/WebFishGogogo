import * as THREE from 'three';
import type { PaperTeam } from '@stealth-reader/shared';
import { createDoodleRig,type DoodleRig } from '../ballpoint-breach/runtime/enemies/doodleRig';
import { createWeaponViewmodels,type WeaponViewmodel } from '../ballpoint-breach/runtime/combat/viewmodels';
import type { WeaponId } from '../ballpoint-breach/runtime/combat/types';
import { DoodleMaterial } from '../ballpoint-breach/runtime/render/DoodleMaterial';

/** Bounded immutable templates. Geometry remains owned by the original procedural asset cache. */
let weapons:Readonly<Record<WeaponId,WeaponViewmodel>>|undefined;
const characters=new Map<number,DoodleRig>();
export const PAPER_TEAM_COLORS={red:{ink:0xa52d49,wash:0xebbdc5},blue:{ink:0x273d99,wash:0xbdc9eb}} as const;
const materialColor=new THREE.Color(),hsl={h:0,s:0,l:0};
export interface PaperAssetInstance<T>{value:T;materials:ReadonlySet<THREE.Material>;dispose():void}

function clonePresentation(source:THREE.Group,team:PaperTeam){
 const root=source.clone(true),originals:THREE.Object3D[]=[],copies:THREE.Object3D[]=[],objects=new Map<THREE.Object3D,THREE.Object3D>();
 source.traverse(o=>originals.push(o));root.traverse(o=>copies.push(o));originals.forEach((o,i)=>objects.set(o,copies[i]!));
 const cloned=new Map<THREE.Material,THREE.Material>();
 const copyMaterial=(original:THREE.Material)=>{
  const existing=cloned.get(original);if(existing)return existing;
  const copy=original.clone();cloned.set(original,copy);
  if(copy instanceof DoodleMaterial){
   copy.uniforms.uInkColor!.value.setHex(PAPER_TEAM_COLORS[team].ink);
   materialColor.copy(copy.uniforms.uSurfaceColor!.value).getHSL(hsl);
   if(hsl.s>.24&&hsl.l<.86)copy.uniforms.uSurfaceColor!.value.lerp(new THREE.Color(PAPER_TEAM_COLORS[team].wash),.72);
  }else if('color'in copy&&(copy as THREE.MeshBasicMaterial).color instanceof THREE.Color){
   const color=(copy as THREE.MeshBasicMaterial).color;color.getHSL(hsl);
   if(hsl.s>.3)color.setHex(PAPER_TEAM_COLORS[team].ink);
  }
  return copy;
 };
 root.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Line){o.material=Array.isArray(o.material)?o.material.map(copyMaterial):copyMaterial(o.material);o.castShadow=false;o.receiveShadow=false;}});
 let disposed=false;
 return{root,objects,materials:new Set(cloned.values()),dispose(){if(disposed)return;disposed=true;root.removeFromParent();cloned.forEach(m=>m.dispose());root.clear();}};
}

export function createPaperWeapon(id:WeaponId,team:PaperTeam):PaperAssetInstance<WeaponViewmodel>{
 weapons??=createWeaponViewmodels();const source=weapons[id],instance=clonePresentation(source.root,team);
 const parts:WeaponViewmodel['parts']={...Object.fromEntries(Object.entries(source.parts).map(([name,part])=>[name,part?instance.objects.get(part):undefined])),muzzle:instance.objects.get(source.parts.muzzle)!};
 return{value:{id,root:instance.root,parts,hipPose:{position:source.hipPose.position.clone(),rotation:source.hipPose.rotation.clone(),scale:source.hipPose.scale},aimPose:{position:source.aimPose.position.clone(),rotation:source.aimPose.rotation.clone(),scale:source.aimPose.scale}},materials:instance.materials,dispose:instance.dispose};
}

export function createPaperCharacter(seed:number,team:PaperTeam):PaperAssetInstance<DoodleRig>{
 const variant=(seed>>>0)%8;let source=characters.get(variant);if(!source){source=createDoodleRig('grunt',variant);characters.set(variant,source);}
 const instance=clonePresentation(source.root,team),node=(object:THREE.Object3D)=>instance.objects.get(object)!;
 const value:DoodleRig={root:instance.root,torso:node(source.torso) as THREE.Group,head:node(source.head) as THREE.Group,leftArm:node(source.leftArm) as THREE.Group,rightArm:node(source.rightArm) as THREE.Group,leftLeg:node(source.leftLeg) as THREE.Group,rightLeg:node(source.rightLeg) as THREE.Group,weaponPivot:node(source.weaponPivot) as THREE.Group,muzzle:node(source.muzzle),pencilPivot:null,hitMeshes:[]};
 // Source silhouette is ~2.14m tall; server body is 1.8m. Preserve all authored proportions.
 value.root.scale.setScalar(.84);
 const upright=value.weaponPivot.getObjectByName('grunt-upright-weapon');if(upright)upright.visible=false;
 return{value,materials:instance.materials,dispose:instance.dispose};
}
