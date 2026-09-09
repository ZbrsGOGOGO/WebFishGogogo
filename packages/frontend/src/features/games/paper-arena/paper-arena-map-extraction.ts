// Metadata extracted from Ballpoint Breach (Apache-2.0). This frontend/tool-only
// adapter never appears in the shared/server runtime and never mutates the solo map.
import * as THREE from 'three';
import type {ArenaBuildResult} from '../ballpoint-breach/runtime/level/ArenaBuilder';
const xyz=(v:THREE.Vector3):[number,number,number]=>[v.x===0?0:v.x,v.y===0?0:v.y,v.z===0?0:v.z];
export function serializeOriginalPaperArena(build:()=>ArenaBuildResult){
 const arena=build();
 try{
  arena.syncColliderBounds();
  return {
   source:{upstream:'https://github.com/promptwhisper/ballpoint-breach',upstreamCommit:'96290df3fba1c2b64abac684510155d916117903',license:'Apache-2.0',builderSha256:''},
   colliders:arena.colliders.map(c=>({id:c.id,min:xyz(c.min),max:xyz(c.max),category:c.category,tags:[...c.tags]})),
   raycastBoxes:arena.raycastMeshes.map(mesh=>{const box=new THREE.Box3().setFromObject(mesh,false);return {id:String(mesh.userData.arenaId),min:xyz(box.min),max:xyz(box.max)};}),
   waypoints:arena.waypointGraph.nodes.map(n=>({id:n.id,position:xyz(n.position),neighbors:[...n.neighbors],tags:[...n.tags]})),
   spawns:arena.enemySpawnPoints.map(s=>({id:s.id,position:xyz(s.position),yaw:s.yaw===0?0:s.yaw,elevation:s.elevation})),
   safePlayerSpawn:xyz(arena.safePlayerSpawn),
   supplies:arena.supplyPoints.map(s=>({id:s.id,position:xyz(s.position),kind:s.kind})),
   grappleAnchors:arena.grappleAnchors.map(a=>({id:a.id,position:xyz(a.position),tags:[...a.tags]})),
  };
 }finally{arena.dispose();}
}
