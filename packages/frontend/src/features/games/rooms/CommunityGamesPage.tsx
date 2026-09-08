import { useEffect, useRef, useState, type JSX } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ArcadeGameKey, PlayCreateInput } from '@stealth-reader/shared';

import { communityGameErrorMessage, communityGameRoomsApi, createPlayRequestId } from '../../../api/community-game-rooms';
import { getCommunitySessionGeneration } from '../../../api/community-http';
import { useCommunityAuthStore } from '../../../app/store/community-auth-store';
import { PRACTICE_PATHS, usePlayCatalog } from './play-ui-state';
import styles from './GameRooms.module.css';

export function CommunityGamesPage(): JSX.Element {
  const { catalog, error: catalogError, retry } = usePlayCatalog();
  const active = useCommunityAuthStore((state) => state.phase === 'active');
  const userId = useCommunityAuthStore((state) => state.user?.publicId);
  const navigate = useNavigate();
  const [starting, setStarting] = useState<ArcadeGameKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const createRequest = useRef<PlayCreateInput | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { createRequest.current = null; setError(null); setStarting(null); }, [userId]);
  const start = async (gameKey: ArcadeGameKey): Promise<void> => {
    if (!active) { navigate('/login'); return; }
    if (starting) return;
    const generation = getCommunitySessionGeneration();
    if (createRequest.current?.gameKey !== gameKey) createRequest.current = { clientRequestId: createPlayRequestId(), gameKey, mode: 'solo' };
    const request = createRequest.current;
    setStarting(gameKey); setError(null);
    try {
      const room = await communityGameRoomsApi.create(request);
      if (!mounted.current || generation !== getCommunitySessionGeneration() || useCommunityAuthStore.getState().user?.publicId !== userId) return;
      createRequest.current = null;
      navigate(`/games/rooms/${room.id}`);
    } catch (reason) {
      if (mounted.current && generation === getCommunitySessionGeneration() && useCommunityAuthStore.getState().user?.publicId === userId) setError(communityGameErrorMessage(reason));
    } finally { if (mounted.current && generation === getCommunitySessionGeneration()) setStarting(null); }
  };
  return <section aria-label="小游戏专区">
    <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>LIGHTWEIGHT WORKSPACE</span><h1>小游戏专区</h1><p>一个人随时练习，也可以邀请同事加入同一场挑战。收起画面不丢进度，线上房间仍正常计时。</p></div><span className={styles.muted}>默认静音</span></div>
    <nav className={styles.tabs} aria-label="小游戏模式"><Link to="/games" aria-current="page">单机挑战</Link><Link to="/games/rooms">玩家建房</Link></nav>
    <section className={styles.panel} aria-label="轨道难题派对协作"><div className={styles.panelHeading}><h2>轨道难题 · 新协作项目</h2><span className={styles.muted}>3–9 席 · 可观战</span></div><div className={styles.panelBody}><p className={styles.muted}>轮流担任列车长，出牌、加特性，再讨论两条轨道的取舍。可用人机补位练习，也可以设置密码邀请同事一起玩。</p><div className={styles.rowActions} style={{ justifyContent: 'flex-start' }}><Link className={styles.quietButton} to="/games/rail">练习 / 玩家建房 →</Link><Link className={styles.textLink} to="/games/rail/leaderboard">查看生存率日榜</Link></div><p className={styles.muted}>至少 3 位真人、无机器人且完整手动操作的建房对局才可参榜；每日冠军 100 办公币，恶魔值仅作趣味展示。</p></div></section>
    {error ? <div className={styles.error} role="alert">{error} <Link to="/games/rooms">查看进行中的房间</Link></div> : null}
    {catalogError ? <div className={styles.error} role="alert">{catalogError} <button type="button" className={styles.quietButton} onClick={retry}>重试目录</button></div> : null}
    {!catalog && !catalogError ? <p role="status" className={styles.empty}>正在读取小游戏目录…</p> : null}
    {catalog ? <>
      <div className={styles.panel}><div className={styles.panelHeading}><h2>单机挑战 · {catalog.games.length} 款</h2><span className={styles.muted}>账号赛局 · 服务端计分</span></div><div className={styles.gameList}>{catalog.games.map((game, index) => <article className={styles.gameRow} key={game.gameKey}><span className={styles.gameNumber}>{String(index + 1).padStart(2, '0')}</span><div><h3>{game.name}<span className={styles.modeBadge}>单机</span></h3><p>{game.soloDescription}</p></div><div className={styles.rowActions}><Link className={styles.textLink} to={`/games/leaderboards/${game.gameKey}`}>日榜</Link><button className={styles.quietButton} disabled={starting !== null} type="button" onClick={() => { void start(game.gameKey); }}>{starting === game.gameKey ? '正在建立…' : active ? '开始挑战' : '登录挑战'}</button></div></article>)}</div></div>
      <p className={styles.info}>{catalog.rankingRules}<br />{catalog.rewardRules} · {catalog.settlementTime}</p>
      <section className={styles.panel} aria-label="经典本机练习"><div className={styles.panelHeading}><h2>经典本机练习</h2><span className={styles.muted}>无需登录 · 不参与办公币奖励日榜</span></div><div className={styles.panelBody}><p className={styles.muted}>{catalog.historyNotice}</p><div className={styles.rowActions} style={{ justifyContent: 'flex-start' }}>{catalog.games.filter((game) => PRACTICE_PATHS[game.gameKey]).map((game) => <Link className={styles.quietButton} key={game.gameKey} to={PRACTICE_PATHS[game.gameKey]!}>{game.gameKey === 'zhesi' ? '遮司 · 原命格录' : game.name}</Link>)}</div></div></section>
    </> : null}
  </section>;
}
