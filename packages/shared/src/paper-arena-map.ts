/** Source-derived Ballpoint Breach arena (Apache-2.0); original solo build is
 * untouched. THREE belongs only to the extraction/visual adapter, never here.
 * x/y/z are box CENTRES; a player's y is their feet, not the camera height. */
import original from './paper-arena-original.generated.json';

export type PaperMapCategory = 'ground'|'wall'|'platform'|'step'|'cover'|'column'|'breakable'|'raycast-only';
export type PaperMapMaterial = 'paper'|'shade'|'lavender'|'orange'|'deep';
export interface PaperMapBox {
  id:string;x:number;y:number;z:number;w:number;h:number;d:number;
  category:PaperMapCategory;tags:readonly string[];source:'original'|'extension';walkableTop:boolean;
}
export interface PaperMapExtensionBox extends PaperMapBox {material:PaperMapMaterial}
export interface PaperMapPoint {x:number;y:number;z:number}
export interface PaperMapSpawn extends PaperMapPoint {id:string;yaw:number;source:'original-ground'|'outer-ring'}
export interface PaperMapNavNode extends PaperMapPoint {id:string;neighbors:number[]}
export interface PaperMapNavigation {nodes:PaperMapNavNode[];cellSize:1;stairNodeCount:number}
export const PAPER_ARENA_ORIGINAL_METADATA=original;
export const PAPER_ARENA_REMOVED_ORIGINAL_IDS=['main-ground','rear-perimeter','right-perimeter','left-perimeter-rear','front-safety-wall'] as const;
const removed=new Set<string>(PAPER_ARENA_REMOVED_ORIGINAL_IDS);
const bounds={minX:-48,maxX:48,minZ:-58,maxZ:44} as const;
const EPS=0.00001;
const box=(id:string,x:number,y:number,z:number,w:number,h:number,d:number,category:PaperMapCategory,material:PaperMapMaterial,tags:string[]=[]):PaperMapExtensionBox=>({id,x,y,z,w,h,d,category,material,tags:['multiplayer-extension',...tags],source:'extension',walkableTop:category!=='column'&&category!=='wall'});

/** Actual rendered expansion geometry, not invisible authority-only walls. */
const extensionBoxes:PaperMapExtensionBox[]=[
 box('mp-ground',0,-.175,-7,96,.35,102,'ground','paper',['safe-floor']),
 box('mp-north-boundary',0,3.6,-58.275,97.1,7.2,.55,'wall','deep',['perimeter']),
 box('mp-south-boundary',0,.7,44.275,97.1,1.4,.55,'wall','shade',['perimeter']),
 box('mp-west-boundary',-48.275,2.7,-7,.55,5.4,102,'wall','lavender',['perimeter']),
 box('mp-east-boundary',48.275,3.6,-7,.55,7.2,102,'wall','deep',['perimeter']),
];
// Four outer corridors retain several metre-wide through lanes and alternate
// waist/head-height cover. Old landmarks remain at their exact world positions.
for(const [index,x]of [-30,-10,10,30].entries())extensionBoxes.push(box(`mp-north-cargo-${index}`,x,1.15,-51,5,2.3,2.6,'cover',index%2?'shade':'orange',['outer-ring','north','cargo']));
for(const [index,x]of [-20,0,20].entries())extensionBoxes.push(box(`mp-north-low-${index}`,x,.55,-55.3,4,1.1,.65,'cover','paper',['outer-ring','north']));
for(const sign of [-1,1]){
 const side=sign<0?'west':'east';
 for(const [index,z]of [-37,-17,5,26].entries())extensionBoxes.push(box(`mp-${side}-cargo-${index}`,sign*40,1.2,z,3,2.4,5,'cover',index%2?'lavender':'orange',['outer-ring',side,'cargo']));
 for(const [index,z]of [-27,-5,16].entries())extensionBoxes.push(box(`mp-${side}-low-${index}`,sign*44.5,.6,z,.65,1.2,4,'cover','shade',['outer-ring',side]));
}
for(const [index,x]of [-27,-9,9,27].entries())extensionBoxes.push(box(`mp-south-cargo-${index}`,x,.7,38,5,1.4,2.2,'cover',index%2?'shade':'orange',['outer-ring','south','cargo']));
for(const [index,x]of [-18,0,18].entries())extensionBoxes.push(box(`mp-south-crosscover-${index}`,x,1.1,34.5,1,2.2,3.5,'cover','lavender',['outer-ring','south']));

