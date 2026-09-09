import {useEffect,useRef,useState,type KeyboardEvent,type PointerEvent} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {useCommunityAuthStore} from '../../../app/store/community-auth-store';
import {announceLocalGameForeground,listenForOtherLocalGame} from '../game-input';
import type {UnderrunRuntime} from './runtime';
import styles from './UnderrunPage.module.css';
export function UnderrunPage(){const account=useCommunityAuthStore(s=>`${s.phase}:${s.user?.publicId??'guest'}`);const location=useLocation();return <WorkDraft key={`${account}:${location.pathname}`} />;}
function WorkDraft(){
  const canvas=useRef<HTMLCanvasElement>(null),runtime=useRef<UnderrunRuntime|null>(null),wanted=useRef(false);
  const [attempt,setAttempt]=useState(0),[opened,setOpened]=useState(false),[phase,setPhase]=useState<'idle'|'loading'|'ready'|'failed'>('idle'),[active,setActive]=useState(false),[complete,setComplete]=useState(false),[notice,setNotice]=useState('三个机房等待巡检。接近终端进行修复，鼠标处理故障干扰。');
  const owner=useRef(`underrun-${crypto.randomUUID()}`).current;
  const pause=()=>{wanted.current=false;runtime.current?.pause();setActive(false);};
  useEffect(()=>{const hidden=()=>{if(document.hidden)pause();};const escape=(e:globalThis.KeyboardEvent)=>{if(e.key==='Escape')pause();};const off=listenForOtherLocalGame(owner,pause);window.addEventListener('blur',pause);window.addEventListener('keydown',escape);document.addEventListener('visibilitychange',hidden);return()=>{off();window.removeEventListener('blur',pause);window.removeEventListener('keydown',escape);document.removeEventListener('visibilitychange',hidden);};},[owner]);
  useEffect(()=>{
    if(!opened||!canvas.current)return;const node=canvas.current;let cancelled=false,instance:UnderrunRuntime|null=null;
    setPhase('loading');
    const unavailable=()=>{if(cancelled)return;wanted.current=false;instance?.dispose();runtime.current=null;setActive(false);setPhase('failed');};
    const lost=(e:Event)=>{e.preventDefault();unavailable();};node.addEventListener('webglcontextlost',lost);
    void import('./runtime').then(async({createUnderrunRuntime})=>{
      if(cancelled)return;
      try{instance=createUnderrunRuntime(node,text=>{if(!cancelled)setNotice(text);},state=>{if(cancelled)return;if(state==='error'){unavailable();return;}wanted.current=false;setComplete(true);setActive(false);});runtime.current=instance;await instance.ready;if(cancelled)return;setPhase('ready');if(wanted.current&&!document.hidden){announceLocalGameForeground(owner);instance.resume();setActive(true);node.focus();}}
      catch{unavailable();}
    }).catch(unavailable);
    return()=>{cancelled=true;node.removeEventListener('webglcontextlost',lost);instance?.dispose();if(runtime.current===instance)runtime.current=null;};
  },[opened,attempt,owner]);
  const start=()=>{wanted.current=true;announceLocalGameForeground(owner);if(!opened){setOpened(true);return;}if(phase==='failed'){setAttempt(n=>n+1);return;}if(runtime.current&&phase==='ready'){runtime.current.resume();setActive(true);canvas.current?.focus();}};
  const key=(event:KeyboardEvent<HTMLCanvasElement>,pressed:boolean)=>{if(!active||event.nativeEvent.isComposing||event.altKey||event.metaKey||event.ctrlKey)return;const codes:Record<string,number>={ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40,a:65,w:87,d:68,s:83};if(codes[event.key]){event.preventDefault();event.stopPropagation();runtime.current?.key(codes[event.key],pressed);}};
  const pointer=(event:PointerEvent<HTMLCanvasElement>,pressed?:boolean)=>{if(!active)return;const r=event.currentTarget.getBoundingClientRect();runtime.current?.pointer((event.clientX-r.left)/Math.max(1,r.width)*event.currentTarget.width,(event.clientY-r.top)/Math.max(1,r.height)*event.currentTarget.height,pressed);};
  return <main className={styles.page}><header><p>本地练习 / 机房巡检</p><h1>巡检工作稿</h1><Link to="/games">返回小游戏</Link></header><p>Underrun 本站静音改编。独立练习，不计官方排行榜、办公币或任何奖励。</p>
    <section className={styles.draft} aria-label="机房巡检工作稿"><div className={styles.toolbar}><span>巡检区域 / 三个机房</span><span>本地 · 零音频</span></div><div className={styles.surface}>
      <canvas key={attempt} ref={canvas} width={480} height={320} tabIndex={0} data-exclusive-game-input="underrun" aria-label="机房巡检画布，WASD移动，鼠标处理干扰，Esc收起" onKeyDown={e=>key(e,true)} onKeyUp={e=>key(e,false)} onPointerMove={e=>pointer(e)} onPointerDown={e=>{if(!active||e.button!==0)return;e.currentTarget.focus();e.currentTarget.setPointerCapture?.(e.pointerId);pointer(e,true);e.preventDefault();}} onPointerUp={e=>pointer(e,false)} onPointerCancel={()=>pause()} onBlur={pause}/>
      {!active&&<div className={styles.cover}><strong>{complete?'本次巡检全部完成':phase==='loading'?'正在整理本地资源…':phase==='failed'?'当前图形环境无法打开工作稿':'巡检记录已收起'}</strong><p>{complete?'三个机房已恢复，可新建巡检再次练习。':phase==='failed'?'需要支持 WebGL 的浏览器，可重试；网站其他功能不受影响。':'继续后使用方向键或 WASD 移动，鼠标瞄准并点击。失焦立即暂停。'}</p></div>}
    </div><p className={styles.notice} role="status">{active||complete?notice:'暂停时不模拟、不计时、不播放声音。离开页面或退出账号清空本轮。'}</p><div className={styles.actions}><button onClick={start} disabled={active||complete||phase==='loading'}>{phase==='failed'?'重新尝试':'继续巡检'}</button><button onClick={pause} disabled={!active}>收起 / Esc</button><button disabled={!opened||phase==='loading'} onClick={()=>{pause();setOpened(false);setPhase('idle');setComplete(false);setAttempt(n=>n+1);setNotice('新的三个机房等待巡检。');}}>新建巡检</button></div></section>
    <footer>适合键盘与鼠标。改编自 Dominic Szablewski / Underrun；原始音频未加载。<br/><a href="/licenses/underrun-MIT.txt" target="_blank" rel="noreferrer">MIT 许可</a> · <a href="/licenses/underrun-Sonant-X-zlib.txt" target="_blank" rel="noreferrer">上游 Sonant-X 许可说明</a></footer></main>;
}
