import * as THREE from 'three';
import { PAPER_ARENA_MAP,type PaperArenaRoomView } from '@stealth-reader/shared';
import { DoodleMaterial } from '../ballpoint-breach/runtime/render/DoodleMaterial';
import { createOutlinedMesh,releaseOutlinedObject } from '../ballpoint-breach/runtime/render/OutlinedMesh';
import { DOODLE_PALETTE } from '../ballpoint-breach/runtime/render/palette';

/** View only: no collisions, combat, scores, RNG or respawn simulation runs in this renderer. */
export class PaperArenaRenderer{
  private readonly renderer:THREE.WebGLRenderer;
  private readonly scene=new THREE.Scene();
  private readonly camera=new THREE.PerspectiveCamera(72,1,.07,110);
  private readonly actors=new Map<string,THREE.Group>();
  private readonly actorMaterials=new Map<string,DoodleMaterial>();
  private readonly materials=new Set<THREE.Material>();
  private readonly geometries=new Set<THREE.BufferGeometry>();
  private readonly shotLines=new THREE.Group();
  private readonly gun=new THREE.Group();
  private readonly look=new THREE.Vector3();
  private previous:PaperArenaRoomView|null=null;
  private current:PaperArenaRoomView|null=null;
  private snapshotTime=0;
  private disposed=false;
  constructor(private readonly canvas:HTMLCanvasElement){
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'low-power'});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.scene.background=new THREE.Color(DOODLE_PALETTE.paper);this.scene.fog=new THREE.Fog(DOODLE_PALETTE.paper,20,60);
    const paper=this.material(new DoodleMaterial({surfaceColor:DOODLE_PALETTE.paperLight,hatchStrength:.4,seed:13}));
    const wall=this.material(new DoodleMaterial({surfaceColor:DOODLE_PALETTE.paperShade,hatchStrength:.62,seed:15}));
    this.box(36,.1,36,0,-.08,0,paper,'paper-floor');
    for(const obstacle of PAPER_ARENA_MAP.obstacles)this.box(obstacle.w,obstacle.h,obstacle.d,obstacle.x,obstacle.h/2,obstacle.z,wall,'map-cover');
    this.box(36,3,.2,0,1.5,18,paper,'wall');this.box(36,3,.2,0,1.5,-18,paper,'wall');this.box(.2,3,36,18,1.5,0,paper,'wall');this.box(.2,3,36,-18,1.5,0,paper,'wall');
    const grid=new THREE.GridHelper(36,36,0xa3adc6,0xc2c8d4);grid.position.y=.002;this.scene.add(grid);this.geometries.add(grid.geometry);if(Array.isArray(grid.material))grid.material.forEach(material=>this.materials.add(material));else this.materials.add(grid.material);
    const weaponMaterial=this.material(new DoodleMaterial({surfaceColor:0xf2e8cf,hatchStrength:.85,seed:71}));
    const receiver=this.outlined(new THREE.BoxGeometry(.13,.14,.43),weaponMaterial);receiver.position.set(.25,-.21,-.4);this.gun.add(receiver);
    const barrel=this.outlined(new THREE.BoxGeometry(.055,.055,.34),weaponMaterial);barrel.position.set(.25,-.18,-.69);this.gun.add(barrel);
    const grip=this.outlined(new THREE.BoxGeometry(.09,.17,.1),weaponMaterial);grip.position.set(.25,-.32,-.28);this.gun.add(grip);
    this.camera.add(this.gun);this.scene.add(this.camera,this.shotLines);
  }
  private material<T extends THREE.Material>(material:T):T{this.materials.add(material);return material;}
  private outlined(geometry:THREE.BufferGeometry,material:THREE.Material,color:number=DOODLE_PALETTE.ink):THREE.Group{
    this.geometries.add(geometry);return createOutlinedMesh(geometry,material,{color,irregularity:.018,irregularitySeed:13,doubleStroke:true,opacity:.85});
  }
  private box(w:number,h:number,d:number,x:number,y:number,z:number,material:THREE.Material,name:string):void{
    const object=this.outlined(new THREE.BoxGeometry(w,h,d),material);object.position.set(x,y,z);object.name=name;this.scene.add(object);
  }
  update(room:PaperArenaRoomView):void{
    if(this.disposed)return;this.previous=this.current;this.current=room;this.snapshotTime=performance.now();
    const ids=new Set(room.players.map(player=>player.id));
    for(const[id,actor]of this.actors)if(!ids.has(id)){releaseOutlinedObject(actor);actor.removeFromParent();this.actors.delete(id);}
    for(const player of room.players){
      if(!this.actors.has(player.id)){
        const color=player.team==='red'?0xb75560:0x3b589b;
        const material=this.material(new DoodleMaterial({surfaceColor:player.team==='red'?0xf5d7d0:0xdde5f6,inkColor:color,hatchStrength:.6,seed:20+this.actors.size}));this.actorMaterials.set(player.id,material);
        const actor=new THREE.Group();
        const body=this.outlined(new THREE.CylinderGeometry(.3,.24,.82,9),material,color);body.position.y=.88;actor.add(body);
        const head=this.outlined(new THREE.SphereGeometry(.3,12,8),material,color);head.position.y=1.49;actor.add(head);
        for(const x of[-.15,.15]){const leg=this.outlined(new THREE.BoxGeometry(.14,.42,.15),material,color);leg.position.set(x,.24,0);actor.add(leg);}
        for(const x of[-.39,.39]){const arm=this.outlined(new THREE.BoxGeometry(.13,.56,.14),material,color);arm.position.set(x,.93,.05);arm.rotation.x=-.5;actor.add(arm);}
        const eyeMaterial=this.material(new THREE.MeshBasicMaterial({color}));for(const x of[-.105,.105]){const eye=new THREE.Mesh(new THREE.SphereGeometry(.035,6,5),eyeMaterial);eye.position.set(x,1.53,.27);this.geometries.add(eye.geometry);actor.add(eye);}
        this.actors.set(player.id,actor);this.scene.add(actor);
      }
      const material=this.actorMaterials.get(player.id);material?.uniforms.uSurfaceColor.value.setHex(player.team==='red'?0xf5d7d0:0xdde5f6);material?.uniforms.uInkColor.value.setHex(player.team==='red'?0xb75560:0x3b589b);
    }
    for(const child of [...this.shotLines.children]){child.removeFromParent();if(child instanceof THREE.Line){child.geometry.dispose();(child.material as THREE.Material).dispose();}}
    for(const shot of room.game.shots){
      if(room.game.elapsedMs-shot.at>200)continue;
      const geometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(shot.x,shot.y,shot.z),new THREE.Vector3(shot.endX,shot.endY,shot.endZ)]);
      const material=new THREE.LineBasicMaterial({color:shot.team==='red'?0xb55b66:0x526bb0,transparent:true,opacity:.55});this.shotLines.add(new THREE.Line(geometry,material));
    }
  }
  render(now:number,aim:{yaw:number;pitch:number}|null):void{
    if(this.disposed||!this.current)return;
    const width=Math.max(1,this.canvas.clientWidth),height=Math.max(1,this.canvas.clientHeight);
    if(this.canvas.width!==Math.round(width*this.renderer.getPixelRatio())||this.canvas.height!==Math.round(height*this.renderer.getPixelRatio())){this.renderer.setSize(width,height,false);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();}
    const room=this.current,alpha=Math.min(1,(now-this.snapshotTime)/100);
    for(const player of room.players){
      const actor=this.actors.get(player.id)!;const before=this.previous?.players.find(old=>old.id===player.id);
      const teleport=!before||Math.hypot(before.x-player.x,before.z-player.z)>3;
      const x=teleport?player.x:THREE.MathUtils.lerp(before.x,player.x,alpha),z=teleport?player.z:THREE.MathUtils.lerp(before.z,player.z,alpha);
      actor.position.set(x,0,z);actor.rotation.y=player.yaw;actor.visible=player.id!==room.myPlayerId&&player.hp>0;
      if(player.id===room.myPlayerId){
        const yaw=aim?.yaw??player.yaw,pitch=aim?.pitch??player.pitch;this.camera.position.set(x,player.hp>0?1.4:.65,z);
        this.look.set(x+Math.sin(yaw)*Math.cos(pitch),this.camera.position.y+Math.sin(pitch),z+Math.cos(yaw)*Math.cos(pitch));this.camera.lookAt(this.look);
        this.gun.visible=player.hp>0;const shot=before&&before.shotSeq!==player.shotSeq;this.gun.position.z=shot ? .035*(1-alpha) : 0;
        this.gun.rotation.z=player.reloadingUntil>room.game.elapsedMs?-.3:0;
      }
    }
    this.renderer.render(this.scene,this.camera);
  }
  dispose():void{
    if(this.disposed)return;this.disposed=true;releaseOutlinedObject(this.scene);
    for(const child of this.shotLines.children)if(child instanceof THREE.Line){child.geometry.dispose();(child.material as THREE.Material).dispose();}
    this.geometries.forEach(geometry=>geometry.dispose());this.materials.forEach(material=>material.dispose());this.actors.clear();this.scene.clear();this.renderer.dispose();this.renderer.forceContextLoss();
  }
}
