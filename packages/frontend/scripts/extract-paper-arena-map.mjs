// Apache-2.0 source-derived metadata. No renderer/context/browser is required.
// Default --check compares every value; --print emits reviewed JSON to stdout.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createServer} from 'vite';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.resolve(root,'../shared/src/paper-arena-original.generated.json');
assert.ok(process.argv.length<=3&&['--check','--print'].includes(process.argv[2]??'--check'));
const vite=await createServer({configFile:false,root,server:{middlewareMode:true},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom',logLevel:'error'});
try{
 const {buildArena}=await vite.ssrLoadModule('/src/features/games/ballpoint-breach/runtime/level/ArenaBuilder.ts');
 const {serializeOriginalPaperArena}=await vite.ssrLoadModule('/src/features/games/paper-arena/paper-arena-map-extraction.ts');
 const data=serializeOriginalPaperArena(buildArena);
 data.source.builderSha256=createHash('sha256').update(await readFile(path.join(root,'src/features/games/ballpoint-breach/runtime/level/ArenaBuilder.ts'))).digest('hex');
 if(process.argv[2]==='--print')process.stdout.write(JSON.stringify(data,null,2)+'\n');
 else{assert.deepEqual(data,JSON.parse(await readFile(target,'utf8')));console.log(`PASS deterministic source map: ${data.colliders.length} colliders, ${data.raycastBoxes.length} raycast meshes, ${data.waypoints.length} waypoints, ${data.spawns.length} original spawns; every value matches`);}
}finally{await vite.close();}
