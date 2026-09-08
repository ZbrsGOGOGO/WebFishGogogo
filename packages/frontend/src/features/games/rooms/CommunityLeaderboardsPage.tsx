import { useEffect, useState, type JSX } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { PlayOfficeCoinLeaderboard } from '@stealth-reader/shared';

import { communityGameErrorMessage, communityGameRoomsApi } from '../../../api/community-game-rooms';
import { getCommunitySessionGeneration } from '../../../api/community-http';
import { useCommunityAuthStore } from '../../../app/store/community-auth-store';
import { usePlayCatalog } from './play-ui-state';
import styles from './GameRooms.module.css';

export function CommunityLeaderboardsPage(): JSX.Element {
  const { catalog, error: catalogError, retry: retryCatalog } = usePlayCatalog();
  const [search, setSearch] = useSearchParams();
  const tab = search.get('tab') === 'games' ? 'games' : 'coins';
  const userId = useCommunityAuthStore((state) => state.phase === 'active' ? state.user?.publicId ?? null : null);
  const generation = getCommunitySessionGeneration();
  const context = `${userId}:${generation}`;
  const [snapshot, setSnapshot] = useState<{ key: string; data: PlayOfficeCoinLeaderboard } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!userId || tab !== 'coins') return undefined;
    let active = true; const controller = new AbortController(); setLoading(true); setError(null);
    void communityGameRoomsApi.officeCoinsLeaderboard(controller.signal).then((data) => { if (active && generation === getCommunitySessionGeneration()) setSnapshot({ key: context, data }); }).catch((reason: unknown) => { if (active && !controller.signal.aborted) setError(communityGameErrorMessage(reason)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [context, generation, revision, tab, userId]);
  const data = snapshot?.key === context ? snapshot.data : null;
  if (!userId) return <p className={styles.info}><Link to="/login">登录账号</Link>后查看排行榜专区。</p>;
  return <section className={styles.siteLeaderboardPage} aria-label="排行榜专区">
    <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>COMMUNITY RECORDS</span><h1>排行榜专区</h1><p>查看办公币积累，也可以挑战每日游戏冠军。资产榜与游戏榜分开，规则和奖励一目了然。</p></div><Link className={styles.quietButton} to="/games">进入小游戏专区 →</Link></div>
    <div className={styles.tabs} role="tablist" aria-label="排行榜分类"><button type="button" role="tab" aria-selected={tab === 'coins'} onClick={() => setSearch({ tab: 'coins' })}>办公币余额榜</button><button type="button" role="tab" aria-selected={tab === 'games'} onClick={() => setSearch({ tab: 'games' })}>小游戏每日榜</button></div>
    {tab === 'coins' ? <div role="tabpanel" aria-label="办公币余额榜">
      <div className={styles.toolbar}><p className={styles.muted}>按当前办公币余额排列，展示前 50 名有效活跃账号。余额榜只展示积累，不额外发奖。</p><button className={styles.quietButton} type="button" disabled={loading} onClick={() => setRevision((value) => value + 1)}>{loading ? '正在更新…' : '刷新余额榜'}</button></div>
      {error ? <p className={styles.error} role="alert">{error}{data ? ' 下方保留上一次数据，请刷新后确认。' : ''}</p> : null}
      {!data && loading ? <p className={styles.empty} role="status">正在读取办公币余额榜…</p> : null}
      {data ? <>
        <div className={styles.info}>{data.me ? <>我的排名：第 {data.me.rank} 名 · 当前办公币 <strong>{data.me.balance.toLocaleString('zh-CN')}</strong> · <Link to="/farm">查看农场收益</Link></> : '当前账号暂未进入有效排名范围。'}</div>
        <section className={styles.panel}><div className={styles.panelHeading}><h2>办公币余额</h2><span className={styles.muted}>当前余额 · 非累计收入</span></div>{data.items.length === 0 ? <p className={styles.empty}>暂无可展示的办公币排名。</p> : <ol className={styles.leaderboard}>{data.items.map((item) => <li key={item.publicId}><span>{item.rank}</span><strong>{item.displayName}{item.publicId === userId ? '（我）' : ''}</strong><span>{item.balance.toLocaleString('zh-CN')} 办公币</span></li>)}</ol>}</section>
        <p className={styles.muted}>{data.rules}<br />更新时间：{new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(data.updatedAt))}（北京时间）</p>
      </> : null}
    </div> : <div role="tabpanel" aria-label="小游戏每日榜">
      {catalogError ? <p className={styles.error} role="alert">{catalogError} <button className={styles.quietButton} type="button" onClick={retryCatalog}>重试游戏目录</button></p> : null}
      {!catalog && !catalogError ? <p role="status" className={styles.empty}>正在读取游戏榜单…</p> : null}
      {catalog ? <><div className={styles.panel}><div className={styles.panelHeading}><h2>六款游戏 · 各自独立日榜</h2><span className={styles.muted}>单机 / 玩家建房共享</span></div><div className={styles.gameList}>{catalog.games.map((game, index) => <article key={game.gameKey} className={styles.gameRow}><span className={styles.gameNumber}>{String(index + 1).padStart(2, '0')}</span><div><h3>{game.name}</h3><p>每日冠军 {game.dailyChampionCoins} 办公币 · 同款单机与玩家房间成绩共享</p></div><Link className={styles.quietButton} to={`/games/leaderboards/${game.gameKey}`}>查看{game.name}日榜 →</Link></article>)}</div></div><p className={styles.info}>{catalog.rankingRules}<br />{catalog.rewardRules}<br />{catalog.settlementTime}</p></> : null}
    </div>}
  </section>;
}
