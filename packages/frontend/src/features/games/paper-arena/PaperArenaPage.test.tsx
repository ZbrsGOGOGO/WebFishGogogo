import { act,cleanup,fireEvent,render,screen } from '@testing-library/react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { MemoryRouter,Route,Routes } from 'react-router-dom';
import type { PaperArenaRoomView } from '@stealth-reader/shared';
import { paperArenaApi } from './paper-arena-api';
import { PaperArenaPage,PaperArenaRoomPage } from './PaperArenaPage';
import { PaperArenaStage,arenaIntent } from './PaperArenaStage';
const spies=vi.hoisted(()=>({send:vi.fn(),stop:vi.fn(),dispose:vi.fn(),update:vi.fn()}));
vi.mock('./paper-arena-api',()=>({paperArenaApi:{rooms:vi.fn(),create:vi.fn(),join:vi.fn(),room:vi.fn(),start:vi.fn(),leave:vi.fn(),team:vi.fn()}}));
vi.mock('./PaperArenaConnection',()=>({PaperArenaConnection:class{constructor(_id:string,events:{status:(status:string)=>void}){events.status('online');}connect(){return Promise.resolve();}send=spies.send;stop=spies.stop;}}));
vi.mock('./PaperArenaRenderer',()=>({PaperArenaRenderer:class{update=spies.update;render(){}dispose=spies.dispose;}}));
function fixture():PaperArenaRoomView{return {id:'room-one',name:'同事演练',status:'running',maxPlayers:4,targetKills:30,requiresPassword:false,humans:1,expiresAt:99999999,hostPlayerId:'seat-1',myPlayerId:'seat-1',serverNow:1,game:{tick:1,elapsedMs:50,scores:{red:2,blue:1},winner:null,shots:[]},players:[{id:'seat-1',name:'自己',publicId:'p',team:'red',isBot:false,connected:true,x:0,z:6,yaw:0,pitch:0,hp:100,ammo:24,reloadingUntil:0,respawnAt:0,protectedUntil:0,kills:2,deaths:1,shotSeq:0}],rules:'server'};}
describe('paper arena lobby and discreet room UI',()=>{
  beforeEach(()=>{vi.clearAllMocks();vi.mocked(paperArenaApi.rooms).mockResolvedValue({rooms:[],currentRoomId:null,enabled:true});vi.mocked(paperArenaApi.room).mockResolvedValue(fixture());vi.stubGlobal('requestAnimationFrame',vi.fn(()=>123));vi.stubGlobal('cancelAnimationFrame',vi.fn());});
  afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
  it('offers every 4–8 capacity, 20–100 target and optional password without invitation codes',async()=>{
    render(<MemoryRouter><PaperArenaPage/></MemoryRouter>);expect(await screen.findByRole('heading',{name:'新建一份演练'})).toBeInTheDocument();
    for(const count of [4,5,6,7,8])expect(screen.getByRole('option',{name:`${count} 人`})).toBeInTheDocument();
    expect(screen.getByLabelText('房间名称')).toHaveAttribute('maxLength','32');
    expect(screen.getByLabelText('获胜击败数')).toHaveAttribute('min','20');expect(screen.getByLabelText('获胜击败数')).toHaveAttribute('max','100');expect(screen.getByLabelText('房间密码（可留空）')).toHaveAttribute('type','password');
    expect(screen.getByText(/暂不发放办公币/)).toBeInTheDocument();expect(screen.getByRole('link',{name:'返回单机'})).toHaveAttribute('href','/games/ballpoint-breach');
  });
  it('sends only room configuration on creation and navigates to returned room',async()=>{
    vi.mocked(paperArenaApi.create).mockResolvedValue(fixture());
    render(<MemoryRouter initialEntries={['/lobby']}><Routes><Route path="/lobby" element={<PaperArenaPage/>}/><Route path="/games/ballpoint-breach/arena/room-one" element={<p>已进入测试房间</p>}/></Routes></MemoryRouter>);
    await screen.findByRole('heading',{name:'新建一份演练'});fireEvent.change(screen.getByLabelText('获胜击败数'),{target:{value:'76'}});fireEvent.change(screen.getByLabelText('总人数（含 AI）'),{target:{value:'7'}});fireEvent.change(screen.getByLabelText('房间密码（可留空）'),{target:{value:'test-password'}});
    fireEvent.click(screen.getByRole('button',{name:'创建房间'}));expect(await screen.findByText('已进入测试房间')).toBeInTheDocument();expect(paperArenaApi.create).toHaveBeenCalledWith({requestId:expect.any(String),name:'纸上协作演练',maxPlayers:7,targetKills:76,password:'test-password'});
  });
  it('keeps match connected when minimizing/covering, clears input, and closes it only on leaving the page',async()=>{
    const rendered=render(<MemoryRouter initialEntries={['/arena/room-one']}><Routes><Route path="/arena/:roomId" element={<PaperArenaRoomPage/>}/></Routes></MemoryRouter>);
    await screen.findByText('同事演练',{exact:false});await act(async()=>{await Promise.resolve();});
    expect(screen.getByLabelText(/红蓝纸笔对战画面/)).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'最小化联机小窗'}));expect(screen.queryByLabelText(/红蓝纸笔对战画面/)).not.toBeInTheDocument();expect(spies.stop).not.toHaveBeenCalled();expect(spies.send).toHaveBeenCalledWith(expect.objectContaining({forward:0,strafe:0,fire:false,reload:false}));
    fireEvent.click(screen.getByRole('button',{name:'展开联机小窗'}));await act(async()=>{await Promise.resolve();});fireEvent.click(screen.getByRole('button',{name:'遮盖为工作备忘'}));expect(screen.getByRole('heading',{name:'工作备忘'})).toBeInTheDocument();expect(spies.stop).not.toHaveBeenCalled();rendered.unmount();expect(spies.stop).toHaveBeenCalledTimes(1);
  });
  it('maps screen-relative WASD to the authoritative +Z convention without positions or scores',()=>{
    expect(arenaIntent(new Set(['KeyW','KeyD']),{yaw:0,pitch:99})).toEqual({forward:1,strafe:-1,yaw:0,pitch:1.2,fire:false,reload:false});expect(arenaIntent(new Set(['KeyA']),{yaw:99,pitch:-99}).yaw).toBeGreaterThanOrEqual(-Math.PI);expect(arenaIntent(new Set(),{yaw:99,pitch:-99}).yaw).toBeLessThan(Math.PI);
  });
  it('emits control at 25Hz only after explicit canvas ownership and neutralizes on blur',async()=>{
    vi.useFakeTimers();const onInput=vi.fn();render(<PaperArenaStage room={fixture()} enabled onInput={onInput} onError={vi.fn()}/>);await act(async()=>{await Promise.resolve();});
    act(()=>vi.advanceTimersByTime(1000));expect(onInput).not.toHaveBeenCalled();const canvas=screen.getByLabelText(/红蓝纸笔对战画面/);fireEvent.pointerDown(canvas,{pointerId:1,pointerType:'touch',clientX:30,clientY:30});fireEvent.keyDown(canvas,{code:'KeyW',key:'w'});act(()=>vi.advanceTimersByTime(400));expect(onInput).toHaveBeenCalledTimes(10);expect(onInput).toHaveBeenLastCalledWith(expect.objectContaining({forward:1,fire:false}));
    fireEvent.blur(window);expect(onInput).toHaveBeenLastCalledWith(expect.objectContaining({forward:0,strafe:0,fire:false}));const count=onInput.mock.calls.length;act(()=>vi.advanceTimersByTime(400));expect(onInput).toHaveBeenCalledTimes(count);
  });
  it('neutralizes immediately on WebGL context loss and cannot blindly resume controls',async()=>{
    vi.useFakeTimers();const onInput=vi.fn();render(<PaperArenaStage room={fixture()} enabled onInput={onInput} onError={vi.fn()}/>);await act(async()=>{await Promise.resolve();});
    const canvas=screen.getByLabelText(/红蓝纸笔对战画面/);fireEvent.pointerDown(canvas,{pointerId:1,pointerType:'touch',clientX:30,clientY:30});fireEvent.keyDown(canvas,{code:'KeyW',key:'w'});act(()=>vi.advanceTimersByTime(40));expect(onInput).toHaveBeenLastCalledWith(expect.objectContaining({forward:1}));
    fireEvent(canvas,new Event('webglcontextlost',{cancelable:true}));expect(screen.getByRole('alert')).toHaveTextContent('图形环境已中断');expect(onInput).toHaveBeenLastCalledWith(expect.objectContaining({forward:0,fire:false}));const count=onInput.mock.calls.length;
    fireEvent.pointerDown(canvas,{pointerId:2,pointerType:'touch'});fireEvent.keyDown(canvas,{code:'KeyW',key:'w'});act(()=>vi.advanceTimersByTime(400));expect(onInput).toHaveBeenCalledTimes(count);
  });
});
