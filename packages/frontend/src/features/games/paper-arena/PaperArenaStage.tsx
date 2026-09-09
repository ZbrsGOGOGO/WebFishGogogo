import { useEffect,useRef,useState,type JSX } from 'react';
import type { PaperArenaInput,PaperArenaRoomView } from '@stealth-reader/shared';
import { announceLocalGameForeground,listenForOtherLocalGame } from '../game-input';
import styles from './PaperArena.module.css';

export interface PaperArenaIntent { forward:number;strafe:number;yaw:number;pitch:number;fire:boolean;reload:boolean }
export function arenaIntent(keys:Set<string>,aim:{yaw:number;pitch:number},fire=false,reload=false):PaperArenaIntent{
  return {forward:Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown')),
    // The shared arena convention uses positive strafe towards screen-left when yaw=0 (+Z).
    strafe:Number(keys.has('KeyA')||keys.has('ArrowLeft'))-Number(keys.has('KeyD')||keys.has('ArrowRight')),
    yaw:((aim.yaw+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI,pitch:Math.max(-1.2,Math.min(1.2,aim.pitch)),fire,reload};
}
export function PaperArenaStage({room,enabled,onInput,onError}:{room:PaperArenaRoomView;enabled:boolean;onInput:(input:Omit<PaperArenaInput,'seq'>)=>void;onError:(message:string)=>void}):JSX.Element{
  const canvasRef=useRef<HTMLCanvasElement>(null),roomRef=useRef(room),enabledRef=useRef(enabled),sendRef=useRef(onInput),errorRef=useRef(onError);
  roomRef.current=room;enabledRef.current=enabled;sendRef.current=onInput;errorRef.current=onError;
  const keys=useRef(new Set<string>()),aim=useRef({yaw:0,pitch:0}),activeRef=useRef(false),fireRef=useRef(false),reloadRef=useRef(false);
  const [active,setActive]=useState(false),[graphicsError,setGraphicsError]=useState('');
  const rendererRef=useRef<import('./PaperArenaRenderer').PaperArenaRenderer|null>(null);
  const lastLife=useRef<{id:string;alive:boolean;status:string}|null>(null);
  useEffect(()=>{
    const me=room.players.find(player=>player.id===room.myPlayerId);
    if(me&&(!lastLife.current||lastLife.current.id!==me.id||(!lastLife.current.alive&&me.hp>0)||lastLife.current.status!==room.status))aim.current={yaw:me.yaw,pitch:me.pitch};
    if(me)lastLife.current={id:me.id,alive:me.hp>0,status:room.status};
    rendererRef.current?.update(room);
  },[room]);
  useEffect(()=>{
    const canvas=canvasRef.current;if(!canvas)return undefined;
    let disposed=false,frame=0,lastFrame=0;
    void import('./PaperArenaRenderer').then(({PaperArenaRenderer})=>{
      if(disposed)return;
      try{
        const renderer=new PaperArenaRenderer(canvas);rendererRef.current=renderer;renderer.update(roomRef.current);
        const draw=(now:number)=>{if(disposed)return;frame=requestAnimationFrame(draw);if(document.hidden||now-lastFrame<32)return;lastFrame=now;renderer.render(now,activeRef.current?aim.current:null);};
        frame=requestAnimationFrame(draw);
      }catch{setGraphicsError('当前浏览器无法启动 3D 画面，请开启硬件加速或换用支持 WebGL 的浏览器。');}
    }).catch(()=>{if(!disposed)setGraphicsError('画面资源尚未加载，请刷新后重试。');});
    const contextLost=(event:Event)=>{event.preventDefault();keys.current.clear();fireRef.current=false;reloadRef.current=false;activeRef.current=false;setActive(false);sendRef.current(arenaIntent(new Set(),aim.current));if(document.pointerLockElement===canvas)document.exitPointerLock?.();setGraphicsError('图形环境已中断，请刷新重连；服务器对局不会因此暂停。');};
    canvas.addEventListener('webglcontextlost',contextLost);
    return()=>{disposed=true;cancelAnimationFrame(frame);canvas.removeEventListener('webglcontextlost',contextLost);rendererRef.current?.dispose();rendererRef.current=null;};
  },[]);
  useEffect(()=>{
    const canvas=canvasRef.current;if(!canvas)return undefined;
    const clear=()=>{keys.current.clear();fireRef.current=false;reloadRef.current=false;activeRef.current=false;setActive(false);sendRef.current(arenaIntent(new Set(),aim.current));if(document.pointerLockElement===canvas)document.exitPointerLock?.();};
    const interactive=(event:KeyboardEvent)=>activeRef.current&&enabledRef.current&&!document.hidden&&(document.pointerLockElement===canvas||event.target===canvas);
    const down=(event:KeyboardEvent)=>{if(!interactive(event))return;if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code)){event.preventDefault();keys.current.add(event.code);}if(event.code==='KeyR'){event.preventDefault();reloadRef.current=true;}if(event.code==='Escape'){clear();}};
    const up=(event:KeyboardEvent)=>{keys.current.delete(event.code);if(event.code==='KeyR')reloadRef.current=false;};
    const move=(event:MouseEvent)=>{if(!activeRef.current||!enabledRef.current||document.pointerLockElement!==canvas)return;aim.current.yaw-=event.movementX*.0025;aim.current.pitch=Math.max(-1.2,Math.min(1.2,aim.current.pitch-event.movementY*.0025));};
    const mouseDown=(event:MouseEvent)=>{if(document.pointerLockElement===canvas&&event.button===0&&enabledRef.current)fireRef.current=true;};
    const mouseUp=()=>{fireRef.current=false;};
    const visibility=()=>{if(document.hidden)clear();};
    const focus=(event:FocusEvent)=>{if(event.target!==canvas&&!(event.target instanceof HTMLElement&&event.target.closest('[data-paper-touch]')))clear();};
    const lock=()=>{if(document.pointerLockElement!==canvas)clear();};
    const lockError=()=>errorRef.current('鼠标锁定不可用：可以按住画面拖动瞄准，使用开火按钮；Esc 释放输入。');
    const other=listenForOtherLocalGame('paper-arena',clear);
    window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('mousemove',move);window.addEventListener('mousedown',mouseDown);window.addEventListener('mouseup',mouseUp);window.addEventListener('blur',clear);
    document.addEventListener('visibilitychange',visibility);document.addEventListener('focusin',focus);document.addEventListener('pointerlockchange',lock);document.addEventListener('pointerlockerror',lockError);
    const timer=window.setInterval(()=>{
      const snapshot=roomRef.current,me=snapshot.players.find(player=>player.id===snapshot.myPlayerId);
      if(!enabledRef.current||snapshot.status!=='running'||!me||me.hp<=0||document.hidden){if(activeRef.current)clear();return;}
      if(activeRef.current)sendRef.current(arenaIntent(keys.current,aim.current,fireRef.current,reloadRef.current));
    },40);
    return()=>{clear();other();window.clearInterval(timer);window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('mousemove',move);window.removeEventListener('mousedown',mouseDown);window.removeEventListener('mouseup',mouseUp);window.removeEventListener('blur',clear);document.removeEventListener('visibilitychange',visibility);document.removeEventListener('focusin',focus);document.removeEventListener('pointerlockchange',lock);document.removeEventListener('pointerlockerror',lockError);};
  },[]);
  const activate=()=>{if(!enabled||graphicsError||room.status!=='running')return;announceLocalGameForeground('paper-arena');activeRef.current=true;setActive(true);canvasRef.current?.focus({preventScroll:true});};
  const pointer=useRef<{id:number;x:number;y:number}|null>(null);
  const me=room.players.find(player=>player.id===room.myPlayerId),alive=Boolean(me&&me.hp>0);
  return <div className={styles.stage} data-exclusive-game-input="paper-arena">
    <canvas ref={canvasRef} tabIndex={0} aria-label="红蓝纸笔对战画面，点击接管，WASD 移动，鼠标瞄准，R 装填，Esc 放开" onContextMenu={event=>event.preventDefault()}
      onPointerDown={event=>{if(!alive||!enabled||graphicsError||room.status!=='running')return;activate();if(event.pointerType==='mouse'&&document.pointerLockElement!==event.currentTarget){try{void event.currentTarget.requestPointerLock?.()?.catch(()=>{});}catch{/* Drag-aim fallback remains available. */}}pointer.current={id:event.pointerId,x:event.clientX,y:event.clientY};event.currentTarget.setPointerCapture?.(event.pointerId);}}
      onPointerMove={event=>{if(!activeRef.current||document.pointerLockElement===event.currentTarget||pointer.current?.id!==event.pointerId)return;const previous=pointer.current;aim.current.yaw-=(event.clientX-previous.x)*.006;aim.current.pitch=Math.max(-1.2,Math.min(1.2,aim.current.pitch-(event.clientY-previous.y)*.006));pointer.current={id:event.pointerId,x:event.clientX,y:event.clientY};}}
      onPointerUp={()=>{pointer.current=null;fireRef.current=false;}} onPointerCancel={()=>{pointer.current=null;fireRef.current=false;}}/>
    <div className={styles.crosshair} aria-hidden="true">+</div>
    {graphicsError?<p className={styles.stageOverlay} role="alert">{graphicsError}</p>:room.status==='waiting'?<div className={styles.stageOverlay}><h2>双方待命</h2><p>房主开始后，空位由 AI 补齐。</p></div>:!alive&&room.status==='running'?<div className={styles.stageOverlay}><h2>整理中 · {Math.max(1,Math.ceil(((me?.respawnAt??0)-room.game.elapsedMs)/1000))} 秒</h2><p>随机安全点复活，回场后点击画面接管。</p></div>:room.status==='finished'?<div className={styles.stageOverlay}><h2>{room.game.winner==='draw'?'本轮平局':room.game.winner==='red'?'红组获胜':'蓝组获胜'}</h2><p>{room.game.scores.red} : {room.game.scores.blue} · 本场不发放办公币</p></div>:!active?<div className={styles.clickHint}>点击画面接管 · Esc 回到工作<br/>未接管时对局仍在继续</div>:null}
    <div className={styles.hud}><span data-team={me?.team}>{me?.team==='red'?'红组':'蓝组'} · 耐久 {me?.hp??0}</span><strong>{me?.ammo??0}/24 {me&&me.reloadingUntil>room.game.elapsedMs?'装填中':'练习步枪'}</strong><small>{me&&me.protectedUntil>room.game.elapsedMs?'出生保护 · 开火后结束':''}</small></div>
    <div className={styles.touchControls} data-paper-touch="true" aria-label="触控对战操作">{[['KeyW','前进'],['KeyA','左移'],['KeyS','后退'],['KeyD','右移']].map(([code,label])=><button key={code} type="button" disabled={!enabled||!alive||room.status!=='running'} onPointerDown={event=>{event.preventDefault();activate();keys.current.add(code!);event.currentTarget.setPointerCapture?.(event.pointerId);}} onPointerUp={()=>keys.current.delete(code!)} onPointerCancel={()=>keys.current.delete(code!)}>{label}</button>)}<button type="button" disabled={!enabled||!alive||room.status!=='running'} onPointerDown={event=>{event.preventDefault();activate();fireRef.current=true;event.currentTarget.setPointerCapture?.(event.pointerId);}} onPointerUp={()=>{fireRef.current=false;}} onPointerCancel={()=>{fireRef.current=false;}}>开火</button><button type="button" disabled={!enabled||!alive||room.status!=='running'} onClick={()=>{activate();sendRef.current({...arenaIntent(keys.current,aim.current),reload:true});}}>装填</button></div>
  </div>;
}
