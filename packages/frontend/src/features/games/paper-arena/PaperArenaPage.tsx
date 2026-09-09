import { useEffect,useRef,useState,type JSX } from 'react';
import { Link,useNavigate,useParams } from 'react-router-dom';
import type { PaperArenaRoomSummary,PaperArenaRoomView } from '@stealth-reader/shared';
import { CommunityApiError,getCommunitySessionGeneration } from '../../../api/community-http';
import { paperArenaApi } from './paper-arena-api';
import { PaperArenaConnection,isPaperRoomSnapshot,PAPER_ARENA_UPGRADE_MESSAGE,type PaperArenaConnectionStatus } from './PaperArenaConnection';
import { PaperArenaStage } from './PaperArenaStage';
import styles from './PaperArena.module.css';

function errorMessage(error:unknown):string{
  if(error instanceof Error&&error.message===PAPER_ARENA_UPGRADE_MESSAGE)return error.message;
  if(error instanceof CommunityApiError){const body=error.body as {code?:string;message?:string}|null;if(typeof body?.message==='string')return body.message.slice(0,250);if(error.status===401)return '登录状态已变化，请重新登录后加入。';if(error.status===403)return '无法加入，请检查房间密码或账号状态。';if(error.status===409)return '房间状态刚刚变化，请刷新列表后重试。';if(error.status===503)return '联机演练暂在维护，单机纸上突围仍可使用。';}
  return '连接未完成，未假定操作成功。请刷新后重试。';
}
const STATUS:Record<PaperArenaConnectionStatus,string>={connecting:'连接中',online:'实时连接',reconnecting:'正在重连',offline:'连接已断开',outdated:'需要刷新'};

