import { useEffect, useRef, useState, type JSX } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { RailCreateInput, RailRoomList, RailRoomRole, RailRoomSummary } from '@stealth-reader/shared';

import { getCommunitySessionGeneration } from '../../../api/community-http';
import { communityRailApi, railErrorMessage } from '../../../api/community-rail';
import { useCommunityAuthStore } from '../../../app/store/community-auth-store';
import styles from './Rail.module.css';

export function RailLobbyPage(): JSX.Element {
  const userId = useCommunityAuthStore((state) => state.phase === 'active' ? state.user?.publicId ?? null : null);
  const generation = getCommunitySessionGeneration();
  const key = `${userId}:${generation}`;
  const latest = useRef(key); latest.current = key;
  const alive = useRef(true);
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState<{ key: string; data: RailRoomList } | null>(null);
  const [title, setTitle] = useState('');
  const [password, setPassword] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [botCount, setBotCount] = useState(0);
  const [joinTarget, setJoinTarget] = useState<{ room: RailRoomSummary; role: RailRoomRole } | null>(null);
  const [joinPassword, setJoinPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const createRef = useRef<RailCreateInput | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const current = (requestKey: string): boolean => alive.current && latest.current === requestKey && getCommunitySessionGeneration() === generation && useCommunityAuthStore.getState().phase === 'active' && useCommunityAuthStore.getState().user?.publicId === userId;
  useEffect(() => {
    setSnapshot(null); setError(null); setListError(null); setBusy(false); busyRef.current = false; createRef.current = null;
    setPassword(''); setJoinPassword(''); setJoinTarget(null); setTitle('');
    if (!userId) return undefined;
    let active = true; let timer: ReturnType<typeof setTimeout> | undefined; let controller: AbortController | undefined;
    const poll = async (): Promise<void> => {
      controller = new AbortController();
      try { const data = await communityRailApi.list(controller.signal); if (active && current(key)) { setSnapshot({ key, data }); setListError(null); } }
      catch (reason) { if (active && current(key) && !controller.signal.aborted) setListError(railErrorMessage(reason)); }
      finally { if (active && current(key)) timer = setTimeout(() => { void poll(); }, document.hidden ? 5000 : 2000); }
    };
    void poll(); return () => { active = false; controller?.abort(); if (timer) clearTimeout(timer); };
  }, [key, userId, generation]);
  const page = snapshot?.key === key ? snapshot.data : null;
  const create = async (mode: 'practice' | 'room'): Promise<void> => {
    if (busyRef.current || !userId || !current(key)) return;
    const values = mode === 'practice' ? { mode, title: '轨道推演 · 人机练习', maxPlayers: 3, botCount: 2 } : { mode, title: title.trim() || '午间轨道讨论组', password, maxPlayers, botCount };
    const old = createRef.current;
    if (!old || JSON.stringify({ ...old, clientRequestId: undefined }) !== JSON.stringify(values)) createRef.current = { ...values, clientRequestId: crypto.randomUUID() };
    busyRef.current = true; setBusy(true); setError(null);
    try { const room = await communityRailApi.create(createRef.current!); if (current(key)) { createRef.current = null; setPassword(''); navigate(`/games/rail/rooms/${room.id}`); } }
    catch (reason) { if (current(key)) setError(railErrorMessage(reason)); }
    finally { if (current(key)) { busyRef.current = false; setBusy(false); } }
  };
  const join = async (room: RailRoomSummary, role: RailRoomRole, enteredPassword?: string): Promise<void> => {
    if (busyRef.current || !current(key)) return;
    if (room.hasPassword && enteredPassword === undefined) { setJoinTarget({ room, role }); setJoinPassword(''); return; }
    busyRef.current = true; setBusy(true); setError(null);
    try { const joined = await communityRailApi.join({ roomId: room.id, role, ...(room.hasPassword ? { password: enteredPassword } : {}) }); if (current(key)) { setJoinPassword(''); setJoinTarget(null); navigate(`/games/rail/rooms/${joined.id}`); } }
    catch (reason) { if (current(key)) setError(railErrorMessage(reason)); }
    finally { if (current(key)) { busyRef.current = false; setBusy(false); } }
  };

  return <section className={styles.page} aria-label="轨道难题大厅">
    <div className={styles.toolbar}><Link to="/games">← 小游戏专区</Link><Link to="/games/rail/leaderboard">轨道生存日榜 →</Link></div>
    <div className={styles.heading}><div><span className={styles.eyebrow}>TRACK WORKSHOP / 轨道推演</span><h1>轨道难题</h1><p>铺设人物，补上一条意想不到的条件，再把选择交给本轮列车长。3–9 个席位，一场关于取舍的轻量桌游。</p></div><span className={styles.pill}>默认静音 · Esc 便签</span></div>
    {!userId ? <p className={styles.notice}><Link to="/login">登录账号</Link>后可开始练习、建房或旁观。</p> : <>
      {page?.activeRoom ? <p className={styles.notice}>你有一个未结束的房间：<Link to={`/games/rail/rooms/${page.activeRoom.id}`}>{page.activeRoom.title} · 返回房间</Link></p> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <div className={styles.grid}><div className={styles.stack}>
        <section className={styles.panel}><div className={styles.panelTitle}><h2>玩家建房</h2><span className={styles.muted}>真人 / 机器人明确区分</span></div><form className={styles.body} onSubmit={(event) => { event.preventDefault(); void create('room'); }}><div className={styles.formGrid}>
          <label className={`${styles.field} ${styles.full}`}>房间名称<input value={title} maxLength={40} disabled={busy} placeholder="午间轨道讨论组" onChange={(event) => setTitle(event.target.value)} /></label>
          <label className={styles.field}>席位上限<select value={maxPlayers} disabled={busy} onChange={(event) => { const count = Number(event.target.value); setMaxPlayers(count); setBotCount((value) => Math.min(value, count - 1)); }}>{Array.from({ length: 7 }, (_, i) => i + 3).map((count) => <option key={count} value={count}>{count} 人</option>)}</select></label>
          <label className={styles.field}>初始机器人<select value={botCount} disabled={busy} onChange={(event) => setBotCount(Number(event.target.value))}>{Array.from({ length: maxPlayers }, (_, count) => <option key={count} value={count}>{count} 位{count === 0 ? ' · 纯真人' : ''}</option>)}</select></label>
          <label className={`${styles.field} ${styles.full}`}>房间密码（可选）<input type="password" value={password} maxLength={256} autoComplete="new-password" disabled={busy} placeholder="4–64 字符；留空即无需密码" onChange={(event) => setPassword(event.target.value)} /></label>
          <button className={`${styles.primary} ${styles.full}`} type="submit" disabled={busy || Boolean(page?.activeRoom)}>{busy ? '处理中…' : '创建轨道房间'}</button>
        </div><p className={styles.muted} style={{ marginTop: 12, marginBottom: 0 }}>所有房间都显示在大厅。房主可在开始前增减机器人并修改密码；增减机器人后真人需重新准备。含机器人的整局不参与办公币日榜。旁观不占席位，密码房观众也需密码。</p></form></section>
        {joinTarget ? <section className={styles.panel} aria-label="加入密码房"><div className={styles.panelTitle}><h2>{joinTarget.role === 'spectator' ? '旁观' : '加入'}：{joinTarget.room.title}</h2><button type="button" className={styles.button} disabled={busy} onClick={() => { setJoinTarget(null); setJoinPassword(''); }}>取消</button></div><form className={styles.body} onSubmit={(event) => { event.preventDefault(); void join(joinTarget.room, joinTarget.role, joinPassword); }}><label className={styles.field}>加入房间密码<input autoFocus type="password" value={joinPassword} maxLength={256} autoComplete="off" onChange={(event) => setJoinPassword(event.target.value)} /></label><button className={styles.primary} style={{ marginTop: 12 }} type="submit" disabled={busy || !joinPassword}>确认{joinTarget.role === 'spectator' ? '旁观' : '加入'}</button></form></section> : null}
        <section className={styles.panel}><div className={styles.panelTitle}><h2>房间大厅</h2><span className={styles.muted}>进行中的房间可旁观</span></div>{listError ? <p className={styles.error} role="alert">{listError}（稍后自动重试）</p> : null}{!page && !listError ? <p className={styles.empty} role="status">正在读取房间…</p> : null}{page?.items.length === 0 ? <p className={styles.empty}>暂时没有房间。创建一间，叫上同事一起推演。</p> : null}<ul className={styles.list}>{page?.items.map((room) => <li className={styles.roomRow} key={room.id}><div><strong>{room.title}</strong> {room.hasPassword ? <span className={styles.pill}>密码房</span> : null}<small>{room.playerCount} 位真人 · {room.botCount} 位机器人 · {room.spectatorCount} 位观众</small><small>{room.status === 'waiting' ? '等待准备' : '游戏进行中'} · {room.host?.displayName ?? '房主'}</small></div><div className={styles.actions}>{room.status === 'waiting' ? <button type="button" className={styles.button} disabled={busy || room.playerCount + room.botCount >= room.maxPlayers} onClick={() => { void join(room, 'participant'); }}>加入</button> : null}<button type="button" className={styles.button} disabled={busy || room.spectatorCount >= 20} onClick={() => { void join(room, 'spectator'); }}>旁观</button></div></li>)}</ul></section>
      </div><aside className={styles.stack}>
        <section className={styles.panel}><div className={styles.panelTitle}><h2>先熟悉一局</h2><span className={styles.pill}>人机练习</span></div><div className={styles.body}><p className={styles.muted}>你 + 2 位明确标注的系统机器人，完整体验铺牌、附加条件、选轨和评分。不计日榜，不发办公币。</p><button className={styles.button} type="button" disabled={busy || Boolean(page?.activeRoom)} onClick={() => { void create('practice'); }}>开始人机练习</button></div></section>
        <section className={styles.panel}><div className={styles.panelTitle}><h2>一局如何进行</h2></div><div className={styles.body}><ol className={styles.rules}><li>每回合轮换列车长，其余成员分为 A / B 两队。</li><li>善牌铺己方，恶牌铺对方，再给人物追加条件。</li><li>列车长选择经过一轨，另一轨的成员生存。</li><li>其他成员给本轮列车长 1–10 分趣味评价。</li><li>全部回合结束，展示生存率和恶魔 MVP。</li></ol><p className={styles.notice}>仅符合真人完整参与条件的房间计入生存日榜。冠军次日获得 100 办公币；机器人、练习、超时托管与中途退出不刷奖励。</p></div></section>
      </aside></div>
    </>}
  </section>;
}
