import { useEffect, useRef, useState, type FormEvent, type JSX } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { ArcadeGameKey, PlayCreateInput, PlayRoomList, PlayRoomSummary } from '@stealth-reader/shared';

import { communityGameErrorMessage, communityGameRoomsApi, createPlayRequestId } from '../../../api/community-game-rooms';
import { getCommunitySessionGeneration } from '../../../api/community-http';
import { useCommunityAuthStore } from '../../../app/store/community-auth-store';
import { COMMUNITY_FEATURE_FLAGS } from '../../../app/community-nav';
import { GAME_NAMES, gameKeyFrom, ROOM_STATUS, usePlayCatalog } from './play-ui-state';
import styles from './GameRooms.module.css';

export function CommunityGameRoomsPage(): JSX.Element {
  const { catalog, error: catalogError, retry } = usePlayCatalog();
  const userId = useCommunityAuthStore((state) => state.phase === 'active' ? state.user?.publicId ?? null : null);
  const generation = getCommunitySessionGeneration();
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const filter = gameKeyFrom(search.get('game'));
  const [gameKey, setGameKey] = useState<ArcadeGameKey>(filter ?? 'draw');
  const [title, setTitle] = useState('');
  const [password, setPassword] = useState('');
  const [joinTarget, setJoinTarget] = useState<PlayRoomSummary | null>(null);
  const [joinPassword, setJoinPassword] = useState('');
  const [list, setList] = useState<{ key: string; data: PlayRoomList } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const createRequest = useRef<PlayCreateInput | null>(null);
  const context = `${userId}:${generation}:${filter ?? 'all'}`;
  const latest = useRef(context); latest.current = context;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const current = (key: string): boolean => mounted.current && latest.current === key && getCommunitySessionGeneration() === generation && useCommunityAuthStore.getState().user?.publicId === userId;
  const page = list?.key === context ? list.data : null;

  useEffect(() => {
    setList(null); setListError(null); setBusy(false); setError(null); createRequest.current = null;
    setPassword(''); setJoinPassword(''); setJoinTarget(null);
    if (!userId) return undefined;
    let active = true; let timer: ReturnType<typeof setTimeout> | undefined; let controller: AbortController | null = null;
    const poll = async (): Promise<void> => {
      controller = new AbortController();
      try {
        const result = await communityGameRoomsApi.list(filter, controller.signal);
        if (active && latest.current === context && generation === getCommunitySessionGeneration()) { setList({ key: context, data: result }); setListError(null); }
      } catch (reason) { if (active && !controller.signal.aborted && latest.current === context) setListError(communityGameErrorMessage(reason)); }
      finally { if (active) timer = setTimeout(() => { void poll(); }, document.hidden ? 5000 : 2000); }
    };
    void poll();
    return () => { active = false; controller?.abort(); if (timer) clearTimeout(timer); };
  }, [context, filter, generation, userId]);

  const create = async (event: FormEvent): Promise<void> => {
    event.preventDefault(); if (busy || !userId) return;
    const key = context;
    const previous = createRequest.current;
    if (!previous || previous.gameKey !== gameKey || previous.title !== title.trim() || previous.password !== password) createRequest.current = { clientRequestId: createPlayRequestId(), gameKey, mode: 'room', title: title.trim(), password };
    setBusy(true); setError(null);
    try { const room = await communityGameRoomsApi.create(createRequest.current!); if (current(key)) { createRequest.current = null; navigate(`/games/rooms/${room.id}`); } }
    catch (reason) { if (current(key)) setError(communityGameErrorMessage(reason)); }
    finally { if (current(key)) setBusy(false); }
  };
  const join = async (roomId: string, suppliedPassword?: string): Promise<void> => {
    if (busy || !userId) return;
    const key = context; setBusy(true); setError(null);
    try { const room = await communityGameRoomsApi.join({ roomId, ...(suppliedPassword === undefined ? {} : { password: suppliedPassword }) }); if (current(key)) { setJoinPassword(''); navigate(`/games/rooms/${room.id}`); } }
    catch (reason) { if (current(key)) setError(communityGameErrorMessage(reason)); }
    finally { if (current(key)) setBusy(false); }
  };
  return <section aria-label="玩家建房专区"><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>TEAM SESSIONS</span><h1>玩家建房</h1><p>六款游戏都能由玩家建房。经典棋盘采用同题竞速、独立操作；你画我猜和谁是卧底实时协作。</p></div></div><nav className={styles.tabs} aria-label="小游戏模式"><Link to="/games">单机挑战</Link><Link to="/games/rooms" aria-current="page">玩家建房</Link></nav>
    <p className={styles.info}><Link to="/games/rail">轨道难题 · 3–9 人 / 可观战 →</Link></p>
    {COMMUNITY_FEATURE_FLAGS.paperArena && <p className={styles.info}><Link to="/games/ballpoint-breach/arena">纸上突围 · 红蓝对战 · 4–8 席 / AI 补齐 →</Link></p>}
    {!userId ? <p className={styles.info}><Link to="/login">登录账号</Link>后可查看房间、邀请同事与参加日榜挑战。</p> : <>
      {page?.activeRoom ? <p className={styles.info}>你有一个{ROOM_STATUS[page.activeRoom.status]}的赛局：<Link to={`/games/rooms/${page.activeRoom.id}`}>{page.activeRoom.title} · 返回房间 →</Link></p> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <div className={styles.stack}>
        <section className={styles.panel}>
          <div className={styles.panelHeading}><h2>建立一个房间</h2><span className={styles.muted}>只有真实玩家入房</span></div>
          <form className={styles.panelBody} onSubmit={(event) => { void create(event); }}>
            <div className={styles.formGrid}>
              <label className={styles.field}>游戏<select value={gameKey} onChange={(event) => setGameKey(event.target.value as ArcadeGameKey)} disabled={busy}>{Object.entries(GAME_NAMES).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
              <label className={styles.field}>房间名称<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={40} placeholder="例如：午间协作组" disabled={busy} /></label>
              <label className={styles.field}>房间密码（可选）<input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} maxLength={256} aria-describedby="create-password-help" disabled={busy} /></label>
              <button className={styles.quietButton} type="submit" disabled={busy || Boolean(page?.activeRoom)}>{busy ? '处理中…' : '创建房间'}</button>
            </div>
            <p id="create-password-help" className={styles.muted}>房间会出现在列表中。密码为 4–64 个字符；留空则可直接加入，不再使用邀请码。</p>
            <p className={styles.muted}>{catalog?.games.find((game) => game.gameKey === gameKey)?.roomDescription ?? '房主创建后，其他玩家从列表加入并准备，再开始本局。'}</p>
          </form>
        </section>
        {joinTarget ? <section className={styles.panel} aria-label={`加入 ${joinTarget.title}`}>
          <div className={styles.panelHeading}><h2>加入 {joinTarget.title}</h2></div>
          <form className={styles.panelBody} onSubmit={(event) => { event.preventDefault(); void join(joinTarget.id, joinPassword); }}>
            <label className={styles.field}>请输入房间密码<input type="password" autoComplete="current-password" autoFocus value={joinPassword} onChange={(event) => setJoinPassword(event.target.value)} maxLength={256} disabled={busy} /></label>
            <div className={styles.rowActions}><button className={styles.quietButton} type="submit" disabled={busy || !joinPassword}>确认加入</button><button className={styles.quietButton} type="button" disabled={busy} onClick={() => { setJoinTarget(null); setJoinPassword(''); setError(null); }}>取消</button></div>
          </form>
        </section> : null}
        <section className={styles.panel}>
          <div className={styles.panelHeading}><h2>公开房间</h2><label className={styles.field}>筛选游戏<select aria-label="筛选房间游戏" value={filter ?? ''} onChange={(event) => setSearch(event.target.value ? { game: event.target.value } : {})}><option value="">全部游戏</option>{Object.entries(GAME_NAMES).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label></div>
          {listError ? <p className={styles.error} role="alert">{listError}（稍后自动重试）</p> : null}
          {!page && !listError ? <p className={styles.empty} role="status">正在读取房间列表…</p> : null}
          {page?.items.length === 0 ? <p className={styles.empty}>暂时没有公开房间。建一个房间，邀请同事来玩。</p> : null}
          <div className={styles.roomList}>{page?.items.map((room) => <article key={room.id} className={styles.roomRow}>
            <div><strong>{room.title}</strong><small>{GAME_NAMES[room.gameKey]} · {room.host?.displayName ?? '房间成员'} 创建</small></div>
            <span className={styles.muted}>{room.memberCount} / {room.maxPlayers} 人</span><span className={styles.muted}>{ROOM_STATUS[room.status]} · {room.hasPassword ? '需要密码' : '无需密码'}</span>
            <button className={styles.quietButton} type="button" aria-label={`加入 ${room.title}`} disabled={busy || room.status !== 'waiting' || room.memberCount >= room.maxPlayers} onClick={() => { if (room.hasPassword) { setJoinTarget(room); setJoinPassword(''); setError(null); } else { void join(room.id); } }}>加入</button>
          </article>)}</div>
        </section>
      </div>
    </>}
    {catalogError ? <p className={styles.error} role="alert">{catalogError} <button className={styles.quietButton} type="button" onClick={retry}>重试目录</button></p> : null}
    {catalog ? <p className={styles.info}>{catalog.rankingRules}<br />{catalog.rewardRules} · {catalog.settlementTime}</p> : null}
  </section>;
}
