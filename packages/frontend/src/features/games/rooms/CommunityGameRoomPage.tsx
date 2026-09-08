import { useEffect, useState, type JSX } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { useCommunityAuthStore } from '../../../app/store/community-auth-store';
import { ArcadeGameSurface } from './ArcadeGameSurface';
import { GAME_NAMES, ROOM_STATUS, usePlayCatalog } from './play-ui-state';
import { usePlayRoom } from './usePlayRoom';
import styles from './GameRooms.module.css';

export function CommunityGameRoomPage(): JSX.Element {
  const { roomId = '' } = useParams();
  const state = usePlayRoom(roomId);
  const { room } = state;
  const { catalog } = usePlayCatalog();
  const active = useCommunityAuthStore((auth) => auth.phase === 'active');
  const navigate = useNavigate();
  const [clock, setClock] = useState(Date.now());
  const [observed, setObserved] = useState({ server: Date.now(), local: Date.now() });
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 500); return () => clearInterval(timer); }, []);
  useEffect(() => { if (room) setObserved({ server: Date.parse(room.serverNow), local: Date.now() }); }, [room?.serverNow]);
  useEffect(() => { setCopyNotice(null); }, [roomId]);
  if (!active) return <p className={styles.info}><Link to="/login">登录账号</Link>后继续查看玩家房间。</p>;
  if (!room) return <section><Link className={styles.textLink} to="/games/rooms">← 返回玩家建房</Link>{state.error ? <p className={styles.error} role="alert">{state.error}</p> : <p className={styles.empty} role="status">正在连接游戏房间…</p>}</section>;
  const game = room.game;
  const definition = catalog?.games.find((item) => item.gameKey === room.gameKey);
  const members = room.members.filter((member) => !member.left);
  const canStart = room.status === 'waiting' && room.me.isHost && members.length >= (definition?.minPlayers ?? 2) && members.every((member) => member.ready);
  const currentServerTime = observed.server + clock - observed.local;
  const deadline = game?.gameKey === 'draw' ? game.board.roundEndsAt : game?.gameKey === 'undercover' ? game.board.phaseEndsAt : game?.gameKey === 'zhesi' ? game.board.turnEndsAt : game?.endsAt;
  const remaining = deadline ? Math.max(0, Math.ceil((deadline - currentServerTime) / 1000)) : 0;
  const leave = async (): Promise<void> => {
    if (room.status === 'running' && !window.confirm('离开后本局不能继续操作，已开始的房间仍会继续计时。确定离开吗？')) return;
    if (await state.change('leave')) navigate('/games/rooms');
  };
  return <section aria-label="游戏房间">
    <div className={styles.toolbar}><Link className={styles.textLink} to="/games/rooms">← 玩家房间列表</Link><Link className={styles.textLink} to={`/games/leaderboards/${room.gameKey}`}>{GAME_NAMES[room.gameKey]}日榜 →</Link></div>
    <div className={`${styles.sectionHeading} ${styles.roomHeading}`}><div><span className={styles.eyebrow}>{room.mode === 'solo' ? 'SOLO SESSION' : 'PLAYER ROOM'} · {ROOM_STATUS[room.status]}</span><h1>{room.title}<span className={styles.modeBadge}>{room.mode === 'solo' ? '单机挑战' : '玩家建房'}</span></h1><p>{GAME_NAMES[room.gameKey]} · {room.mode === 'solo' ? definition?.soloDescription : definition?.roomDescription}</p></div><button type="button" className={styles.quietButton} disabled={state.pending || room.me.left} onClick={() => { void leave(); }}>{room.status === 'running' ? '退出本局' : '离开房间'}</button></div>
    {state.error ? <div className={styles.error} role="alert">{state.error}{state.uncertain ? <button type="button" className={styles.quietButton} disabled={state.pending} onClick={() => { void state.retryAction(); }}>重试刚才操作</button> : null}</div> : null}
    {room.me.left ? <p className={styles.info}>你已离开这个房间。<Link to="/games/rooms">返回大厅</Link></p> : null}
    <div className={styles.roomLayout}>
      <aside className={styles.stack} aria-label="房间成员与信息"><section className={styles.panel}><div className={styles.panelHeading}><h2>{room.mode === 'solo' ? '本局玩家' : `成员 ${members.length} / ${room.maxPlayers}`}</h2></div><ul className={styles.members}>{room.members.map((member) => <li key={member.publicId}><span className={styles.memberName}>{member.displayName}{member.publicId === room.me.publicId ? '（我）' : ''}<small>{member.publicId === room.host?.publicId ? '房主 · ' : ''}{member.left ? '已离开' : room.status === 'waiting' ? member.ready ? '已准备' : '未准备' : game?.players.find((player) => player.id === member.publicId)?.finished ? '已完成' : '参与中'}</small></span><span className={styles.memberScore}>{game?.players.find((player) => player.id === member.publicId)?.score ?? member.score ?? '—'}{member.score !== null || game ? ' 分' : ''}</span></li>)}</ul></section>
        {room.mode === 'room' && !room.me.left ? <details className={styles.panel}><summary className={styles.panelHeading} style={{ cursor: 'pointer' }}>房间邀请<span className={styles.muted}>查看邀请码</span></summary><div className={styles.panelBody}><p className={styles.muted}>{room.visibility === 'invite' ? '仅邀请码可加入，不显示在公开列表。' : '公开房间，也可分享邀请码加入。'}</p><code style={{ display: 'block', fontSize: 19, letterSpacing: '.1em', margin: '12px 0', overflowWrap: 'anywhere' }}>{room.joinCode}</code><button className={styles.quietButton} type="button" onClick={() => { if (!navigator.clipboard) { setCopyNotice('请选中上方邀请码复制。'); return; } void navigator.clipboard.writeText(room.joinCode).then(() => setCopyNotice('邀请码已复制。')).catch(() => setCopyNotice('未能自动复制，请选中上方邀请码复制。')); }}>复制邀请码</button>{copyNotice ? <p role="status" className={styles.muted}>{copyNotice}</p> : null}</div></details> : null}
      </aside>
      <div className={styles.stack}>
        {room.status === 'waiting' ? <section className={styles.panel}><div className={styles.panelHeading}><h2>等待成员准备</h2></div><div className={styles.panelBody}><p className={styles.muted}>本款需要至少 {definition?.minPlayers ?? 2} 名玩家，所有成员准备后由房主开始。不会自动加入机器人。</p><div className={styles.rowActions} style={{ justifyContent: 'flex-start' }}><button type="button" className={styles.quietButton} disabled={state.pending || room.me.left} onClick={() => { void state.change('ready', !room.me.ready); }}>{room.me.ready ? '取消准备' : '我已准备'}</button>{room.me.isHost ? <button type="button" className={styles.quietButton} disabled={state.pending || !canStart} onClick={() => { void state.change('start'); }}>开始本局</button> : null}</div></div></section> : null}
        {game ? <section className={styles.panel}><div className={styles.panelHeading}><h2>{GAME_NAMES[room.gameKey]} · {game.phase === 'finished' ? '本局已完成' : game.gameKey === 'draw' ? `第 ${game.board.round} / ${game.board.totalRounds} 轮` : game.gameKey === 'undercover' ? `第 ${game.board.round} 轮` : '进行中'}</h2>{game.phase === 'running' ? <span className={styles.progress} role="timer" aria-label="当前阶段剩余时间">剩余 {remaining} 秒</span> : null}</div><div className={styles.panelBody}><details className={styles.muted} style={{ marginBottom: 12 }}><summary style={{ cursor: 'pointer' }}>本局规则</summary><p>{game.instructions}</p></details><ArcadeGameSurface view={game} onAction={state.action} disabled={room.me.left || state.uncertain} /></div></section> : null}
        {room.status === 'finished' ? <section className={styles.panel}><div className={styles.panelHeading}><h2>本局成绩</h2><span className={styles.muted}>{room.leaderboardDate ?? ''}</span></div><ol className={styles.leaderboard}>{(game?.players ?? []).map((player) => <li key={player.id}><span>{player.isBot ? '练习' : '·'}</span><strong>{player.displayName}{player.isBot ? <small>系统练习搭档 · 不上榜</small> : null}</strong><span>{player.score} 分</span></li>)}</ol><div className={styles.panelBody}><p className={styles.muted}>{room.rankingNotice}</p><Link className={styles.quietButton} to={`/games/leaderboards/${room.gameKey}`}>查看单机 / 房间共享日榜</Link></div></section> : null}
        {room.status === 'closed' ? <p className={styles.info}>房间已关闭。<Link to="/games/rooms">返回大厅开始新一局</Link></p> : null}
        {room.status === 'running' ? <p className={styles.muted}>请保持网络连接。便签遮罩只隐藏画面，不暂停线上计时；刷新页面后可以回到当前赛局。</p> : null}
      </div>
    </div>
  </section>;
}
