import { act,cleanup,fireEvent,render,screen } from '@testing-library/react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { MemoryRouter,Route,Routes } from 'react-router-dom';
import type { PaperArenaRoomView } from '@stealth-reader/shared';
import { paperArenaApi } from './paper-arena-api';
import { PaperArenaPage,PaperArenaRoomPage } from './PaperArenaPage';
import { PaperArenaStage,arenaIntent } from './PaperArenaStage';
import { paperRoomFixture } from './PaperArena.testfixtures';
const spies=vi.hoisted(()=>({send:vi.fn(),stop:vi.fn(),dispose:vi.fn(),update:vi.fn()}));
vi.mock('./paper-arena-api',()=>({paperArenaApi:{rooms:vi.fn(),create:vi.fn(),join:vi.fn(),room:vi.fn(),start:vi.fn(),leave:vi.fn(),team:vi.fn()}}));
vi.mock('./PaperArenaConnection',async()=>({...await vi.importActual<typeof import('./PaperArenaConnection')>('./PaperArenaConnection'),PaperArenaConnection:class{constructor(_id:string,events:{status:(status:string)=>void}){events.status('online');}connect(){return Promise.resolve();}send=spies.send;stop=spies.stop;}}));
vi.mock('./PaperArenaRenderer',()=>({PaperArenaRenderer:class{update=spies.update;render(){}dispose=spies.dispose;}}));
function fixture():PaperArenaRoomView{return paperRoomFixture({id:'room-one',name:'同事演练'});}
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
    expect(arenaIntent(new Set(['KeyW','KeyD']),{yaw:0,pitch:99})).toEqual({forward:1,strafe:-1,yaw:0,pitch:1.2,fire:false,reload:false,aim:false,jump:false,sprint:false});expect(arenaIntent(new Set(['KeyA']),{yaw:99,pitch:-99}).yaw).toBeGreaterThanOrEqual(-Math.PI);expect(arenaIntent(new Set(),{yaw:99,pitch:-99}).yaw).toBeLessThan(Math.PI);
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
  it('requests every original weapon by slot without pretending the server has switched or refilled',async()=>{
    const onInput=vi.fn(),room=fixture();const rendered=render(<PaperArenaStage room={room} enabled onInput={onInput} onError={vi.fn()}/>);await act(async()=>{await Promise.resolve();});
    const canvas=screen.getByLabelText(/红蓝纸笔对战画面/);fireEvent.pointerDown(canvas,{pointerId:1,pointerType:'touch'});
    for(const [index,weapon]of ['rifle','shotgun','revolver','sniper','katana'].entries()){fireEvent.keyDown(canvas,{code:`Digit${index+1}`});expect(onInput).toHaveBeenLastCalledWith(expect.objectContaining({weapon}));}
    expect(screen.getByLabelText('当前武器状态')).toHaveTextContent('步枪 · 30/30 · 备用 150');expect(room.players[0]!.weapon).toBe('rifle');
    const next=fixture();next.players[0]!.weapon='sniper';next.players[0]!.ammo=5;next.players[0]!.reserve=25;rendered.rerender(<PaperArenaStage room={next} enabled onInput={onInput} onError={vi.fn()}/>);
    expect(screen.getByLabelText('当前武器状态')).toHaveTextContent('狙击枪 · 5/5 · 备用 25');expect(screen.getByRole('button',{name:'4 狙击枪'})).toHaveAttribute('aria-pressed','true');
  });
  it('preserves both edges of a short semi-auto trigger click and separates aim from fire release',async()=>{
    const onInput=vi.fn();render(<PaperArenaStage room={fixture()} enabled onInput={onInput} onError={vi.fn()}/>);await act(async()=>{await Promise.resolve();});const canvas=screen.getByLabelText(/红蓝纸笔对战画面/);fireEvent.pointerDown(canvas,{pointerId:1,pointerType:'touch'});
    Object.defineProperty(document,'pointerLockElement',{configurable:true,value:canvas});
    try{fireEvent.mouseDown(canvas,{button:2});fireEvent.mouseDown(canvas,{button:0});fireEvent.mouseUp(canvas,{button:2});expect(onInput).toHaveBeenLastCalledWith(expect.objectContaining({fire:true,aim:false}));fireEvent.mouseUp(canvas,{button:0});expect(onInput).toHaveBeenLastCalledWith(expect.objectContaining({fire:false,aim:false}));expect(onInput.mock.calls.some(([input])=>input.fire&&input.aim)).toBe(true);}finally{Object.defineProperty(document,'pointerLockElement',{configurable:true,value:null});}
  });
  it('clears weapon, aim, jump and sprint on blur or disabled state and never catches chat typing',async()=>{
    vi.useFakeTimers();const onInput=vi.fn(),room=fixture();const rendered=render(<><input aria-label="聊天输入"/><PaperArenaStage room={room} enabled onInput={onInput} onError={vi.fn()}/></>);await act(async()=>{await Promise.resolve();});
    const canvas=screen.getByLabelText(/红蓝纸笔对战画面/);fireEvent.pointerDown(canvas,{pointerId:1,pointerType:'touch'});fireEvent.keyDown(canvas,{code:'Digit4'});fireEvent.keyDown(canvas,{code:'ShiftLeft'});fireEvent.keyDown(canvas,{code:'Space'});expect(onInput).toHaveBeenLastCalledWith(expect.objectContaining({weapon:'sniper',jump:true,sprint:true}));
    fireEvent.focusIn(screen.getByLabelText('聊天输入'));expect(onInput).toHaveBeenLastCalledWith(expect.objectContaining({fire:false,aim:false,jump:false,sprint:false}));expect(onInput.mock.lastCall![0]).not.toHaveProperty('weapon');const count=onInput.mock.calls.length;
    fireEvent.keyDown(screen.getByLabelText('聊天输入'),{code:'Digit2'});fireEvent.keyDown(screen.getByLabelText('聊天输入'),{code:'Space'});act(()=>vi.advanceTimersByTime(400));expect(onInput).toHaveBeenCalledTimes(count);
    fireEvent.pointerDown(canvas,{pointerId:2,pointerType:'touch'});fireEvent.keyDown(canvas,{code:'KeyW'});rendered.rerender(<><input aria-label="聊天输入"/><PaperArenaStage room={room} enabled={false} onInput={onInput} onError={vi.fn()}/></>);expect(onInput).toHaveBeenLastCalledWith(expect.objectContaining({forward:0,fire:false,aim:false,jump:false,sprint:false}));
  });
  it('cycles weapons only while this canvas owns input and supports touch selection and melee controls',async()=>{
    const onInput=vi.fn(),room=fixture();const rendered=render(<PaperArenaStage room={room} enabled onInput={onInput} onError={vi.fn()}/>);await act(async()=>{await Promise.resolve();});const canvas=screen.getByLabelText(/红蓝纸笔对战画面/);
    fireEvent.wheel(canvas,{deltaY:1});expect(onInput).not.toHaveBeenCalled();fireEvent.pointerDown(canvas,{pointerId:1,pointerType:'touch'});fireEvent.wheel(canvas,{deltaY:1});expect(onInput).toHaveBeenLastCalledWith(expect.objectContaining({weapon:'shotgun'}));
    fireEvent.click(screen.getByRole('button',{name:'5 武士刀'}));expect(onInput).toHaveBeenLastCalledWith(expect.objectContaining({weapon:'katana'}));
    const next=fixture();Object.assign(next.players[0]!,{weapon:'katana',ammo:0,reserve:0});rendered.rerender(<PaperArenaStage room={next} enabled onInput={onInput} onError={vi.fn()}/>);expect(screen.getByRole('button',{name:'装填'})).toBeDisabled();expect(screen.getByLabelText('当前武器状态')).toHaveTextContent('武士刀 · 近战');
    fireEvent.pointerDown(screen.getByRole('button',{name:'格挡'}),{pointerId:2});expect(onInput).toHaveBeenLastCalledWith(expect.objectContaining({aim:true}));fireEvent.pointerCancel(screen.getByRole('button',{name:'格挡'}),{pointerId:2});expect(onInput).toHaveBeenLastCalledWith(expect.objectContaining({aim:false}));
  });
  it('rejects an old HTTP room before mounting a mismatched scene',async()=>{
    vi.mocked(paperArenaApi.room).mockResolvedValue({...fixture(),protocolVersion:1} as unknown as PaperArenaRoomView);
    render(<MemoryRouter initialEntries={['/arena/room-one']}><Routes><Route path="/arena/:roomId" element={<PaperArenaRoomPage/>}/></Routes></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent('版本已更新');expect(screen.queryByLabelText(/红蓝纸笔对战画面/)).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'刷新到新版本'})).toBeInTheDocument();
  });
  it('shows the original discreet scope only when authoritative sniper aiming is active',async()=>{
    const room=fixture();Object.assign(room.players[0]!,{weapon:'sniper',ammo:5,reserve:25,aiming:true});
    const rendered=render(<PaperArenaStage room={room} enabled onInput={vi.fn()} onError={vi.fn()}/>);await act(async()=>{await Promise.resolve();});expect(rendered.container.querySelector('[data-paper-scope]')).toBeInTheDocument();
    const reloading=structuredClone(room);reloading.players[0]!.reloadingUntil=1000;rendered.rerender(<PaperArenaStage room={reloading} enabled onInput={vi.fn()} onError={vi.fn()}/>);expect(rendered.container.querySelector('[data-paper-scope]')).toBeNull();
  });
});
