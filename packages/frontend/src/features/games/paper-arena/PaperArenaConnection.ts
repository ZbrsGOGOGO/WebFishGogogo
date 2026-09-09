import { isPaperArenaInput,PAPER_ARENA_PROTOCOL_VERSION,PAPER_ARENA_MAP_VERSION,PAPER_ARENA_WEAPON_IDS,PAPER_ARENA_WEAPONS,type PaperArenaInput,type PaperArenaRoomView } from '@stealth-reader/shared';
import { getCommunitySessionGeneration } from '../../../api/community-http';
import { paperArenaApi,paperArenaSocketUrl } from './paper-arena-api';

export type PaperArenaConnectionStatus='connecting'|'online'|'reconnecting'|'offline'|'outdated';
export const PAPER_ARENA_UPGRADE_MESSAGE='对战版本已更新，请刷新页面后重新进入，避免使用旧地图或旧武器判定。';
export function isPaperRoomVersion(value:unknown):boolean{
  if(!value||typeof value!=='object')return false;
  const room=value as Partial<PaperArenaRoomView>;
  return room.protocolVersion===PAPER_ARENA_PROTOCOL_VERSION&&room.mapVersion===PAPER_ARENA_MAP_VERSION;
}
export function isPaperRoomSnapshot(value:unknown,roomId:string):value is PaperArenaRoomView{
  if(!isPaperRoomVersion(value))return false;const room=value as PaperArenaRoomView;
  const count=(n:unknown,max=2_147_483_647)=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0&&n<=max;
  return room.id===roomId&&typeof room.name==='string'&&typeof room.myPlayerId==='string'
    &&Number.isInteger(room.maxPlayers)&&room.maxPlayers>=4&&room.maxPlayers<=8&&count(room.targetKills,100)&&room.targetKills>=20
    &&['waiting','running','finished'].includes(room.status)&&Array.isArray(room.players)&&room.players.length>0&&room.players.length<=8
    &&new Set(room.players.map(player=>player?.id)).size===room.players.length&&room.players.some(player=>player?.id===room.myPlayerId)
    &&room.players.every(player=>Boolean(player)&&typeof player.id==='string'&&typeof player.name==='string'&&['red','blue'].includes(player.team)
      &&[player.x,player.y,player.z,player.vy,player.yaw,player.pitch,player.respawnAt,player.protectedUntil,player.reloadingUntil,player.switchingUntil,player.actionUntil,player.lastShotAt,player.blockStamina,player.lastBlockAt].every(Number.isFinite)
      &&Math.abs(player.x)<1000&&Math.abs(player.y)<1000&&Math.abs(player.z)<1000&&Math.abs(player.vy)<1000&&Math.abs(player.yaw)<=Math.PI*2&&Math.abs(player.pitch)<=1.2
      &&count(player.hp,100)&&count(player.kills)&&count(player.deaths)&&count(player.shotSeq)
      &&[player.grounded,player.aiming,player.blocking,player.sprinting,player.connected,player.isBot].every(flag=>typeof flag==='boolean')
      &&PAPER_ARENA_WEAPON_IDS.includes(player.weapon)&&Boolean(player.arsenal)
      &&PAPER_ARENA_WEAPON_IDS.every(id=>{const ammo=player.arsenal[id];return Boolean(ammo)&&count(ammo.ammo,PAPER_ARENA_WEAPONS[id].magazineSize??0)&&count(ammo.reserve,10000);})
      &&player.ammo===player.arsenal[player.weapon].ammo&&player.reserve===player.arsenal[player.weapon].reserve)
    &&Boolean(room.game)&&count(room.game.elapsedMs)&&count(room.game.tick)&&Boolean(room.game.scores)&&count(room.game.scores.red)&&count(room.game.scores.blue)
    &&[null,'red','blue','draw'].includes(room.game.winner)&&Array.isArray(room.game.shots)&&room.game.shots.length<=128
    &&room.game.shots.every(shot=>Boolean(shot)&&[shot.id,shot.x,shot.y,shot.z,shot.endX,shot.endY,shot.endZ,shot.at].every(Number.isFinite)&&PAPER_ARENA_WEAPON_IDS.includes(shot.weapon)&&typeof shot.shooterId==='string');
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
      if(!isPaperRoomVersion(ticket)){this.upgradeRequired();return;}
      const socket=new WebSocket(paperArenaSocketUrl(ticket.wsPath));this.socket=socket;this.receivedAt=Date.now();
      socket.onopen=()=>{if(this.stopped||this.session!==getCommunitySessionGeneration()){socket.close();return;}socket.send(JSON.stringify({type:'paper.authenticate',protocolVersion:PAPER_ARENA_PROTOCOL_VERSION,ticket:ticket.ticket}));};
      socket.onmessage=(event)=>{
        if(this.stopped||socket!==this.socket||this.session!==getCommunitySessionGeneration())return;
        if(typeof event.data!=='string'||event.data.length>100000)return;
        let payload:Record<string,unknown>;try{payload=JSON.parse(event.data) as Record<string,unknown>;}catch{return;}
        if(!payload||typeof payload!=='object')return;
        if(payload.type==='paper.authenticated'){if(!isPaperRoomVersion(payload)){this.upgradeRequired();return;}this.receivedAt=Date.now();this.authenticated=true;this.sequence=0;this.attempts=0;this.events.status('online');}
        else if(this.authenticated&&payload.type==='paper.snapshot'){
          if(payload.room&&typeof payload.room==='object'&&(payload.room as {id?:unknown}).id===this.roomId&&!isPaperRoomVersion(payload.room)){this.upgradeRequired();return;}
          if(isPaperRoomSnapshot(payload.room,this.roomId)){this.receivedAt=Date.now();this.events.snapshot(payload.room);}
        }
        else if(payload.type==='paper.error'){if(payload.code==='PAPER_PROTOCOL_UPGRADE_REQUIRED'){this.upgradeRequired();return;}this.events.error(typeof payload.message==='string'?payload.message.slice(0,300):'房间操作未完成，请检查连接。');}
      };
      socket.onclose=(event)=>{if(socket!==this.socket)return;this.authenticated=false;this.socket=null;if(this.heartbeatTimer)clearInterval(this.heartbeatTimer);this.heartbeatTimer=null;if(event.code===4406){this.upgradeRequired();return;}this.retry();};
      socket.onerror=()=>{this.events.error('实时连接中断；未代替服务器继续计算战果。');};
      this.heartbeatTimer=setInterval(()=>{if(this.session!==getCommunitySessionGeneration()){this.events.status('offline');this.stop();return;}if(Date.now()-this.receivedAt>15000&&socket.readyState===WebSocket.OPEN)socket.close(4000,'snapshot timeout');},3000);
    }catch(error){if(!this.stopped&&!this.controller?.signal.aborted){this.events.error(error instanceof Error?'暂时无法连接房间，请稍后重新进入。':'连接失败');this.retry();}}
  }
  send(input:Omit<PaperArenaInput,'seq'>):boolean{
    if(this.stopped||!this.authenticated||this.socket?.readyState!==WebSocket.OPEN||this.session!==getCommunitySessionGeneration())return false;
    const payload={seq:this.sequence,forward:input.forward,strafe:input.strafe,yaw:input.yaw,pitch:input.pitch,fire:input.fire,reload:input.reload};
    for(const key of ['weapon','aim','jump','sprint'] as const)if(input[key]!==undefined)Object.assign(payload,{[key]:input[key]});
    if(!isPaperArenaInput(payload))return false;
    this.sequence++;this.socket.send(JSON.stringify({type:'paper.input',...payload}));return true;
  }
  private upgradeRequired():void{this.events.error(PAPER_ARENA_UPGRADE_MESSAGE);this.events.status('outdated');this.stop();}
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
