import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { PAPER_ARENA_WEAPON_IDS } from '@stealth-reader/shared';
import { paperRoomFixture } from './PaperArena.testfixtures';
import { setCommunitySessionTokens } from '../../../api/community-http';
import { paperArenaApi,paperArenaSocketUrl } from './paper-arena-api';
import { PaperArenaConnection,isPaperRoomSnapshot } from './PaperArenaConnection';
vi.mock('./paper-arena-api',async()=>{const actual=await vi.importActual<typeof import('./paper-arena-api')>('./paper-arena-api');return {...actual,paperArenaApi:{ticket:vi.fn()}};});
class FakeSocket{
  static OPEN=1;static CONNECTING=0;static CLOSED=3;static instances:FakeSocket[]=[];
  readyState=0;url:string;sent:string[]=[];onopen:(()=>void)|null=null;onmessage:((event:{data:string})=>void)|null=null;onclose:((event:{code:number})=>void)|null=null;onerror:(()=>void)|null=null;
  constructor(url:string){this.url=url;FakeSocket.instances.push(this);}
  send(value:string){this.sent.push(value);}
  close(code=1006){this.readyState=3;this.onclose?.({code});}
  open(){this.readyState=1;this.onopen?.();}
  message(payload:unknown){this.onmessage?.({data:JSON.stringify(payload)});}
}
const intent={forward:1,strafe:0,yaw:0,pitch:0,fire:false,reload:false};
describe('paper arena socket authentication and lifecycle',()=>{
  let connections:PaperArenaConnection[]=[];
  beforeEach(()=>{vi.useFakeTimers();FakeSocket.instances=[];vi.stubGlobal('WebSocket',FakeSocket);vi.mocked(paperArenaApi.ticket).mockResolvedValue({ticket:'one-time-private-ticket',expiresAt:60000,wsPath:'/ws/paper-arena',protocolVersion:2,mapVersion:'office-expanded-v2'});connections=[];});
  afterEach(()=>{connections.forEach(connection=>connection.stop());vi.unstubAllGlobals();vi.useRealTimers();vi.clearAllMocks();});
  function connection(){const events={snapshot:vi.fn(),status:vi.fn(),error:vi.fn()};const socket=new PaperArenaConnection('room-test',events);connections.push(socket);return{socket,events};}
  it('sends no inputs or snapshot callbacks before ticket authentication and never leaks ticket into URL',async()=>{
    const {socket,events}=connection();await socket.connect();const transport=FakeSocket.instances[0]!;expect(transport.url).not.toContain('private-ticket');expect(transport.url).not.toContain('?');
    expect(socket.send(intent)).toBe(false);transport.open();expect(JSON.parse(transport.sent[0]!)).toEqual({type:'paper.authenticate',protocolVersion:2,ticket:'one-time-private-ticket'});
    transport.message({type:'paper.snapshot',room:paperRoomFixture()});expect(events.snapshot).not.toHaveBeenCalled();
    transport.message({type:'paper.authenticated',protocolVersion:2,mapVersion:'office-expanded-v2',playerId:'seat-1'});transport.message({type:'paper.snapshot',room:paperRoomFixture()});expect(events.snapshot).toHaveBeenCalledTimes(1);
    socket.send(intent);socket.send({...intent,fire:true});expect(JSON.parse(transport.sent[1]!)).toEqual({type:'paper.input',seq:0,...intent});expect(JSON.parse(transport.sent[2]!).seq).toBe(1);
  });
  it('ignores malformed and cross-room snapshots, never forwards positions or final scores as inputs',async()=>{
    const {socket,events}=connection();await socket.connect();const transport=FakeSocket.instances[0]!;transport.open();transport.message({type:'paper.authenticated',protocolVersion:2,mapVersion:'office-expanded-v2',playerId:'seat-1'});
    transport.message({type:'paper.snapshot',room:{...paperRoomFixture(),id:'other'}});transport.message({type:'paper.snapshot',room:{}});expect(events.snapshot).not.toHaveBeenCalled();
    const malformed=paperRoomFixture();malformed.players[0]!.x=NaN;expect(isPaperRoomSnapshot(malformed,'room-test')).toBe(false);
    socket.send(intent);expect(Object.keys(JSON.parse(transport.sent[1]!))).toEqual(['type','seq','forward','strafe','yaw','pitch','fire','reload']);
  });
  it('obtains a fresh ticket on reconnect, resets input sequence and stops retry timers on teardown',async()=>{
    const {socket}=connection();await socket.connect();const first=FakeSocket.instances[0]!;first.open();first.message({type:'paper.authenticated',protocolVersion:2,mapVersion:'office-expanded-v2',playerId:'seat-1'});socket.send(intent);first.close();
    await vi.advanceTimersByTimeAsync(500);expect(paperArenaApi.ticket).toHaveBeenCalledTimes(2);const second=FakeSocket.instances[1]!;second.open();second.message({type:'paper.authenticated',protocolVersion:2,mapVersion:'office-expanded-v2',playerId:'seat-1'});socket.send(intent);expect(JSON.parse(second.sent[1]!).seq).toBe(0);
    socket.stop();await vi.advanceTimersByTimeAsync(30000);expect(paperArenaApi.ticket).toHaveBeenCalledTimes(2);expect(second.readyState).toBe(FakeSocket.CLOSED);
  });
  it('does not open a socket for a late ticket after leaving the page',async()=>{
    let resolve!:(value:{ticket:string;expiresAt:number;wsPath:string;protocolVersion:number;mapVersion:string})=>void;
    vi.mocked(paperArenaApi.ticket).mockImplementation(()=>new Promise(done=>{resolve=done;}));const {socket}=connection();const pending=socket.connect();socket.stop();resolve({ticket:'late',expiresAt:60000,wsPath:'/ws/paper-arena',protocolVersion:2,mapVersion:'office-expanded-v2'});await pending;expect(FakeSocket.instances).toHaveLength(0);
  });
  it('stops forwarding after an account switch and closes the old connection without reconnecting',async()=>{
    const {socket}=connection();await socket.connect();const transport=FakeSocket.instances[0]!;transport.open();transport.message({type:'paper.authenticated',protocolVersion:2,mapVersion:'office-expanded-v2',playerId:'seat-1'});setCommunitySessionTokens(null);expect(socket.send(intent)).toBe(false);await vi.advanceTimersByTimeAsync(3000);expect(transport.readyState).toBe(FakeSocket.CLOSED);expect(paperArenaApi.ticket).toHaveBeenCalledTimes(1);
  });
  it('refuses an upstream-controlled cross-origin websocket destination',()=>{
    expect(()=>paperArenaSocketUrl('wss://external.invalid/steal')).toThrow();expect(()=>paperArenaSocketUrl('/ws/paper-arena?ticket=secret')).toThrow();expect(paperArenaSocketUrl('/ws/paper-arena')).toMatch(/^wss?:\/\//);
  });
  it('forwards all five weapon intents but strips forged position, health and outcome fields',async()=>{
    const {socket}=connection();await socket.connect();const transport=FakeSocket.instances[0]!;transport.open();transport.message({type:'paper.authenticated',protocolVersion:2,mapVersion:'office-expanded-v2',playerId:'seat-1'});
    for(const weapon of PAPER_ARENA_WEAPON_IDS){const input={...intent,weapon,aim:true,jump:true,sprint:true,x:99,hp:999,score:100};expect(socket.send(input)).toBe(true);const frame=JSON.parse(transport.sent.at(-1)!);expect(frame).toMatchObject({weapon,aim:true,jump:true,sprint:true});expect(frame).not.toHaveProperty('x');expect(frame).not.toHaveProperty('hp');expect(frame).not.toHaveProperty('score');}
  });
  it('requires protocol v2 before spending a ticket or opening the transport',async()=>{
    vi.mocked(paperArenaApi.ticket).mockResolvedValue({ticket:'old',expiresAt:60000,wsPath:'/ws/paper-arena',protocolVersion:1,mapVersion:'office-expanded-v2'});
    const {socket,events}=connection();await socket.connect();expect(FakeSocket.instances).toHaveLength(0);expect(events.status).toHaveBeenLastCalledWith('outdated');expect(events.error).toHaveBeenCalledWith(expect.stringContaining('刷新'));
    await vi.advanceTimersByTimeAsync(30000);expect(paperArenaApi.ticket).toHaveBeenCalledTimes(1);
  });
  it.each(['error','close','snapshot'])('stops reconnect loops when %s reports incompatible protocol or map',async(kind)=>{
    const {socket,events}=connection();await socket.connect();const transport=FakeSocket.instances[0]!;transport.open();transport.message({type:'paper.authenticated',protocolVersion:2,mapVersion:'office-expanded-v2',playerId:'seat-1'});
    if(kind==='close')transport.close(4406);else if(kind==='error')transport.message({type:'paper.error',code:'PAPER_PROTOCOL_UPGRADE_REQUIRED'});else transport.message({type:'paper.snapshot',room:{...paperRoomFixture(),mapVersion:'old-map'}});
    expect(events.status).toHaveBeenLastCalledWith('outdated');expect(socket.send(intent)).toBe(false);await vi.advanceTimersByTimeAsync(30000);expect(paperArenaApi.ticket).toHaveBeenCalledTimes(1);
  });
  it('validates new authoritative elevation, weapon and independent ammo fields without throwing on null rows',()=>{
    for(const edit of [(room:ReturnType<typeof paperRoomFixture>)=>{room.players[0]!.y=Infinity;},(room:ReturnType<typeof paperRoomFixture>)=>{room.players[0]!.arsenal.sniper.ammo=99;},(room:ReturnType<typeof paperRoomFixture>)=>{room.players[0]!.ammo=29;},(room:ReturnType<typeof paperRoomFixture>)=>{room.players[0]!.weapon='forged' as 'rifle';}]){const room=paperRoomFixture();edit(room);expect(isPaperRoomSnapshot(room,'room-test')).toBe(false);}
    expect(isPaperRoomSnapshot({...paperRoomFixture(),players:[null]},'room-test')).toBe(false);expect(isPaperRoomSnapshot(paperRoomFixture(),'room-test')).toBe(true);
  });
  it('requires protocol and map on authenticated confirmation before unlocking input',async()=>{
    const {socket,events}=connection();await socket.connect();const transport=FakeSocket.instances[0]!;transport.open();transport.message({type:'paper.authenticated',protocolVersion:2,mapVersion:'wrong-map',playerId:'seat-1'});expect(events.status).toHaveBeenLastCalledWith('outdated');expect(socket.send(intent)).toBe(false);
  });
  it('does not let invalid snapshots keep an unhealthy connection alive indefinitely',async()=>{
    const {socket,events}=connection();await socket.connect();const transport=FakeSocket.instances[0]!;transport.open();transport.message({type:'paper.authenticated',protocolVersion:2,mapVersion:'office-expanded-v2',playerId:'seat-1'});
    for(let index=0;index<6;index++){transport.message({type:'paper.snapshot',room:{...paperRoomFixture(),players:[null]}});await vi.advanceTimersByTimeAsync(3000);}
    expect(events.snapshot).not.toHaveBeenCalled();expect(transport.readyState).toBe(FakeSocket.CLOSED);
  });
});