function sourceBox(c:{id:string;min:number[];max:number[];category?:string;tags?:string[]}):PaperMapBox{
 return {id:c.id,x:(c.min[0]+c.max[0])/2,y:(c.min[1]+c.max[1])/2,z:(c.min[2]+c.max[2])/2,w:c.max[0]-c.min[0],h:c.max[1]-c.min[1],d:c.max[2]-c.min[2],category:(c.category??'raycast-only') as PaperMapCategory,tags:c.tags??[],source:'original',walkableTop:c.category!==undefined&&c.category!=='column'&&c.category!=='wall'};
}
const originalColliders=original.colliders.filter(c=>!removed.has(c.id.replace(/^collider-/,''))).map(sourceBox);
const colliders:PaperMapBox[]=[...originalColliders,...extensionBoxes];
// Original supply visual pedestals/diamonds are hidden: no local pickups may
// pretend to refill a server weapon. Aircraft/rails never belonged to raycasts.
const raycastBoxes:PaperMapBox[]=[...original.raycastBoxes.filter(b=>!removed.has(b.id)&&!/^supply-\d+-/.test(b.id)).map(sourceBox),...extensionBoxes];
const stairHints=originalColliders.filter(c=>c.category==='step').map(c=>({id:c.id,x:c.x,y:c.y+c.h/2,z:c.z}));
export const PAPER_ARENA_MAP={
 id:'office-expanded-v2',width:96,depth:102,groundY:0,bounds,wallHeight:7.2,
 colliders,obstacles:colliders,raycastBoxes,extensionBoxes,stairHints,
 get spawnPoints():readonly PaperMapSpawn[]{return getPaperArenaSpawnPoints();},
 removedOriginalIds:PAPER_ARENA_REMOVED_ORIGINAL_IDS,
 hiddenOriginalGroups:original.supplies.map(s=>s.id),
 originalLandmarks:['four-level-open-scaffold','west-yard-building','west-yard-upper','utility-roof-building','utility-roof-upper','site-office-building','site-office-upper','elevated-walkways','construction-crane','construction-props','sky-scout-aircraft'],
 decorationOnly:'Original supply markers hidden; scout aircraft/rails non-interactive; wood barricades static in multiplayer.',
} as const;

// Small spatial broad phase for both server physics and deterministic nav.
const CELL=4,spatial=new Map<string,PaperMapBox[]>();
const bucketKey=(x:number,z:number)=>`${x}:${z}`;
for(const c of colliders)for(let x=Math.floor((c.x-c.w/2)/CELL);x<=Math.floor((c.x+c.w/2)/CELL);x++)for(let z=Math.floor((c.z-c.d/2)/CELL);z<=Math.floor((c.z+c.d/2)/CELL);z++){
 const key=bucketKey(x,z),bucket=spatial.get(key);if(bucket)bucket.push(c);else spatial.set(key,[c]);
}
function nearby(x:number,z:number,radius:number):PaperMapBox[]{
 const found=new Set<PaperMapBox>();for(let ix=Math.floor((x-radius)/CELL);ix<=Math.floor((x+radius)/CELL);ix++)for(let iz=Math.floor((z-radius)/CELL);iz<=Math.floor((z+radius)/CELL);iz++)for(const c of spatial.get(bucketKey(ix,iz))??[])found.add(c);return [...found];
}
export function paperArenaMapBodyClear(x:number,y:number,z:number,radius=.38,height=1.8,allowStep=false):boolean{
 if(![x,y,z,radius,height].every(Number.isFinite)||radius<=0||radius>2||height<=0||height>5||x-radius<bounds.minX||x+radius>bounds.maxX||z-radius<bounds.minZ||z+radius>bounds.maxZ)return false;
 for(const c of nearby(x,z,radius)){
  if(c.y+c.h/2<=y+(allowStep?.46:0)+EPS||c.y-c.h/2>=y+height-EPS)continue;
  const dx=Math.max(Math.abs(x-c.x)-c.w/2,0),dz=Math.max(Math.abs(z-c.z)-c.d/2,0);
  if(dx*dx+dz*dz<radius*radius-EPS)return false;
 }
 return true;
}
/** Highest actual top touched by the circular feet below maxY; matches the
 * original PhysicsWorld support semantics. bodyClear separately checks headroom. */
