import { useEffect,useRef,useState,type JSX } from 'react';
import { PAPER_ARENA_WEAPON_IDS,PAPER_ARENA_WEAPONS,type PaperArenaInput,type PaperArenaRoomView,type PaperWeaponId } from '@stealth-reader/shared';
import { announceLocalGameForeground,listenForOtherLocalGame } from '../game-input';
import styles from './PaperArena.module.css';

export type PaperArenaIntent=Omit<PaperArenaInput,'seq'>;
export const PAPER_WEAPON_NAMES:Record<PaperWeaponId,string>={rifle:'步枪',shotgun:'霰弹枪',revolver:'左轮',sniper:'狙击枪',katana:'武士刀'};
export function arenaIntent(keys:Set<string>,look:{yaw:number;pitch:number},fire=false,reload=false,options:{weapon?:PaperWeaponId;aim?:boolean}={}):PaperArenaIntent{
  return {forward:Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown')),
    // Positive strafe is screen-left when yaw=0 (+Z), matching the server.
    strafe:Number(keys.has('KeyA')||keys.has('ArrowLeft'))-Number(keys.has('KeyD')||keys.has('ArrowRight')),
    yaw:((look.yaw+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI,pitch:Math.max(-1.2,Math.min(1.2,look.pitch)),
    fire,reload,aim:options.aim===true,jump:keys.has('Space'),sprint:keys.has('ShiftLeft')||keys.has('ShiftRight'),
    ...(options.weapon?{weapon:options.weapon}:{})};
}
export function PaperArenaStage({room,enabled,onInput,onError}:{room:PaperArenaRoomView;enabled:boolean;onInput:(input:PaperArenaIntent)=>void;onError:(message:string)=>void}):JSX.Element{
  const canvasRef=useRef<HTMLCanvasElement>(null),roomRef=useRef(room),enabledRef=useRef(enabled),sendRef=useRef(onInput),errorRef=useRef(onError);
  roomRef.current=room;enabledRef.current=enabled;sendRef.current=onInput;errorRef.current=onError;
  const keys=useRef(new Set<string>()),look=useRef({yaw:0,pitch:0}),activeRef=useRef(false),fireRef=useRef(false),reloadRef=useRef(false),aimRef=useRef(false),weaponRef=useRef<PaperWeaponId|undefined>(undefined);
  const pointer=useRef<{id:number;x:number;y:number}|null>(null),graphicsFailed=useRef(false);
  const [active,setActive]=useState(false),[graphicsError,setGraphicsError]=useState('');
  const rendererRef=useRef<import('./PaperArenaRenderer').PaperArenaRenderer|null>(null);
  const clearRef=useRef<()=>void>(()=>{}),emitRef=useRef<()=>void>(()=>{});
  const me=room.players.find(player=>player.id===room.myPlayerId),alive=Boolean(me&&me.hp>0);
  const lastLife=useRef<{id:string;alive:boolean;status:string}|null>(null);
  useEffect(()=>{
    const player=room.players.find(actor=>actor.id===room.myPlayerId),last=lastLife.current;
    if(player&&(!last||last.id!==player.id||last.alive!==(player.hp>0)||last.status!==room.status)){
      if(last)clearRef.current();look.current={yaw:player.yaw,pitch:player.pitch};
    }
    if(player){lastLife.current={id:player.id,alive:player.hp>0,status:room.status};if(weaponRef.current===player.weapon)weaponRef.current=undefined;}
    rendererRef.current?.update(room);
  },[room]);
  useEffect(()=>{if(!enabled&&activeRef.current)clearRef.current();},[enabled]);
  useEffect(()=>{
    const canvas=canvasRef.current;if(!canvas)return undefined;
    let disposed=false,frame=0,lastFrame=0;
    const fail=(message:string)=>{if(disposed)return;graphicsFailed.current=true;clearRef.current();setGraphicsError(message);};
    void import('./PaperArenaRenderer').then(({PaperArenaRenderer})=>{
      if(disposed)return;
      try{
        const renderer=new PaperArenaRenderer(canvas);rendererRef.current=renderer;renderer.update(roomRef.current);
        const draw=(now:number)=>{if(disposed)return;frame=requestAnimationFrame(draw);if(document.hidden||now-lastFrame<32)return;lastFrame=now;renderer.render(now,activeRef.current?look.current:null);};
        frame=requestAnimationFrame(draw);
      }catch{fail('当前浏览器无法启动 3D 画面，请开启硬件加速或换用支持 WebGL 的浏览器。');}
    }).catch(()=>fail('画面资源尚未加载，请刷新后重试。'));
    const contextLost=(event:Event)=>{event.preventDefault();fail('图形环境已中断，请刷新重连；服务器对局不会因此暂停。');};
    canvas.addEventListener('webglcontextlost',contextLost);
    return()=>{disposed=true;cancelAnimationFrame(frame);canvas.removeEventListener('webglcontextlost',contextLost);rendererRef.current?.dispose();rendererRef.current=null;};
  },[]);
  useEffect(()=>{
    const canvas=canvasRef.current;if(!canvas)return undefined;
    const playable=()=>{const snapshot=roomRef.current;return enabledRef.current&&!graphicsFailed.current&&!document.hidden&&snapshot.status==='running'&&Boolean(snapshot.players.find(player=>player.id===snapshot.myPlayerId&&player.hp>0));};
    const emit=()=>{if(activeRef.current&&playable())sendRef.current(arenaIntent(keys.current,look.current,fireRef.current,reloadRef.current,{aim:aimRef.current,weapon:weaponRef.current}));};
    const clear=()=>{
      keys.current.clear();fireRef.current=false;reloadRef.current=false;aimRef.current=false;weaponRef.current=undefined;pointer.current=null;activeRef.current=false;setActive(false);
      sendRef.current(arenaIntent(new Set(),look.current));
      if(document.pointerLockElement===canvas)document.exitPointerLock?.();
    };
    clearRef.current=clear;emitRef.current=emit;
    const interactive=(target:EventTarget|null)=>activeRef.current&&playable()&&(document.pointerLockElement===canvas||target===canvas);
    const down=(event:KeyboardEvent)=>{
      if(!interactive(event.target))return;
      if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','ShiftLeft','ShiftRight'].includes(event.code)){event.preventDefault();keys.current.add(event.code);if(event.code==='Space'&&!event.repeat)emit();}
      if(event.code==='KeyR'){event.preventDefault();reloadRef.current=true;if(!event.repeat)emit();}
      const slot=/^Digit([1-5])$/.exec(event.code);if(slot){event.preventDefault();if(!event.repeat){weaponRef.current=PAPER_ARENA_WEAPON_IDS[Number(slot[1])-1];emit();}}
      if(event.code==='Escape')clear();
    };
    const up=(event:KeyboardEvent)=>{const had=keys.current.delete(event.code);if(event.code==='KeyR'){reloadRef.current=false;if(activeRef.current)emit();}if(had&&event.code==='Space')emit();};
    const move=(event:MouseEvent)=>{if(!activeRef.current||!playable()||document.pointerLockElement!==canvas)return;look.current.yaw-=event.movementX*.0025;look.current.pitch=Math.max(-1.2,Math.min(1.2,look.current.pitch-event.movementY*.0025));};
    const mouseDown=(event:MouseEvent)=>{if(document.pointerLockElement!==canvas||!activeRef.current||!playable())return;if(event.button===0){fireRef.current=true;emit();}if(event.button===2){aimRef.current=true;emit();}};
    const mouseUp=(event:MouseEvent)=>{if(event.button===0&&fireRef.current){fireRef.current=false;emit();}if(event.button===2&&aimRef.current){aimRef.current=false;emit();}};
    let wheelAt=-Infinity;
    const wheel=(event:WheelEvent)=>{if(!interactive(event.target))return;event.preventDefault();if(!event.deltaY||performance.now()-wheelAt<120)return;wheelAt=performance.now();const player=roomRef.current.players.find(actor=>actor.id===roomRef.current.myPlayerId);const current=weaponRef.current??player?.weapon??'rifle';weaponRef.current=PAPER_ARENA_WEAPON_IDS[(PAPER_ARENA_WEAPON_IDS.indexOf(current)+(event.deltaY>0?1:4))%5];emit();};
    const visibility=()=>{if(document.hidden)clear();};
    const focus=(event:FocusEvent)=>{if(event.target!==canvas&&!(event.target instanceof HTMLElement&&event.target.closest('[data-paper-touch]')))clear();};
    const lock=()=>{if(document.pointerLockElement!==canvas)clear();};
    const lockError=()=>errorRef.current('鼠标锁定不可用：可以按住画面拖动瞄准，使用下方操作按钮；Esc 释放输入。');
    const other=listenForOtherLocalGame('paper-arena',clear);
    window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('mousemove',move);window.addEventListener('mousedown',mouseDown);window.addEventListener('mouseup',mouseUp);window.addEventListener('blur',clear);
    canvas.addEventListener('wheel',wheel,{passive:false});document.addEventListener('visibilitychange',visibility);document.addEventListener('focusin',focus);document.addEventListener('pointerlockchange',lock);document.addEventListener('pointerlockerror',lockError);
    const timer=window.setInterval(()=>{if(!playable()){if(activeRef.current)clear();return;}emit();},40);
    return()=>{clear();clearRef.current=()=>{};emitRef.current=()=>{};other();window.clearInterval(timer);window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('mousemove',move);window.removeEventListener('mousedown',mouseDown);window.removeEventListener('mouseup',mouseUp);window.removeEventListener('blur',clear);canvas.removeEventListener('wheel',wheel);document.removeEventListener('visibilitychange',visibility);document.removeEventListener('focusin',focus);document.removeEventListener('pointerlockchange',lock);document.removeEventListener('pointerlockerror',lockError);};
  },[]);
  const canPlay=enabled&&alive&&!graphicsError&&room.status==='running';
  const activate=()=>{if(!canPlay||graphicsFailed.current)return;announceLocalGameForeground('paper-arena');activeRef.current=true;setActive(true);canvasRef.current?.focus({preventScroll:true});};
  const phase=me&&me.switchingUntil>room.game.elapsedMs?'切换中':me&&me.reloadingUntil>room.game.elapsedMs?'装填中':me?.blocking?'格挡中':me?.aiming?'瞄准中':'';
  const scoped=Boolean(alive&&me?.weapon==='sniper'&&me.aiming&&me.reloadingUntil<=room.game.elapsedMs&&me.switchingUntil<=room.game.elapsedMs);
  const touchAction=(code:string,pressed:boolean)=>{if(pressed)activate();if(code==='fire')fireRef.current=pressed;else if(code==='aim')aimRef.current=pressed;else if(pressed)keys.current.add(code);else keys.current.delete(code);emitRef.current();};
  return <div className={styles.stage} data-exclusive-game-input="paper-arena">
    <canvas ref={canvasRef} tabIndex={0} aria-label="红蓝纸笔对战画面，点击接管，WASD 移动，鼠标瞄准，1 至 5 或滚轮切换武器，右键瞄准或格挡，空格跳跃，Shift 冲刺，R 装填，Esc 放开" onContextMenu={event=>event.preventDefault()}
      onPointerDown={event=>{if(!canPlay)return;activate();if(event.pointerType==='mouse'&&event.button===0&&document.pointerLockElement!==event.currentTarget){try{void event.currentTarget.requestPointerLock?.()?.catch(()=>{});}catch{/* Drag-aim fallback. */}}pointer.current={id:event.pointerId,x:event.clientX,y:event.clientY};event.currentTarget.setPointerCapture?.(event.pointerId);}}
      onPointerMove={event=>{if(!activeRef.current||document.pointerLockElement===event.currentTarget||pointer.current?.id!==event.pointerId)return;const previous=pointer.current;look.current.yaw-=(event.clientX-previous.x)*.006;look.current.pitch=Math.max(-1.2,Math.min(1.2,look.current.pitch-(event.clientY-previous.y)*.006));pointer.current={id:event.pointerId,x:event.clientX,y:event.clientY};}}
      onPointerUp={()=>{pointer.current=null;}} onPointerCancel={()=>clearRef.current()}/>
    {scoped?<div className={styles.scope} aria-hidden="true" data-paper-scope="true"><div/></div>:<div className={styles.crosshair} aria-hidden="true">+</div>}
    <div className={styles.weaponBar} data-paper-touch="true" aria-label="武器选择">{PAPER_ARENA_WEAPON_IDS.map((id,index)=><button key={id} type="button" aria-label={`${index+1} ${PAPER_WEAPON_NAMES[id]}`} aria-pressed={me?.weapon===id} disabled={!canPlay} onPointerDown={event=>event.preventDefault()} onClick={()=>{activate();weaponRef.current=id;emitRef.current();}}><small>{index+1}</small> {PAPER_WEAPON_NAMES[id]}</button>)}</div>
    {graphicsError?<p className={styles.stageOverlay} role="alert">{graphicsError}</p>:room.status==='waiting'?<div className={styles.stageOverlay}><h2>双方待命</h2><p>房主开始后，空位由 AI 补齐。</p></div>:!alive&&room.status==='running'?<div className={styles.stageOverlay}><h2>整理中 · {Math.max(1,Math.ceil(((me?.respawnAt??0)-room.game.elapsedMs)/1000))} 秒</h2><p>随机安全点复活，回场后点击画面接管。</p></div>:room.status==='finished'?<div className={styles.stageOverlay}><h2>{room.game.winner==='draw'?'本轮平局':room.game.winner==='red'?'红组获胜':'蓝组获胜'}</h2><p>{room.game.scores.red} : {room.game.scores.blue} · 本场不发放办公币</p></div>:!active?<div className={styles.clickHint}>点击画面接管 · Esc 回到工作<br/>1–5 / 滚轮切换 · 右键瞄准 · 空格跳跃</div>:null}
    <div className={styles.hud}><span data-team={me?.team}>{me?.team==='red'?'红组':'蓝组'} · 耐久 {me?.hp??0}</span><strong role="status" aria-label="当前武器状态">{me?`${PAPER_WEAPON_NAMES[me.weapon]} · ${me.weapon==='katana'?'近战':`${me.ammo}/${PAPER_ARENA_WEAPONS[me.weapon].magazineSize} · 备用 ${me.reserve}`} ${phase}`:'待命'}</strong><small>{me&&me.protectedUntil>room.game.elapsedMs?'出生保护 · 开火后结束':''}</small></div>
    <div className={styles.touchControls} data-paper-touch="true" aria-label="触控对战操作">{[['KeyW','前进'],['KeyA','左移'],['KeyS','后退'],['KeyD','右移'],['Space','跳跃'],['ShiftLeft','冲刺'],['aim',me?.weapon==='katana'?'格挡':'瞄准'],['fire','开火']].map(([code,label])=><button key={code} type="button" disabled={!canPlay} onPointerDown={event=>{event.preventDefault();touchAction(code!,true);event.currentTarget.setPointerCapture?.(event.pointerId);}} onPointerUp={()=>touchAction(code!,false)} onPointerCancel={()=>touchAction(code!,false)}>{label}</button>)}<button type="button" disabled={!canPlay||me?.weapon==='katana'} onPointerDown={event=>event.preventDefault()} onClick={()=>{activate();sendRef.current({...arenaIntent(keys.current,look.current,fireRef.current,false,{aim:aimRef.current,weapon:weaponRef.current}),reload:true});}}>装填</button></div>
  </div>;
}
