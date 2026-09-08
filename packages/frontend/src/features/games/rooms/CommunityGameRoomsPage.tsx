import { useEffect, useRef, useState, type FormEvent, type JSX } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { ArcadeGameKey, PlayCreateInput, PlayRoomList } from '@stealth-reader/shared';

import { communityGameErrorMessage, communityGameRoomsApi, createPlayRequestId } from '../../../api/community-game-rooms';
import { getCommunitySessionGeneration } from '../../../api/community-http';
import { useCommunityAuthStore } from '../../../app/store/community-auth-store';
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
  const [visibility, setVisibility] = useState<'public' | 'invite'>('public');
  const [code, setCode] = useState('');
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
    if (!previous || previous.gameKey !== gameKey || previous.title !== title.trim() || previous.visibility !== visibility) createRequest.current = { clientRequestId: createPlayRequestId(), gameKey, mode: 'room', visibility, title: title.trim() };
    setBusy(true); setError(null);
    try { const room = await communityGameRoomsApi.create(createRequest.current!); if (current(key)) { createRequest.current = null; navigate(`/games/rooms/${room.id}`); } }
    catch (reason) { if (current(key)) setError(communityGameErrorMessage(reason)); }
    finally { if (current(key)) setBusy(false); }
  };
  const join = async (roomId?: string): Promise<void> => {
    if (busy || !userId || (!roomId && !code.trim())) return;
    const key = context; setBusy(true); setError(null);
    try { const room = await communityGameRoomsApi.join(roomId ? { roomId } : { code: code.trim().toUpperCase() }); if (current(key)) navigate(`/games/rooms/${room.id}`); }
    catch (reason) { if (current(key)) setError(communityGameErrorMessage(reason)); }
    finally { if (current(key)) setBusy(false); }
  };
  return <section aria-label="玩家建房专区"><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>TEAM SESSIONS</span><h1>玩家建房</h1><p>六款游戏都能由玩家建房。经典棋盘采用同题竞速、独立操作；你画我猜和谁是卧底实时协作。</p></div></div><nav className={styles.tabs} aria-label="小游戏模式"><Link to="/games">单机挑战</Link><Link to="/games/rooms" aria-current="page">玩家建房</Link></nav>
    {!userId ? <p className={styles.info}><Link to="/login">登录账号</Link>后可查看房间、邀请同事与参加日榜挑战。</p> : <>
      {page?.activeRoom ? <p className={styles.info}>你有一个{ROOM_STATUS[page.activeRoom.status]}的赛局：<Link to={`/games/rooms/${page.activeRoom.id}`}>{page.activeRoom.title} · 返回房间 →</Link></p> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <div className={styles.stack}><section className={styles.panel}><div className={styles.panelHeading}><h2>建立一个房间</h2><span className={styles.muted}>只有真实玩家入房</span></div><form className={styles.panelBody} onSubmit={(event) => { void create(event); }}><div className={styles.formGrid}><label className={styles.field}>游戏<select value={gameKey} onChange={(event) => setGameKey(event.target.value as ArcadeGameKey)} disabled={busy}>{Object.entries(GAME_NAMES).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label><label className={styles.field}>房间名称<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={40} placeholder="例如：午间协作组" disabled={busy} /></label><label className={styles.field}>加入方式<select value={visibility} onChange={(event) => setVisibility(event.target.value as 'public' | 'invite')} disabled={busy}><option value="public">公开房间</option><option value="invite">仅邀请码</option></select></label><button className={styles.quietButton} type="submit" disabled={busy || Boolean(page?.activeRoom)}>{busy ? '处理中…' : '创建房间'}</button></div><p className={styles.muted}>{catalog?.games.find((game) => game.gameKey === gameKey)?.roomDescription ?? '房主创建后，邀请其他玩家加入并准备，再开始本局。'}</p></form></section>
      <section className={styles.panel}><div className={styles.panelHeading}><h2>通过邀请码加入</h2><span className={styles.muted}>邀请码只分享给想邀请的人</span></div><form className={styles.panelBody} onSubmit={(event) => { event.preventDefault(); void join(); }}><div className={styles.inlineForm} style={{ marginTop: 0 }}><input className={styles.input} aria-label="房间邀请码" value={code} onChange={(event) => setCode(event.target.value)} maxLength={20} autoCapitalize="characters" placeholder="输入房主提供的邀请码" /><button className={styles.quietButton} type="submit" disabled={busy || !code.trim()}>加入房间</button></div></form></section>
      <section className={styles.panel}><div className={styles.panelHeading}><h2>公开房间</h2><label className={styles.field}>筛选游戏<select aria-label="筛选房间游戏" value={filter ?? ''} onChange={(event) => setSearch(event.target.value ? { game: event.target.value } : {})}><option value="">全部游戏</option>{Object.entries(GAME_NAMES).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label></div>{listError ? <p className={styles.error} role="alert">{listError}（稍后自动重试）</p> : null}{!page && !listError ? <p className={styles.empty} role="status">正在读取房间列表…</p> : null}{page?.items.length === 0 ? <p className={styles.empty}>暂时没有公开房间。建一个房间，邀请同事来玩。</p> : null}<div className={styles.roomList}>{page?.items.map((room) => <article key={room.id} className={styles.roomRow}><div><strong>{room.title}</strong><small>{GAME_NAMES[room.gameKey]} · {room.host?.displayName ?? '房间成员'} 创建</small></div><span className={styles.muted}>{room.memberCount} / {room.maxPlayers} 人</span><span className={styles.muted}>{ROOM_STATUS[room.status]}</span><button className={styles.quietButton} type="button" disabled={busy || room.status !== 'waiting' || room.memberCount >= room.maxPlayers} onClick={() => { void join(room.id); }}>加入</button></article>)}</div></section></div>
    </>}
    {catalogError ? <p className={styles.error} role="alert">{catalogError} <button className={styles.quietButton} type="button" onClick={retry}>重试目录</button></p> : null}
    {catalog ? <p className={styles.info}>{catalog.rankingRules}<br />{catalog.rewardRules} · {catalog.settlementTime}</p> : null}
  </section>;
}
