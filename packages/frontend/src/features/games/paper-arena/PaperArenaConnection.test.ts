import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import type { PaperArenaRoomView } from '@stealth-reader/shared';
import { setCommunitySessionTokens } from '../../../api/community-http';
import { paperArenaApi,paperArenaSocketUrl } from './paper-arena-api';
import { PaperArenaConnection,isPaperRoomSnapshot } from './PaperArenaConnection';
vi.mock('./paper-arena-api',async()=>{const actual=await vi.importActual<typeof import('./paper-arena-api')>('./paper-arena-api');return {...actual,paperArenaApi:{ticket:vi.fn()}};});
class FakeSocket{
  static OPEN=1;static CONNECTING=0;static CLOSED=3;static instances:FakeSocket[]=[];
  readyState=0;url:string;sent:string[]=[];onopen:(()=>void)|null=null;onmessage:((event:{data:string})=>void)|null=null;onclose:(()=>void)|null=null;onerror:(()=>void)|null=null;
  constructor(url:string){this.url=url;FakeSocket.instances.push(this);}
  send(value:string){this.sent.push(value);}
  close(){this.readyState=3;this.onclose?.();}
  open(){this.readyState=1;this.onopen?.();}
  message(payload:unknown){this.onmessage?.({data:JSON.stringify(payload)});}
}
export const paperRoomFixture=():PaperArenaRoomView=>({id:'room-test',name:'测试演练',maxPlayers:4,targetKills:30,requiresPassword:false,status:'running',humans:1,expiresAt:Date.now()+600000,hostPlayerId:'seat-1',myPlayerId:'seat-1',serverNow:Date.now(),players:[{id:'seat-1',name:'本人',publicId:'public',team:'red',isBot:false,connected:true,x:1,z:1,yaw:0,pitch:0,hp:100,ammo:24,reloadingUntil:0,respawnAt:0,protectedUntil:0,kills:0,deaths:0,shotSeq:0}],game:{tick:0,elapsedMs:0,scores:{red:0,blue:0},winner:null,shots:[]},rules:'服务器模拟'});
const intent={forward:1,strafe:0,yaw:0,pitch:0,fire:false,reload:false};
describe('paper arena socket authentication and lifecycle',()=>{
  let connections:PaperArenaConnection[]=[];
  beforeEach(()=>{vi.useFakeTimers();FakeSocket.instances=[];vi.stubGlobal('WebSocket',FakeSocket);vi.mocked(paperArenaApi.ticket).mockResolvedValue({ticket:'one-time-private-ticket',expiresAt:'later',wsPath:'/ws/paper-arena'});connections=[];});
  afterEach(()=>{connections.forEach(connection=>connection.stop());vi.unstubAllGlobals();vi.useRealTimers();vi.clearAllMocks();});
  function connection(){const events={snapshot:vi.fn(),status:vi.fn(),error:vi.fn()};const socket=new PaperArenaConnection('room-test',events);connections.push(socket);return{socket,events};}
  it('sends no inputs or snapshot callbacks before ticket authentication and never leaks ticket into URL',async()=>{
    const {socket,events}=connection();await socket.connect();const transport=FakeSocket.instances[0]!;expect(transport.url).not.toContain('private-ticket');expect(transport.url).not.toContain('?');
    expect(socket.send(intent)).toBe(false);transport.open();expect(JSON.parse(transport.sent[0]!)).toEqual({type:'paper.authenticate',protocolVersion:1,ticket:'one-time-private-ticket'});
    transport.message({type:'paper.snapshot',room:paperRoomFixture()});expect(events.snapshot).not.toHaveBeenCalled();
    transport.message({type:'paper.authenticated',playerId:'seat-1'});transport.message({type:'paper.snapshot',room:paperRoomFixture()});expect(events.snapshot).toHaveBeenCalledTimes(1);
    socket.send(intent);socket.send({...intent,fire:true});expect(JSON.parse(transport.sent[1]!)).toEqual({type:'paper.input',seq:0,...intent});expect(JSON.parse(transport.sent[2]!).seq).toBe(1);
  });
  it('ignores malformed and cross-room snapshots, never forwards positions or final scores as inputs',async()=>{
    const {socket,events}=connection();await socket.connect();const transport=FakeSocket.instances[0]!;transport.open();transport.message({type:'paper.authenticated',playerId:'seat-1'});
    transport.message({type:'paper.snapshot',room:{...paperRoomFixture(),id:'other'}});transport.message({type:'paper.snapshot',room:{}});expect(events.snapshot).not.toHaveBeenCalled();
    const malformed=paperRoomFixture();malformed.players[0]!.x=NaN;expect(isPaperRoomSnapshot(malformed,'room-test')).toBe(false);
    socket.send(intent);expect(Object.keys(JSON.parse(transport.sent[1]!))).toEqual(['type','seq','forward','strafe','yaw','pitch','fire','reload']);
  });
  it('obtains a fresh ticket on reconnect, resets input sequence and stops retry timers on teardown',async()=>{
    const {socket}=connection();await socket.connect();const first=FakeSocket.instances[0]!;first.open();first.message({type:'paper.authenticated',playerId:'seat-1'});socket.send(intent);first.close();
    await vi.advanceTimersByTimeAsync(500);expect(paperArenaApi.ticket).toHaveBeenCalledTimes(2);const second=FakeSocket.instances[1]!;second.open();second.message({type:'paper.authenticated',playerId:'seat-1'});socket.send(intent);expect(JSON.parse(second.sent[1]!).seq).toBe(0);
    socket.stop();await vi.advanceTimersByTimeAsync(30000);expect(paperArenaApi.ticket).toHaveBeenCalledTimes(2);expect(second.readyState).toBe(FakeSocket.CLOSED);
  });
  it('does not open a socket for a late ticket after leaving the page',async()=>{
    let resolve!:(value:{ticket:string;expiresAt:string;wsPath:string})=>void;
    vi.mocked(paperArenaApi.ticket).mockImplementation(()=>new Promise(done=>{resolve=done;}));const {socket}=connection();const pending=socket.connect();socket.stop();resolve({ticket:'late',expiresAt:'later',wsPath:'/ws/paper-arena'});await pending;expect(FakeSocket.instances).toHaveLength(0);
  });
  it('stops forwarding after an account switch and closes the old connection without reconnecting',async()=>{
    const {socket}=connection();await socket.connect();const transport=FakeSocket.instances[0]!;transport.open();transport.message({type:'paper.authenticated',playerId:'seat-1'});setCommunitySessionTokens(null);expect(socket.send(intent)).toBe(false);await vi.advanceTimersByTimeAsync(3000);expect(transport.readyState).toBe(FakeSocket.CLOSED);expect(paperArenaApi.ticket).toHaveBeenCalledTimes(1);
  });
  it('refuses an upstream-controlled cross-origin websocket destination',()=>{
    expect(()=>paperArenaSocketUrl('wss://external.invalid/steal')).toThrow();expect(()=>paperArenaSocketUrl('/ws/paper-arena?ticket=secret')).toThrow();expect(paperArenaSocketUrl('/ws/paper-arena')).toMatch(/^wss?:\/\//);
  });
});
