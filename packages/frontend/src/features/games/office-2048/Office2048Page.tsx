import {useEffect,useRef,useState,type KeyboardEvent,type PointerEvent} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {useCommunityAuthStore} from '../../../app/store/community-auth-store';
import {announceLocalGameForeground,listenForOtherLocalGame} from '../game-input';
import {moveSheet,newSheet,type Direction} from './logic';
import styles from './Office2048Page.module.css';

export function Office2048Page(){const account=useCommunityAuthStore(s=>`${s.phase}:${s.user?.publicId??'guest'}`);const location=useLocation();return <Sheet key={`${account}:${location.pathname}`} />;}
function Sheet(){
  const [state,setState]=useState(()=>newSheet()),[active,setActive]=useState(false);const board=useRef<HTMLDivElement>(null),touch=useRef<{id:number;x:number;y:number}|null>(null);
  const owner=useRef(`sheet-${crypto.randomUUID()}`).current;
  useEffect(()=>{const pause=()=>{setActive(false);touch.current=null;};const hidden=()=>{if(document.hidden)pause();};const escape=(e:globalThis.KeyboardEvent)=>{if(e.key==='Escape')pause();};const off=listenForOtherLocalGame(owner,pause);window.addEventListener('blur',pause);window.addEventListener('keydown',escape);document.addEventListener('visibilitychange',hidden);return()=>{off();window.removeEventListener('blur',pause);window.removeEventListener('keydown',escape);document.removeEventListener('visibilitychange',hidden);};},[owner]);
  const start=()=>{announceLocalGameForeground(owner);setActive(true);board.current?.focus();};
  const move=(d:Direction)=>{if(active)setState(s=>moveSheet(s,d));};
  const key=(e:KeyboardEvent<HTMLDivElement>)=>{if(e.target!==e.currentTarget||e.isDefaultPrevented()||e.nativeEvent.isComposing||e.ctrlKey||e.altKey||e.metaKey)return;const map:Record<string,Direction>={ArrowUp:'up',ArrowRight:'right',ArrowDown:'down',ArrowLeft:'left',w:'up',d:'right',s:'down',a:'left'};if(map[e.key]&&active){e.preventDefault();e.stopPropagation();move(map[e.key]);}};
  const down=(e:PointerEvent<HTMLDivElement>)=>{if(!active||!e.isPrimary)return;touch.current={id:e.pointerId,x:e.clientX,y:e.clientY};try{e.currentTarget.setPointerCapture?.(e.pointerId);}catch{/* cancelled pointer or assistive/synthetic input */}e.currentTarget.focus();};
  const up=(e:PointerEvent<HTMLDivElement>)=>{const p=touch.current;touch.current=null;if(!p||p.id!==e.pointerId||!active)return;const x=e.clientX-p.x,y=e.clientY-p.y;if(Math.max(Math.abs(x),Math.abs(y))<20)return;move(Math.abs(x)>Math.abs(y)?x>0?'right':'left':y>0?'down':'up');};
  return <main className={styles.page}><header><p>本地练习 / 数值整理</p><h1>表格工作稿</h1><Link to="/games">返回小游戏</Link></header><p>相同数值合并，整理到 2048 后仍可继续。本轮不计官方排行榜、办公币和奖励。</p>
    <section className={styles.sheet} aria-label="2048 数值整理"><div className={styles.summary}><span>累计 {state.score}</span><span>调整 {state.moves} 次</span><span>{state.over?'无可合并项':state.won?'已达 2048，可继续':'目标 2048'}</span></div>
      <div className={styles.board} ref={board} tabIndex={0} data-exclusive-game-input="office-2048" role="group" aria-label="数值棋盘，方向键或滑动合并" onKeyDown={key} onPointerDown={down} onPointerUp={up} onPointerCancel={()=>{touch.current=null;}} onBlur={()=>setActive(false)}>
        {state.cells.map((n,i)=><div className={styles.cell} key={i} data-value={n} aria-label={`${Math.floor(i/4)+1}行${i%4+1}列：${n||'空'}`}>{active?n||'·':'—'}</div>)}
        {!active&&<div className={styles.cover}><strong>工作记录已收起</strong><span>进度仅留在当前页面，离开或退出账号即清空。</span></div>}
      </div>
      <div className={styles.actions}><button onClick={start} disabled={active||state.over}>继续整理</button><button onClick={()=>setActive(false)} disabled={!active}>收起 / Esc</button><button onClick={()=>{setState(newSheet());setActive(false);}}>新建工作稿</button></div>
      <div className={styles.directions} aria-label="触屏方向按钮">{([['up','↑'],['left','←'],['down','↓'],['right','→']] as const).map(([d,label])=><button key={d} aria-label={`向${{up:'上',left:'左',down:'下',right:'右'}[d]}整理`} disabled={!active} onPointerDown={e=>e.preventDefault()} onClick={()=>{move(d);board.current?.focus();}}>{label}</button>)}</div>
    </section><p className={styles.note}>先点「继续整理」再操作；失焦、切换到其他游戏或 Esc 会自动收起。支持手机滑动。静音、无联网存档。</p><footer>改编自 Gabriele Cirulli / 2048 · <a href="/licenses/office-2048-MIT.txt" target="_blank" rel="noreferrer">MIT 许可及改编说明</a></footer></main>;
}
