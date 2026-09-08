import { useEffect, useState, type JSX } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { useCommunityAuthStore } from '../../../app/store/community-auth-store';
import { RailGameSurface } from './RailGameSurface';
import { RailRoomChat } from './RailRoomChat';
import { useRailRoom } from './useRailRoom';
import styles from './Rail.module.css';

export function RailRoomPage(): JSX.Element {
  const { roomId = '' } = useParams();
  const state = useRailRoom(roomId);
  const room = state.room;
  const navigate = useNavigate();
  const userId = useCommunityAuthStore((auth) => auth.phase === 'active' ? auth.user?.publicId : null);
  const [clock, setClock] = useState(Date.now());
  const [observed, setObserved] = useState({ server: Date.now(), local: Date.now() });
  const [password, setPassword] = useState('');
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null);
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 500); return () => clearInterval(timer); }, []);
  useEffect(() => { if (room) setObserved({ server: Date.parse(room.serverNow), local: Date.now() }); }, [room?.serverNow]);
  useEffect(() => { setPassword(''); setPasswordNotice(null); }, [state.sessionKey]);
  if (!userId) return <section className={styles.page}><p className={styles.notice}><Link to="/login">登录账号</Link>后继续查看轨道房间。</p></section>;
  if (!room) return <section className={styles.page}><Link to="/games/rail">← 返回轨道大厅</Link>{state.error ? <p className={styles.error} role="alert">{state.error}</p> : <p role="status" className={styles.empty}>正在连接轨道房间…</p>}</section>;
  const participants = room.members.filter((member) => member.role === 'participant' && !member.left);
  const observers = room.members.filter((member) => member.role === 'spectator' && !member.left);
  const canStart = participants.length + room.bots.length >= 3 && participants.every((member) => member.ready);
  const remaining = room.game ? Math.max(0, Math.ceil((room.game.deadlineAt - (observed.server + clock - observed.local)) / 1000)) : 0;
  const leave = async (): Promise<void> => {
    if (room.status === 'running' && room.me.role === 'participant' && !window.confirm('退出后本局继续计时，你的本局成绩不参与奖励。确定退出吗？')) return;
    if (await state.change({ kind: 'leave' })) navigate('/games/rail');
  };
  return <section className={styles.page} aria-label="轨道难题房间"><div className={styles.toolbar}><Link to="/games/rail">← 轨道大厅</Link><Link to="/games/rail/leaderboard">生存日榜 →</Link></div>
    <div className={styles.heading}><div><span className={styles.eyebrow}>TRACK WORKSHOP / {room.mode === 'practice' ? 'PRACTICE' : 'TEAM SESSION'}</span><h1>{room.title}</h1><p>{room.mode === 'practice' ? '人机练习 · 不计日榜、不发奖励' : room.me.role === 'spectator' ? '你正在旁观 · 不参与出牌、评分和奖励' : '玩家房间 · 以服务器结算为准'}{room.hasPassword ? ' · 密码房' : ''}</p></div><button className={styles.button} type="button" disabled={state.pending || room.me.left} onClick={() => { void leave(); }}>{room.me.role === 'spectator' ? '退出旁观' : '离开房间'}</button></div>
    {state.error ? <div className={styles.error} role="alert">{state.error}{state.uncertain ? <button className={styles.button} type="button" disabled={state.pending} onClick={() => { void state.retry(); }}>重试刚才操作</button> : null}</div> : null}
    {room.me.left ? <p className={styles.notice}>你已离开房间。<Link to="/games/rail">返回大厅</Link></p> : null}
    {room.game ? <nav className={styles.quickNav} aria-label="房间快速定位"><a href="#rail-tracks">查看两轨</a>{room.game.me && (room.game.me.availableActions.length > 0 || ['decision', 'rating'].includes(room.game.phase)) ? <a href="#rail-actions">我的操作</a> : null}<a href="#rail-discussion">房间讨论</a></nav> : null}
    <div className={styles.roomGrid}><div className={styles.stack}>
      {room.status === 'waiting' ? <section className={styles.panel}><div className={styles.panelTitle}><h2>等待成员准备</h2><span className={styles.pill}>{participants.length + room.bots.length} / {room.maxPlayers} 个席位</span></div><div className={styles.body}><p className={styles.muted}>至少 3 个席位，所有真人玩家准备后由房主开始。机器人自动行动，并始终标注为 AI；旁观者不占席位。</p>{room.me.role === 'participant' && !room.me.left ? <div className={styles.actions} style={{ justifyContent: 'flex-start' }}><button className={styles.button} type="button" disabled={state.pending || state.uncertain} onClick={() => { void state.change({ kind: 'ready', ready: !room.me.ready }); }}>{room.me.ready ? '取消准备' : '我已准备'}</button>{room.me.isHost ? <button className={styles.primary} type="button" disabled={state.pending || state.uncertain || !canStart} onClick={() => { void state.change({ kind: 'start' }); }}>开始本局</button> : null}</div> : <p className={styles.notice}>观众只需等待开局，不用准备。</p>}</div></section> : null}
      {room.game ? <><div className={styles.roundInfo}><span className={styles.muted}>线上房间计时不受便签遮罩影响</span>{room.status === 'running' ? <strong role="timer" aria-label="当前阶段剩余时间">剩余 {remaining} 秒</strong> : null}</div><RailGameSurface key={state.sessionKey} view={room.game} onAction={state.action} disabled={room.me.left || state.pending || state.uncertain} /></> : null}
      {room.status === 'closed' ? <p className={styles.notice}>房间已关闭。<Link to="/games/rail">返回大厅开启下一局</Link></p> : null}
      <p className={styles.notice}>{room.rankingNotice}{room.status === 'finished' && room.leaderboardDate ? <><br /><Link to={`/games/rail/leaderboard?date=${room.leaderboardDate}`}>查看 {room.leaderboardDate} 生存日榜</Link></> : null}</p>
    </div><aside className={`${styles.stack} ${styles.roomAside}`}>
      <section className={styles.panel}><div className={styles.panelTitle}><h2>房间成员</h2><span className={styles.muted}>{observers.length} 位观众</span></div><ul className={styles.list}>{room.members.filter((member) => member.role === 'participant').map((member) => {
        const player = room.game?.players.find((entry) => entry.id === member.publicId);
        return <li className={styles.member} key={member.publicId}><div><strong>{member.displayName}{member.publicId === room.me.publicId ? '（我）' : ''}</strong><small>{member.publicId === room.host?.publicId ? '房主 · ' : ''}{member.left ? '已离开' : room.status === 'waiting' ? member.ready ? '已准备' : '未准备' : player?.team ? `${player.team} 轨阵营` : player ? '本轮列车长' : '参与中'}</small></div>{player ? <span className={styles.muted}>{player.survived} 次生存</span> : null}</li>;
      })}{room.bots.map((bot) => <li className={styles.member} key={bot.id}><div><strong>{bot.displayName}</strong><small>系统机器人 · 自动参与 · 不上榜</small></div><span className={styles.pill}>AI</span></li>)}</ul></section>
      {room.me.isHost && !room.me.left && room.status === 'waiting' ? <section className={styles.panel}><div className={styles.panelTitle}><h2>房主设置</h2></div><div className={styles.body}><label className={styles.field}>机器人数量<select aria-label="房间机器人数量" value={room.bots.length} disabled={state.pending || state.uncertain} onChange={(event) => { void state.change({ kind: 'bots', count: Number(event.target.value) }); }}>{Array.from({ length: Math.min(8, room.maxPlayers - participants.length) + 1 }, (_, count) => <option key={count} value={count}>{count} 位</option>)}</select></label><form style={{ marginTop: 16 }} onSubmit={(event) => { event.preventDefault(); void state.change({ kind: 'password', password }).then((ok) => { if (ok) { setPassword(''); setPasswordNotice('房间密码设置已更新。'); } }); }}><label className={styles.field}>更新房间密码<input type="password" value={password} maxLength={256} autoComplete="new-password" disabled={state.pending} onChange={(event) => { setPassword(event.target.value); setPasswordNotice(null); }} placeholder="留空并保存，取消密码" /></label><button className={styles.button} style={{ marginTop: 10 }} type="submit" disabled={state.pending || state.uncertain}>保存密码设置</button>{passwordNotice ? <p className={styles.muted} role="status" style={{ marginTop: 8 }}>{passwordNotice}</p> : null}</form></div></section> : null}
      <RailRoomChat key={state.sessionKey} room={room} />
    </aside></div>
  </section>;
}
