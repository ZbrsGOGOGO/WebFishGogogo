import * as THREE from 'three';
import {PAPER_ARENA_WEAPONS,type PaperArenaPlayer,type PaperTeam} from '@stealth-reader/shared';
import type {WeaponId} from '../ballpoint-breach/runtime/combat/types';
import type {WeaponViewmodel} from '../ballpoint-breach/runtime/combat/viewmodels';
import {sampleKatanaSlash} from '../ballpoint-breach/runtime/combat/WeaponSystem';
import {createPaperWeapon,type PaperAssetInstance} from './PaperArenaAssets';

const IDS:readonly WeaponId[]=['rifle','shotgun','revolver','sniper','katana'];
const clamp=(v:number)=>THREE.MathUtils.clamp(v,0,1);
const out=(v:number)=>1-(1-clamp(v))**3;
const inOut=(v:number)=>{const x=clamp(v);return x<.5?4*x*x*x:1-(-2*x+2)**3/2;};
type Home={position:THREE.Vector3;rotation:THREE.Euler;scale:THREE.Vector3};

/** Authored original models/animation math, but no WeaponSystem gameplay instance or ammo simulation. */
export class PaperArenaWeaponPresentation{
 readonly root=new THREE.Group();
 readonly models=new Map<WeaponId,PaperAssetInstance<WeaponViewmodel>>();
 private readonly homes=new Map<THREE.Object3D,Home>();
 private aim=0;
 private disposed=false;
 private readonly flashGeometry=new THREE.CircleGeometry(.105,5);
 private readonly flashMaterial=new THREE.MeshBasicMaterial({color:0xf4ba73,transparent:true,opacity:.85,side:THREE.DoubleSide,depthWrite:false});
 private readonly flash=new THREE.Mesh(this.flashGeometry,this.flashMaterial);
 constructor(private readonly team:PaperTeam,private readonly firstPerson=true){
  this.root.name=firstPerson?'original-first-person-weapons':'original-held-weapon';
  for(const id of firstPerson?IDS:['rifle'] as const)this.ensureModel(id);
  if(firstPerson){this.root.position.set(.35,-.19,-.8);this.root.scale.setScalar(.72);this.flash.layers.set(1);}else{this.root.scale.setScalar(.48);this.root.rotation.y=Math.PI;}
 }
 private ensureModel(id:WeaponId){
  if(this.models.has(id))return;
  const model=createPaperWeapon(id,this.team);this.models.set(id,model);this.root.add(model.value.root);model.value.root.visible=false;
   for(const part of Object.values(model.value.parts))if(part)this.homes.set(part,{position:part.position.clone(),rotation:part.rotation.clone(),scale:part.scale.clone()});
   model.value.root.traverse(o=>{if(this.firstPerson)o.layers.set(1);else if(o.name.includes('hand')||o.name.includes('sleeve')||o.name.includes('reference-dash'))o.visible=false;});
 }
 update(player:PaperArenaPlayer,time:number,delta:number,speed:number):number{
  if(this.disposed)return 68;
  const id=player.weapon;this.ensureModel(id);const view=this.models.get(id)?.value;if(!view)return 68;
  const def=PAPER_ARENA_WEAPONS[id],reloading=player.reloadingUntil>time,switching=player.switchingUntil>time;
  const target=(player.aiming||player.blocking)&&!reloading&&!switching?1:0;this.aim+= (target-this.aim)*(1-Math.exp(-Math.min(.1,delta)*14));
  // The source game hides its physical scope tube once the HUD scope takes over.
  for(const[weapon,instance]of this.models){instance.value.root.visible=weapon===id&&player.hp>0&&!(this.firstPerson&&id==='sniper'&&this.aim>.9);}
  for(const[part,home]of this.homes){part.position.copy(home.position);part.rotation.copy(home.rotation);part.scale.copy(home.scale);}
  const trail=view.parts.trail;if(trail)trail.visible=false;
  const recoil=player.shotSeq>0?Math.max(0,1-(time-player.lastShotAt)/190):0;
  this.flash.visible=id!=='katana'&&player.shotSeq>0&&time>=player.lastShotAt&&time-player.lastShotAt<80&&!switching;
  this.flash.rotation.z=player.shotSeq*.71;view.parts.muzzle.add(this.flash);
  if(this.firstPerson){
   view.root.position.lerpVectors(view.hipPose.position,view.aimPose.position,this.aim);
   view.root.rotation.set(THREE.MathUtils.lerp(view.hipPose.rotation.x,view.aimPose.rotation.x,this.aim),THREE.MathUtils.lerp(view.hipPose.rotation.y,view.aimPose.rotation.y,this.aim),THREE.MathUtils.lerp(view.hipPose.rotation.z,view.aimPose.rotation.z,this.aim));
   view.root.scale.setScalar(THREE.MathUtils.lerp(view.hipPose.scale,view.aimPose.scale,this.aim));
   const gait=time*.009*(player.sprinting?1.5:1),stride=Math.min(1,speed/5)*(1-this.aim)* (player.grounded?1:.15);
   view.root.position.x+=Math.sin(gait)*.018*stride;view.root.position.y-=Math.abs(Math.cos(gait))*.023*stride;
   view.root.position.z+=recoil*def.recoil*.075;view.root.rotation.x+=recoil*def.recoil*.05;
  }else{view.root.position.set(0,0,0);view.root.rotation.set(player.pitch,0,recoil*.035);view.root.scale.setScalar(1);}
  if(switching){const p=clamp(1-(player.switchingUntil-time)/def.switchMs);view.root.position.y-=Math.sin(p*Math.PI)*.68;view.root.rotation.z+=Math.sin(p*Math.PI)*.2;}
  if(reloading){
   const p=clamp(1-(player.reloadingUntil-time)/Math.max(1,def.reloadMs)),curve=Math.sin(p*Math.PI);
   view.root.position.y-=curve*.18;view.root.rotation.z+=curve*.34;view.root.rotation.x+=curve*.08;
   const magazine=view.parts.magazine,home=magazine?this.homes.get(magazine):null;
   if(magazine&&home){const remove=p<.48?out(p/.48):1-inOut((p-.48)/.52);magazine.position.y=home.position.y-remove*.58;magazine.rotation.z=home.rotation.z+remove*.22;}
   if(view.parts.cylinder){const home=this.homes.get(view.parts.cylinder)!;view.parts.cylinder.position.x=home.position.x+curve*.17;view.parts.cylinder.rotation.z=home.rotation.z+curve*.6;}
  }
  const actionMs=Math.max(1,(def.actionDuration??def.fireInterval)*1000),p=clamp((time-player.lastShotAt)/actionMs);
  if(player.shotSeq>0&&time>=player.lastShotAt&&p<1){
   if(view.parts.pump){const h=this.homes.get(view.parts.pump)!;view.parts.pump.position.z=h.position.z+(p<.48?out(p/.48):1-inOut((p-.48)/.52))*.34;}
   if(view.parts.bolt){const h=this.homes.get(view.parts.bolt)!;const lifted=clamp(p/.18),pull=p<.22?0:p<.54?out((p-.22)/.32):1-inOut((p-.54)/.34);view.parts.bolt.rotation.z=h.rotation.z-lifted*.78*(1-Math.max(0,p-.88)/.12);view.parts.bolt.position.z=h.position.z+pull*.34;}
   if(view.parts.hammer){const h=this.homes.get(view.parts.hammer)!;view.parts.hammer.rotation.x=h.rotation.x-Math.sin(p*Math.PI)*.75;}
   if(id==='katana'&&view.parts.action){const sample=sampleKatanaSlash(p,player.shotSeq%2?'forward':'reverse');view.parts.action.position.x+=sample.position[0];view.parts.action.position.y+=sample.position[1];view.parts.action.position.z+=sample.position[2];view.parts.action.rotation.x+=sample.rotation[0];view.parts.action.rotation.y+=sample.rotation[1];view.parts.action.rotation.z+=sample.rotation[2];if(trail){trail.visible=sample.trail>.04;const size=.86+sample.trail*.18;trail.scale.set(player.shotSeq%2?size:-size,size,size);}}
  }
  if(view.parts.cylinder&&!reloading){const h=this.homes.get(view.parts.cylinder)!;view.parts.cylinder.rotation.y=h.rotation.y+player.shotSeq*Math.PI/3;}
  return THREE.MathUtils.lerp(68,def.adsFov,this.aim);
 }
 dispose(){if(this.disposed)return;this.disposed=true;this.flash.removeFromParent();this.flashGeometry.dispose();this.flashMaterial.dispose();this.models.forEach(m=>m.dispose());this.models.clear();this.homes.clear();this.root.removeFromParent();this.root.clear();}
}