export function paperArenaMapFloor(x:number,z:number,maxY:number,radius=.38):number|null{
 if(![x,z,maxY,radius].every(Number.isFinite)||radius<=0||radius>2||x<bounds.minX||x>bounds.maxX||z<bounds.minZ||z>bounds.maxZ)return null;
 let top:number|null=null;
 for(const c of nearby(x,z,radius)){const dx=Math.max(Math.abs(x-c.x)-c.w/2,0),dz=Math.max(Math.abs(z-c.z)-c.d/2,0);if(dx*dx+dz*dz>=radius*radius-EPS)continue;const y=c.y+c.h/2;if(y<=maxY+EPS&&(top===null||y>top))top=y;}
 return top;
}
/** Same cylinder/max-step semantics as player movement, sampled more densely
 * than the shortest original tread. Never accepts a straight wall-crossing edge. */
export function paperArenaMapNavEdge(from:PaperMapPoint,to:PaperMapPoint):boolean{
 if(!paperArenaMapBodyClear(from.x,from.y,from.z,.38,1.8,true)||!paperArenaMapBodyClear(to.x,to.y,to.z,.38,1.8,true))return false;
 const distance=Math.hypot(to.x-from.x,to.z-from.z);if(distance>1.8||distance<EPS)return false;
 const steps=Math.max(1,Math.ceil(distance/.08));let y=from.y;
 for(let i=1;i<=steps;i++){
  const x=from.x+(to.x-from.x)*i/steps,z=from.z+(to.z-from.z)*i/steps;
  const floor=paperArenaMapFloor(x,z,y+.46);if(floor===null||y-floor>.65)return false;
  // Try stepping onto a reachable top before rejecting the leading riser.
  if(!paperArenaMapBodyClear(x,floor,z,.38,1.8,true))return false;y=floor;
 }
 return Math.abs(y-to.y)<.03;
}
let navigation:PaperMapNavigation|undefined;
let spawnPoints:PaperMapSpawn[]|undefined;
export function getPaperArenaSpawnPoints():readonly PaperMapSpawn[]{
 if(spawnPoints)return spawnPoints;
 const candidates:PaperMapSpawn[]=original.spawns.filter(s=>s.elevation==='ground').map(s=>({id:s.id,x:s.position[0],y:0,z:s.position[2],yaw:s.yaw,source:'original-ground'}));
 for(const x of [-45.5,45.5])for(const z of [-52,-42,-32,-20,-8,12,31,40])candidates.push({id:`outer:${x}:${z}`,x,y:0,z,yaw:Math.atan2(-x,-7-z),source:'outer-ring'});
 for(const z of [-54.5,41.5])for(const x of [-36,-24,-16,-4,4,16,24,36])candidates.push({id:`outer:${x}:${z}`,x,y:0,z,yaw:Math.atan2(-x,-7-z),source:'outer-ring'});
 spawnPoints=candidates.filter(s=>{const y=paperArenaMapFloor(s.x,s.z,.46,.65);if(y===null||y>.46||!paperArenaMapBodyClear(s.x,y,s.z,.65))return false;s.y=y;return true;});
 return spawnPoints;
}
/** Lazy, pure and deterministic: renderer does not construct the bot graph.
 * Ground/roof 1m samples plus every actual tread centre (narrow stairs matter). */