export function PaperArenaPage():JSX.Element{
  const navigate=useNavigate(),[rooms,setRooms]=useState<PaperArenaRoomSummary[]>([]),[currentRoom,setCurrentRoom]=useState<string|null>(null),[enabled,setEnabled]=useState(true);
  const [name,setName]=useState('纸上协作演练'),[capacity,setCapacity]=useState(4),[target,setTarget]=useState(30),[password,setPassword]=useState(''),[joinPassword,setJoinPassword]=useState(''),[selected,setSelected]=useState<string|null>(null);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);const mounted=useRef(true),request=useRef<string|null>(null),locked=useRef(false);
  useEffect(()=>{mounted.current=true;const controller=new AbortController(),generation=getCommunitySessionGeneration();const load=()=>{void paperArenaApi.rooms(controller.signal).then(value=>{if(mounted.current&&generation===getCommunitySessionGeneration()){setRooms(value.rooms);setCurrentRoom(value.currentRoomId);setEnabled(value.enabled);setError('');}}).catch(err=>{if(!controller.signal.aborted)setError(errorMessage(err));});};load();const timer=window.setInterval(load,5000);return()=>{mounted.current=false;controller.abort();window.clearInterval(timer);};},[]);
  async function enter(create:boolean):Promise<void>{
    if(locked.current)return;locked.current=true;setBusy(true);setError('');const generation=getCommunitySessionGeneration();
    try{
      if(create&&!request.current)request.current=crypto.randomUUID();
      const room=create?await paperArenaApi.create({requestId:request.current!,name:name.trim(),maxPlayers:capacity,targetKills:target,password}):await paperArenaApi.join(selected!,joinPassword);
      if(!isPaperRoomSnapshot(room,room.id))throw new Error(PAPER_ARENA_UPGRADE_MESSAGE);
      if(mounted.current&&generation===getCommunitySessionGeneration()){setPassword('');setJoinPassword('');navigate(`/games/ballpoint-breach/arena/${encodeURIComponent(room.id)}`);}
    }catch(err){if(mounted.current)setError(errorMessage(err));}finally{locked.current=false;if(mounted.current)setBusy(false);}
  }
  return <main className={styles.page}><header className={styles.pageHeader}><div><span>COLLABORATION NOTES / 红蓝演练</span><h1>纸上突围 · 联机协作</h1><p>4–8 人红蓝对战，空位 AI 补齐。服务器判定命中，击败后随机复活。</p></div><Link to="/games/ballpoint-breach">返回单机</Link></header>{error?<p role="alert" className={styles.error}>{error}</p>:null}{!enabled?<p role="status">联机功能暂未开放。</p>:null}{currentRoom?<p className={styles.resume}>你已有房间 <Link to={`/games/ballpoint-breach/arena/${encodeURIComponent(currentRoom)}`}>返回当前对局</Link></p>:null}
    <div className={styles.lobby}><section className={styles.card}><h2>新建一份演练</h2><form onSubmit={event=>{event.preventDefault();void enter(true);}}><label>房间名称<input maxLength={32} minLength={1} required value={name} onChange={event=>{setName(event.target.value);request.current=null;}}/></label><div className={styles.formRow}><label>总人数（含 AI）<select value={capacity} onChange={event=>{setCapacity(Number(event.target.value));request.current=null;}}>{[4,5,6,7,8].map(value=><option key={value} value={value}>{value} 人</option>)}</select></label><label>获胜击败数<input type="number" min={20} max={100} step={1} required value={target} onChange={event=>{setTarget(Number(event.target.value));request.current=null;}}/></label></div><label>房间密码（可留空）<input type="password" minLength={password?4:undefined} maxLength={32} value={password} autoComplete="new-password" onChange={event=>{setPassword(event.target.value);request.current=null;}}/></label><p>不使用邀请码。目标可设 20–100，人数不足由 AI 接替空位；开局前可换队。</p><button type="submit" disabled={busy||!enabled||Boolean(currentRoom)}>{busy?'提交中…':'创建房间'}</button></form></section>
    <section className={styles.card}><h2>正在协作的房间 <small>{rooms.length}</small></h2>{rooms.length?<ul className={styles.rooms}>{rooms.map(room=><li key={room.id}><div><strong>{room.name}</strong><p>{room.humans}/{room.maxPlayers} 位玩家 · 目标 {room.targetKills} · {room.status==='waiting'?'等待开始':room.status==='running'?'进行中':'已结束'}{room.requiresPassword?' · 有密码':''}</p></div><button type="button" disabled={busy||!enabled||room.status==='finished'||(Boolean(currentRoom)&&currentRoom!==room.id)} onClick={()=>{setSelected(room.id);setJoinPassword('');}}>加入</button>{selected===room.id?<form onSubmit={event=>{event.preventDefault();void enter(false);}}>{room.requiresPassword?<label>输入房间密码<input type="password" required minLength={4} maxLength={32} value={joinPassword} autoComplete="off" onChange={event=>setJoinPassword(event.target.value)}/></label>:<p>无需密码，可以直接加入。</p>}<button type="submit" disabled={busy}>确认加入</button><button type="button" onClick={()=>setSelected(null)}>取消</button></form>:null}</li>)}</ul>:<p>暂时没有房间。你可以建房邀请朋友，也可独自与 AI 开始。</p>}</section></div>
    <aside className={styles.rules}><h2>原版纸笔场景 · 扩建地图</h2><p>保留建筑、脚手架、栈桥与起重机，向外围延伸掩体路线。原版涂鸦人物与步枪、霰弹枪、左轮、狙击枪、武士刀全部可用；每把枪独立弹匣和备用弹药。</p><p>WASD 移动 · Shift 冲刺 · 空格跳跃 · 1–5 / 滚轮切换 · 右键瞄准（武士刀格挡）· R 装填。五种武器开局平等获得，没有付费加成。</p><h2>短会话说明</h2><p>单局最长 15 分钟；暂不发放办公币，也不改变已有余额和排行榜。房间为临时对局，服务重启可能中断；空房 30 分钟过期。短时掉线由 AI 接替，90 秒后释放席位，回来不会借机恢复满血。</p><p>联机小窗缩小、遮盖或切出时停止你的输入，但比赛不会暂停。原单机仍保留自动暂停体验。联机暂不开放钩索、场景破坏和补给拾取。</p></aside>
  </main>;
}

