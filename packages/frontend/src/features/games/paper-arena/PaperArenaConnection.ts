import { isPaperArenaInput,type PaperArenaInput,type PaperArenaRoomView } from '@stealth-reader/shared';
import { getCommunitySessionGeneration } from '../../../api/community-http';
import { paperArenaApi,paperArenaSocketUrl } from './paper-arena-api';

export type PaperArenaConnectionStatus='connecting'|'online'|'reconnecting'|'offline';
export function isPaperRoomSnapshot(value:unknown,roomId:string):value is PaperArenaRoomView{
  if(!value||typeof value!=='object')return false;const room=value as PaperArenaRoomView;
  return room.id===roomId&&typeof room.myPlayerId==='string'&&['waiting','running','finished'].includes(room.status)&&Array.isArray(room.players)&&room.players.length<=8&&room.players.every(player=>typeof player.id==='string'&&typeof player.name==='string'&&['red','blue'].includes(player.team)&&[player.x,player.z,player.yaw,player.pitch,player.hp,player.ammo,player.respawnAt,player.protectedUntil,player.reloadingUntil,player.shotSeq].every(Number.isFinite))&&Boolean(room.game)&&Number.isFinite(room.game.elapsedMs)&&Number.isFinite(room.game.tick)&&room.game.scores&&Number.isFinite(room.game.scores.red)&&Number.isFinite(room.game.scores.blue)&&Array.isArray(room.game.shots)&&room.game.shots.length<=128&&room.game.shots.every(shot=>[shot.id,shot.x,shot.y,shot.z,shot.endX,shot.endY,shot.endZ,shot.at].every(Number.isFinite));
}

/** Single-use ticket is sent only inside the socket, never in a URL or persistent storage. */
export class PaperArenaConnection{
  private socket:WebSocket|null=null;
  private controller:AbortController|null=null;
  private retryTimer:ReturnType<typeof setTimeout>|null=null;
  private heartbeatTimer:ReturnType<typeof setInterval>|null=null;
  private stopped=false;
  private authenticated=false;
  private attempts=0;
  private sequence=0;
  private receivedAt=0;
  private readonly session=getCommunitySessionGeneration();
  constructor(private readonly roomId:string,private readonly events:{snapshot:(room:PaperArenaRoomView)=>void;status:(status:PaperArenaConnectionStatus)=>void;error:(message:string)=>void}){}
  async connect():Promise<void>{
    if(this.stopped||this.session!==getCommunitySessionGeneration())return;
    this.events.status(this.attempts?'reconnecting':'connecting');
    this.controller=new AbortController();
    try{
      const ticket=await paperArenaApi.ticket(this.roomId,this.controller.signal);
      if(this.stopped||this.session!==getCommunitySessionGeneration())return;
      const socket=new WebSocket(paperArenaSocketUrl(ticket.wsPath));this.socket=socket;this.receivedAt=Date.now();
      socket.onopen=()=>{if(this.stopped||this.session!==getCommunitySessionGeneration()){socket.close();return;}socket.send(JSON.stringify({type:'paper.authenticate',protocolVersion:1,ticket:ticket.ticket}));};
      socket.onmessage=(event)=>{
        if(this.stopped||socket!==this.socket||this.session!==getCommunitySessionGeneration())return;
        if(typeof event.data!=='string'||event.data.length>100000)return;
        let payload:Record<string,unknown>;try{payload=JSON.parse(event.data) as Record<string,unknown>;}catch{return;}
        if(!payload||typeof payload!=='object')return;
        this.receivedAt=Date.now();
        if(payload.type==='paper.authenticated'){this.authenticated=true;this.sequence=0;this.attempts=0;this.events.status('online');}
        else if(this.authenticated&&payload.type==='paper.snapshot'&&isPaperRoomSnapshot(payload.room,this.roomId)){this.events.snapshot(payload.room);}
        else if(payload.type==='paper.error'){this.events.error(typeof payload.message==='string'?payload.message.slice(0,300):'房间操作未完成，请检查连接。');}
      };
      socket.onclose=()=>{if(socket!==this.socket)return;this.authenticated=false;this.socket=null;if(this.heartbeatTimer)clearInterval(this.heartbeatTimer);this.heartbeatTimer=null;this.retry();};
      socket.onerror=()=>{this.events.error('实时连接中断；未代替服务器继续计算战果。');};
      this.heartbeatTimer=setInterval(()=>{if(this.session!==getCommunitySessionGeneration()){this.events.status('offline');this.stop();return;}if(Date.now()-this.receivedAt>15000&&socket.readyState===WebSocket.OPEN)socket.close(4000,'snapshot timeout');},3000);
    }catch(error){if(!this.stopped&&!this.controller?.signal.aborted){this.events.error(error instanceof Error?'暂时无法连接房间，请稍后重新进入。':'连接失败');this.retry();}}
  }
  send(input:Omit<PaperArenaInput,'seq'>):boolean{
    if(this.stopped||!this.authenticated||this.socket?.readyState!==WebSocket.OPEN||this.session!==getCommunitySessionGeneration())return false;
    const payload={seq:this.sequence,forward:input.forward,strafe:input.strafe,yaw:input.yaw,pitch:input.pitch,fire:input.fire,reload:input.reload};
    if(!isPaperArenaInput(payload))return false;
    this.sequence++;this.socket.send(JSON.stringify({type:'paper.input',...payload}));return true;
  }
  private retry():void{
    if(this.stopped||this.session!==getCommunitySessionGeneration())return;
    if(this.attempts>=5){this.events.status('offline');return;}
    this.events.status('reconnecting');const delay=Math.min(8000,500*2**this.attempts++);
    this.retryTimer=setTimeout(()=>{void this.connect();},delay);
  }
  stop():void{
    if(this.stopped)return;
    this.send({forward:0,strafe:0,yaw:0,pitch:0,fire:false,reload:false});this.stopped=true;this.authenticated=false;
    this.controller?.abort();if(this.retryTimer)clearTimeout(this.retryTimer);if(this.heartbeatTimer)clearInterval(this.heartbeatTimer);
    const socket=this.socket;this.socket=null;if(socket){socket.onopen=null;socket.onmessage=null;socket.onclose=null;socket.onerror=null;socket.close(1000,'view closed');}
  }
}
