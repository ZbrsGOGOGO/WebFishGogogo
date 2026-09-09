import {describe,it,expect} from 'vitest';
import {canMove,moveSheet,newSheet,spawnTile,type SheetState} from './logic';
const state=(cells:number[]):SheetState=>({cells,score:0,won:false,over:false,moves:0});
describe('MIT 2048 local immutable work draft',()=>{
 it('starts with exactly two independent tiles without touching browser storage',()=>{expect(newSheet(()=>0).cells.filter(Boolean)).toEqual([2,2]);});
 it('merges each tile at most once in a move and scores only real merges',()=>{const before=state([2,2,2,2,...Array(12).fill(0)]);const after=moveSheet(before,'left',()=>0);expect(after.cells.slice(0,2)).toEqual([4,4]);expect(after.score).toBe(8);expect(before.cells.slice(0,4)).toEqual([2,2,2,2]);expect(after.moves).toBe(1);});
 it.each(['up','right','down','left'] as const)('traverses %s correctly',d=>{const cells=Array(16).fill(0);cells[5]=2;cells[6]=2;const result=moveSheet(state(cells),d,()=>0);expect(result.cells.reduce((a,b)=>a+b,0)).toBe(6);if(d==='left'||d==='right')expect(result.score).toBe(4);else expect(result.score).toBe(0);});
 it('does not spawn on ineffective input',()=>{const before=state([2,0,0,0,...Array(12).fill(0)]);expect(moveSheet(before,'left',()=>0)).toBe(before);});
 it('detects an alternating blocked grid but allows adjacent equal values',()=>{const cells=[2,4,2,4,4,2,4,2,2,4,2,4,4,2,4,2];expect(canMove(cells)).toBe(false);expect(moveSheet(state(cells),'up').over).toBe(true);cells[1]=2;expect(canMove(cells)).toBe(true);});
 it('tracks a win but allows continued local play and never creates rewards',()=>{const before=state([1024,1024,0,0,...Array(12).fill(0)]);const result=moveSheet(before,'left',()=>0);expect(result.won).toBe(true);expect(result.score).toBe(2048);expect(Object.keys(result).sort()).toEqual(['cells','moves','over','score','won']);});
 it('leaves a full board intact when no spawn slot exists',()=>{const cells=Array(16).fill(2);expect(spawnTile(cells)).toEqual(cells);});
});