export function PaperArenaRoomPage():JSX.Element{
  const {roomId=''}=useParams(),navigate=useNavigate();
  const [room,setRoom]=useState<PaperArenaRoomView|null>(null),[status,setStatus]=useState<PaperArenaConnectionStatus>('connecting'),[error,setError]=useState(''),[busy,setBusy]=useState(false),[compact,setCompact]=useState(false),[covered,setCovered]=useState(false),[expanded,setExpanded]=useState(false);
  const connection=useRef<PaperArenaConnection|null>(null),alive=useRef(true),locked=useRef(false);
  useEffect(()=>{
    alive.current=true;let disposed=false;const controller=new AbortController(),generation=getCommunitySessionGeneration();setRoom(null);setError('');
    void paperArenaApi.room(roomId,controller.signal).then(next=>{if(!disposed&&generation===getCommunitySessionGeneration()){if(!isPaperRoomSnapshot(next,roomId)){setError(PAPER_ARENA_UPGRADE_MESSAGE);setStatus('outdated');socket.stop();return;}setRoom(previous=>previous&&previous.game.tick>next.game.tick?previous:next);}}).catch(err=>{if(!disposed&&!controller.signal.aborted)setError(errorMessage(err));});
    const socket=new PaperArenaConnection(roomId,{snapshot:next=>{if(!disposed)setRoom(next);},status:next=>{if(!disposed)setStatus(next);},error:next=>{if(!disposed)setError(next);}});connection.current=socket;void socket.connect();
    return()=>{disposed=true;alive.current=false;controller.abort();socket.stop();connection.current=null;};
  },[roomId]);
  async function action(operation:()=>Promise<PaperArenaRoomView|unknown>,leave=false):Promise<void>{
    if(locked.current)return;locked.current=true;setBusy(true);const generation=getCommunitySessionGeneration();
    try{const next=await operation();if(alive.current&&generation===getCommunitySessionGeneration()){if(leave){connection.current?.stop();navigate('/games/ballpoint-breach/arena');}else{if(!isPaperRoomSnapshot(next,roomId)){setStatus('outdated');connection.current?.stop();throw new Error(PAPER_ARENA_UPGRADE_MESSAGE);}setRoom(previous=>previous&&previous.game.tick>next.game.tick?previous:next);}setError('');}}catch(err){if(alive.current)setError(errorMessage(err));}finally{locked.current=false;if(alive.current)setBusy(false);}
  }
  const me=room?.players.find(player=>player.id===room.myPlayerId),host=Boolean(room&&room.hostPlayerId===room.myPlayerId);
  return <main className={styles.page}><header className={styles.pageHeader}><div><span>WORKING DOCUMENT</span><h1>协作演练记录</h1><p>这是一个临时协作窗口。你可以缩小窗口继续处理其他事情，服务器对局仍会进行。</p></div><Link to="/games/ballpoint-breach/arena">房间列表</Link></header><section className={styles.document}><h2>本次安排</h2><ul><li>核对参与成员与协作分组</li><li>按约定目标完成一轮演练</li><li>查看结果，整理后续记录</li></ul><p>小窗路线离开会断开实时连接；短时掉线 AI 接替，不会把联机对战当成单机暂停。</p></section>
    <section className={styles.window} data-compact={compact} data-expanded={expanded} aria-label="纸上红蓝联机小窗"><header className={styles.windowHeader}><span>▤ {compact||covered?'工作便签':room?.name||'协作演练'}</span><small data-status={status}>{STATUS[status]}</small><div><button type="button" aria-label={compact?'展开联机小窗':'最小化联机小窗'} onClick={()=>setCompact(value=>!value)}>{compact?'▢':'−'}</button>{!compact?<button type="button" aria-label={expanded?'恢复小窗尺寸':'扩大联机小窗'} onClick={()=>setExpanded(value=>!value)}>↗</button>:null}<button type="button" aria-label={covered?'返回联机画面':'遮盖为工作备忘'} onClick={()=>{setCovered(value=>!value);setCompact(false);}}>□</button></div></header>
      {!compact?(covered?<div className={styles.cover}><h2>工作备忘</h2><p>资料核对 · 任务安排 · 会议纪要</p><p>联机输入已停，服务器对局继续。</p><button type="button" onClick={()=>setCovered(false)}>返回工作窗口</button></div>:<>
        {error?<p role="alert" className={styles.error}>{error}{status==='outdated'?<button type="button" onClick={()=>window.location.reload()}>刷新到新版本</button>:null}</p>:null}
        {room?<><div className={styles.score}><span data-team="red">红组 <b>{room.game.scores.red}</b></span><strong>目标 {room.targetKills}</strong><span data-team="blue"><b>{room.game.scores.blue}</b> 蓝组</span></div><PaperArenaStage room={room} enabled={status==='online'} onInput={input=>{connection.current?.send(input);}} onError={setError}/><div className={styles.roomActions}>{room.status==='waiting'?<><button type="button" disabled={busy||me?.team==='red'} onClick={()=>{void action(()=>paperArenaApi.team(roomId,'red'));}}>加入红组</button><button type="button" disabled={busy||me?.team==='blue'} onClick={()=>{void action(()=>paperArenaApi.team(roomId,'blue'));}}>加入蓝组</button>{host?<button type="button" disabled={busy||status!=='online'} onClick={()=>{void action(()=>paperArenaApi.start(roomId));}}>开始（AI 补齐）</button>:<span>等待房主开始</span>}</>:<span>{room.status==='finished'?'本场结束':'WASD 移动 · 鼠标瞄准 · R 装填'}</span>}<button type="button" disabled={busy} onClick={()=>{void action(()=>paperArenaApi.leave(roomId),true);}}>退出房间</button></div><details className={styles.roster}><summary>成员与战果 · {room.humans}/{room.maxPlayers} 位玩家</summary><ul>{room.players.map(player=><li key={player.id} data-team={player.team}><strong>{player.name}{player.id===room.myPlayerId?'（你）':''}</strong><span>{player.isBot?'AI':player.connected?'在线':'暂离'} · {player.kills} 击败 / {player.deaths} 次重整</span></li>)}</ul></details><p className={styles.smallNote}>全程静音 · 未接管/遮盖不暂停 · 本场无办公币奖励</p></>:<p role="status" className={styles.cover}>正在读取房间…{error?<button type="button" onClick={()=>navigate('/games/ballpoint-breach/arena')}>返回房间列表</button>:null}</p>}
      </>):null}
    </section>
  </main>;
}