export function getPaperArenaNavigation():PaperMapNavigation{
 if(navigation)return navigation;
 const nodes:PaperMapNavNode[]=[],positions=new Set<string>();
 const add=(x:number,y:number,z:number,id:string)=>{
  for(let i=0;i<6;i++){const top=paperArenaMapFloor(x,z,y+.46);if(top===null||top<=y+EPS)break;y=top;}
  if(!paperArenaMapBodyClear(x,y,z))return;
  const key=`${x.toFixed(4)}:${y.toFixed(4)}:${z.toFixed(4)}`;if(positions.has(key))return;positions.add(key);nodes.push({id,x,y,z,neighbors:[]});
 };
 for(let x=bounds.minX+1;x<bounds.maxX;x++)for(let z=bounds.minZ+1;z<bounds.maxZ;z++){
  const heights=new Set<number>();for(const c of nearby(x,z,.38))if(c.walkableTop&&Math.abs(x-c.x)<=c.w/2+.38&&Math.abs(z-c.z)<=c.d/2+.38)heights.add(c.y+c.h/2);
  for(const y of [...heights].sort((a,b)=>a-b))add(x,y,z,`grid:${x}:${z}:${y.toFixed(4)}`);
 }
 for(const hint of stairHints)add(hint.x,hint.y,hint.z,hint.id);
 // Actual per-tread positions also need reachable approach/exit points at each
 // flight: the broad 1m grid alone may straddle an entire steep staircase.
 const flights=new Map<string,typeof stairHints>();for(const h of stairHints){const id=h.id.replace(/-step-\d+$/,'');const list=flights.get(id);if(list)list.push(h);else flights.set(id,[h]);}
 for(const [id,steps]of flights){
  steps.sort((a,b)=>a.y-b.y);const alongX=Math.abs(steps[1].x-steps[0].x)>Math.abs(steps[1].z-steps[0].z);
  // Building-side staircase centres can touch the facade; use the full actual
  // tread width rather than pretending its centreline is the only valid route.
  for(const h of steps){const c=originalColliders.find(c=>c.id===h.id)!;const offset=Math.max(0,(alongX?c.d:c.w)/2-.39);for(const side of [-1,1])add(h.x+(alongX?0:offset*side),h.y,h.z+(alongX?offset*side:0),`${h.id}:lane:${side}`);}
  for(const [a,b,index]of [[steps[0],steps[1],-1],[steps.at(-1)!,steps.at(-2)!,-2]] as const){const x=a.x+(a.x-b.x),z=a.z+(a.z-b.z);const y=paperArenaMapFloor(x,z,a.y+.46);if(y!==null)add(x,y,z,`${id}:landing:${index}`);}
 }
 const byCell=new Map<string,number[]>();for(const [i,n]of nodes.entries()){const key=bucketKey(Math.floor(n.x),Math.floor(n.z)),list=byCell.get(key);if(list)list.push(i);else byCell.set(key,[i]);}
 for(const [i,n]of nodes.entries())for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)for(const j of byCell.get(bucketKey(Math.floor(n.x)+dx,Math.floor(n.z)+dz))??[]){
  if(j<=i)continue;const m=nodes[j];if(Math.abs(n.y-m.y)>1.4||Math.hypot(n.x-m.x,n.z-m.z)>1.5)continue;
  if(paperArenaMapNavEdge(n,m)&&paperArenaMapNavEdge(m,n)){n.neighbors.push(j);m.neighbors.push(i);}
 }
 // Do not spawn/steer bots onto a visually plausible but isolated roof/cover.
 const visited=new Set<number>();let largest:number[]=[];
 for(let start=0;start<nodes.length;start++){if(visited.has(start))continue;const component=[start];visited.add(start);for(let k=0;k<component.length;k++)for(const next of nodes[component[k]].neighbors)if(!visited.has(next)){visited.add(next);component.push(next);}if(component.length>largest.length)largest=component;}
 largest.sort((a,b)=>a-b);const remap=new Map(largest.map((n,i)=>[n,i]));const kept=largest.map(i=>({...nodes[i],neighbors:nodes[i].neighbors.filter(n=>remap.has(n)).map(n=>remap.get(n)!)}));
 navigation={nodes:kept,cellSize:1,stairNodeCount:kept.filter(n=>n.id.startsWith('collider-')).length};
 return navigation;
}
