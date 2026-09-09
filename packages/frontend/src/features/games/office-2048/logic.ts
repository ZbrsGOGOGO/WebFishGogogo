/** Adapted from Gabriele Cirulli's MIT 2048, commit 478b6ec346e3787f589e4af751378d06ded4cbbc.
 * Momo adaptation: typed immutable state, no storage, scoped input owned by React.
 * Full notice: public/licenses/office-2048-MIT.txt.
 */
export type Direction = 'up' | 'right' | 'down' | 'left';
export interface SheetState { cells:number[];score:number;won:boolean;over:boolean;moves:number }
export function spawnTile(cells:number[],random= Math.random):number[]{
  const next=[...cells],empty=next.map((n,i)=>n===0?i:-1).filter(i=>i>=0);
  if(empty.length)next[empty[Math.min(empty.length-1,Math.max(0,Math.floor(random()*empty.length)))]]=random()<.9?2:4;
  return next;
}
export function newSheet(random=Math.random):SheetState{return {cells:spawnTile(spawnTile(Array(16).fill(0),random),random),score:0,won:false,over:false,moves:0};}
export function canMove(cells:number[]):boolean{return cells.some((n,i)=>n===0||(i%4<3&&n===cells[i+1])||(i<12&&n===cells[i+4]));}
export function moveSheet(state:SheetState,direction:Direction,random=Math.random):SheetState{
  if(state.over)return state;
  const cells=[...state.cells];let gained=0;
  for(let line=0;line<4;line++){
    const indices=Array.from({length:4},(_,j)=>direction==='left'?line*4+j:direction==='right'?line*4+3-j:direction==='up'?j*4+line:(3-j)*4+line);
    const compact=indices.map(i=>cells[i]).filter(Boolean),merged:number[]=[];
    for(let j=0;j<compact.length;j++){if(compact[j]===compact[j+1]){const n=compact[j]*2;merged.push(n);gained+=n;j++;}else merged.push(compact[j]);}
    for(let j=0;j<4;j++)cells[indices[j]]=merged[j]??0;
  }
  if(cells.every((n,i)=>n===state.cells[i]))return canMove(cells)?state:{...state,over:true};
  const next=spawnTile(cells,random);return {cells:next,score:state.score+gained,won:state.won||next.some(n=>n>=2048),over:!canMove(next),moves:state.moves+1};
}
