import * as THREE from 'three';
import {PAPER_ARENA_RULES,type PaperArenaPlayer,type PaperArenaRoomView} from '@stealth-reader/shared';
import {createGameScene} from '../ballpoint-breach/runtime/game/createGameScene';
import {createPaperCharacter,PAPER_TEAM_COLORS,type PaperAssetInstance} from './PaperArenaAssets';
import type {DoodleRig} from '../ballpoint-breach/runtime/enemies/doodleRig';
import {createPaperArenaWorld} from './PaperArenaWorld';
import {PaperArenaWeaponPresentation} from './PaperArenaWeaponPresentation';

interface Actor{asset:PaperAssetInstance<DoodleRig>;weapon:PaperArenaWeaponPresentation;team:PaperArenaPlayer['team'];base:Map<THREE.Object3D,THREE.Euler>;echoes:THREE.Object3D[];lastAnimated:number}
function seatSeed(id:string){let hash=2166136261;for(const char of id)hash=Math.imul(hash^char.charCodeAt(0),16777619);return hash>>>0;}
function yawLerp(from:number,to:number,alpha:number){return from+Math.atan2(Math.sin(to-from),Math.cos(to-from))*alpha;}

/** Presentation only. Original scene, rigs and five weapons; all players/actions are authoritative snapshots. */
export class PaperArenaRenderer{
 private readonly renderer:THREE.WebGLRenderer;
 private readonly scene=createGameScene({fogNear:48,fogFar:125,skyDepth:-63});
 private readonly camera=new THREE.PerspectiveCamera(68,1,.025,160);
 private readonly world:ReturnType<typeof createPaperArenaWorld>;
 private readonly actors=new Map<string,Actor>();
 private firstPerson:PaperArenaWeaponPresentation|null=null;
 private firstPersonTeam:PaperArenaPlayer['team']|null=null;
 private readonly skyMaterials=new Set<THREE.Material>();
 private readonly skyGeometries=new Set<THREE.BufferGeometry>();
 private readonly shots=new THREE.Group();
 private readonly shotGeometry=new THREE.BufferGeometry();
 private readonly shotMaterial=new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.7,depthWrite:false});
 private readonly shotPositions=new Float32Array(96*6);
 private readonly shotColors=new Float32Array(96*6);
 private readonly look=new THREE.Vector3();
 private previous:PaperArenaRoomView|null=null;
 private current:PaperArenaRoomView|null=null;
 private snapshotTime=0;
 private lastFrame=0;
 private disposed=false;
 constructor(private readonly canvas:HTMLCanvasElement){
  this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'low-power'});
  this.world=createPaperArenaWorld();
  this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));this.renderer.outputColorSpace=THREE.SRGBColorSpace;
  this.scene.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Line){this.skyGeometries.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>this.skyMaterials.add(m));}});
  this.shotGeometry.setAttribute('position',new THREE.BufferAttribute(this.shotPositions,3).setUsage(THREE.DynamicDrawUsage));this.shotGeometry.setAttribute('color',new THREE.BufferAttribute(this.shotColors,3).setUsage(THREE.DynamicDrawUsage));this.shotGeometry.setDrawRange(0,0);
  const lines=new THREE.LineSegments(this.shotGeometry,this.shotMaterial);lines.frustumCulled=false;this.shots.name='server-shot-traces';this.shots.add(lines);this.scene.add(this.world.root,this.camera,this.shots);
 }
 private createActor(player:PaperArenaPlayer):Actor{
  const asset=createPaperCharacter(seatSeed(player.id),player.team),rig=asset.value,weapon=new PaperArenaWeaponPresentation(player.team,false);
  rig.root.name=`server-player-${player.id}`;rig.weaponPivot.add(weapon.root);weapon.root.position.set(0,-.1,.05);
  const base=new Map<THREE.Object3D,THREE.Euler>();for(const part of[rig.head,rig.torso,rig.leftArm,rig.rightArm,rig.leftLeg,rig.rightLeg])base.set(part,part.rotation.clone());
  const echoes:THREE.Object3D[]=[];rig.root.traverse(o=>{if(o.name.includes('echo'))echoes.push(o);});this.scene.add(rig.root);return{asset,weapon,team:player.team,base,echoes,lastAnimated:-Infinity};
 }
 update(room:PaperArenaRoomView):void{
  if(this.disposed)return;this.previous=this.current?.id===room.id?this.current:null;this.current=room;this.snapshotTime=performance.now();
  const ids=new Set(room.players.map(p=>p.id));for(const[id,actor]of this.actors)if(!ids.has(id)||room.players.find(p=>p.id===id)?.team!==actor.team){actor.weapon.dispose();actor.asset.dispose();this.actors.delete(id);}
  for(const player of room.players)if(!this.actors.has(player.id))this.actors.set(player.id,this.createActor(player));
  const me=room.players.find(p=>p.id===room.myPlayerId);if(me&&(!this.firstPerson||me.team!==this.firstPersonTeam)){this.firstPerson?.dispose();this.firstPerson=new PaperArenaWeaponPresentation(me.team);this.firstPersonTeam=me.team;this.camera.add(this.firstPerson.root);}
  if(!me){this.firstPerson?.dispose();this.firstPerson=null;this.firstPersonTeam=null;}
 }
 private drawShots(time:number){
  let index=0;for(const shot of this.current!.game.shots){if(time-shot.at>220||time<shot.at||index>=96)continue;
   const offset=index*6;this.shotPositions.set([shot.x,shot.y,shot.z,shot.endX,shot.endY,shot.endZ],offset);
   const hex=PAPER_TEAM_COLORS[shot.team].ink,r=((hex>>16)&255)/255,g=((hex>>8)&255)/255,b=(hex&255)/255;this.shotColors.set([r,g,b,r,g,b],offset);index++;
  }
  this.shotGeometry.setDrawRange(0,index*2);this.shotGeometry.getAttribute('position').needsUpdate=true;this.shotGeometry.getAttribute('color').needsUpdate=true;
 }
 render(now:number,aim:{yaw:number;pitch:number}|null):void{
  if(this.disposed||!this.current)return;
  const width=Math.max(1,this.canvas.clientWidth),height=Math.max(1,this.canvas.clientHeight),ratio=this.renderer.getPixelRatio();
  if(this.canvas.width!==Math.round(width*ratio)||this.canvas.height!==Math.round(height*ratio)){this.renderer.setSize(width,height,false);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();}
  const room=this.current,since=Math.max(0,now-this.snapshotTime),alpha=Math.min(1,since/100),delta=this.lastFrame?Math.min(.1,Math.max(0,(now-this.lastFrame)/1000)):1/30;this.lastFrame=now;
  // One snapshot interval of cosmetic animation only. Never integrate positions, fire, damage or score.
  const time=room.game.elapsedMs+(room.status==='running'?Math.min(100,since):0),me=room.players.find(p=>p.id===room.myPlayerId);
  for(const player of room.players){
   const actor=this.actors.get(player.id)!,rig=actor.asset.value,before=this.previous?.players.find(p=>p.id===player.id);
   const teleport=!before||before.deaths!==player.deaths||Math.hypot(before.x-player.x,before.y-player.y,before.z-player.z)>4;
   const x=teleport?player.x:THREE.MathUtils.lerp(before.x,player.x,alpha),y=teleport?player.y:THREE.MathUtils.lerp(before.y,player.y,alpha),z=teleport?player.z:THREE.MathUtils.lerp(before.z,player.z,alpha);
   const interval=this.previous?Math.max(50,room.game.elapsedMs-this.previous.game.elapsedMs):100,speed=before&&!teleport?Math.hypot(before.x-player.x,before.z-player.z)/(interval/1000):0;
   rig.root.position.set(x,y,z);rig.root.rotation.y=before?yawLerp(before.yaw,player.yaw,alpha):player.yaw;rig.root.visible=player.id!==room.myPlayerId&&player.hp>0;
   if(player.id===room.myPlayerId){
    const yaw=aim?.yaw??player.yaw,pitch=aim?.pitch??player.pitch;this.camera.position.set(x,y+(player.hp>0?PAPER_ARENA_RULES.eyeHeight:.65),z);this.look.set(x+Math.sin(yaw)*Math.cos(pitch),this.camera.position.y+Math.sin(pitch),z+Math.cos(yaw)*Math.cos(pitch));this.camera.lookAt(this.look);
    if(this.firstPerson){this.firstPerson.root.visible=player.hp>0;const fov=this.firstPerson.update(player,time,delta,speed);if(Math.abs(this.camera.fov-fov)>.02){this.camera.fov=fov;this.camera.updateProjectionMatrix();}}
   }else if(rig.root.visible){
    const distance=me?Math.hypot(x-me.x,z-me.z):0;actor.echoes.forEach(e=>{e.visible=distance<22;});
    if(time-actor.lastAnimated>=(distance>30?90:0)){actor.lastAnimated=time;for(const[part,base]of actor.base)part.rotation.copy(base);
     const gait=time*.009*(player.sprinting?1.5:1),stride=Math.min(1,speed/5),ground=player.grounded?1:.25;
     rig.leftLeg.rotation.x=Math.sin(gait)*.52*stride*ground;rig.rightLeg.rotation.x=-Math.sin(gait)*.52*stride*ground;rig.torso.rotation.z+=Math.sin(gait)*.035*stride;rig.head.rotation.x=-player.pitch*.7;
     rig.leftArm.rotation.x=-1.18-player.pitch*.5;rig.rightArm.rotation.x=-1.1-player.pitch*.5;rig.leftArm.rotation.z=-.35;rig.rightArm.rotation.z=.24;
     if(player.reloadingUntil>time)rig.leftArm.rotation.x+=Math.sin(time*.009)*.4;actor.weapon.update(player,time,delta,speed);
    }
   }
  }
  this.world.update(delta);this.drawShots(room.game.elapsedMs+since);
  // Original two-pass projection: nearby world geometry cannot clip the held viewmodel.
  this.renderer.autoClear=true;this.camera.layers.set(0);this.renderer.render(this.scene,this.camera);this.renderer.autoClear=false;this.renderer.clearDepth();this.camera.layers.set(1);const background=this.scene.background;this.scene.background=null;this.renderer.render(this.scene,this.camera);this.scene.background=background;this.camera.layers.enableAll();this.renderer.autoClear=true;
 }
 dispose():void{if(this.disposed)return;this.disposed=true;this.firstPerson?.dispose();this.actors.forEach(a=>{a.weapon.dispose();a.asset.dispose();});this.actors.clear();this.world.dispose();this.shotGeometry.dispose();this.shotMaterial.dispose();this.skyGeometries.forEach(g=>g.dispose());this.skyMaterials.forEach(m=>m.dispose());this.scene.clear();this.renderer.dispose();this.renderer.forceContextLoss();}
}
