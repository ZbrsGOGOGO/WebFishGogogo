export interface UnderrunRuntime {
  ready:Promise<void>;
  resume():void;
  pause():void;
  dispose():void;
  key(code:number,pressed:boolean):void;
  pointer(x:number,y:number,pressed?:boolean):void;
  stats():{active:boolean;disposed:boolean;ready:boolean;completed:boolean;framePending:boolean;pendingTasks:number;level:number;repaired:number;total:number};
}
export function createUnderrunRuntime(canvas:HTMLCanvasElement,onNotice?:(notice:string)=>void,onState?:(state:'complete'|'error')=>void):UnderrunRuntime;
