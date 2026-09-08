import { useEffect, useState, type JSX } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { PlayLeaderboard } from '@stealth-reader/shared';

import { communityGameErrorMessage, communityGameRoomsApi } from '../../../api/community-game-rooms';
import { getCommunitySessionGeneration } from '../../../api/community-http';
import { useCommunityAuthStore } from '../../../app/store/community-auth-store';
import { GAME_NAMES, gameKeyFrom } from './play-ui-state';
import styles from './GameRooms.module.css';

export function CommunityGameLeaderboardPage(): JSX.Element {
  const { gameKey: rawGameKey } = useParams();
  const gameKey = gameKeyFrom(rawGameKey);
  const userId = useCommunityAuthStore((state) => state.phase === 'active' ? state.user?.publicId : null);
  const generation = getCommunitySessionGeneration();
  const [search, setSearch] = useSearchParams();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(search.get('date') ?? '') ? search.get('date')! : undefined;
  const context = `${gameKey}:${date}:${userId}:${generation}`;
  const [snapshot, setSnapshot] = useState<{ key: string; data: PlayLeaderboard } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    setSnapshot(null); setError(null);
    if (!gameKey || !userId) return undefined;
    let active = true; const controller = new AbortController();
    void communityGameRoomsApi.leaderboard(gameKey, date, controller.signal).then((data) => { if (active && generation === getCommunitySessionGeneration()) setSnapshot({ key: context, data }); }).catch((reason: unknown) => { if (active && !controller.signal.aborted) setError(communityGameErrorMessage(reason)); });
    return () => { active = false; controller.abort(); };
  }, [gameKey, date, userId, generation, context, revision]);
  if (!gameKey) return <p className={styles.info}>没有找到这个游戏的日榜。<Link to="/games">返回小游戏专区</Link></p>;
  if (!userId) return <p className={styles.info}><Link to="/login">登录账号</Link>后查看每日挑战排行榜。</p>;
  const data = snapshot?.key === context ? snapshot.data : null;
  const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  return <section aria-label="小游戏每日排行榜"><Link className={styles.textLink} to="/games">← 小游戏专区</Link><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>DAILY RECORDS</span><h1>{GAME_NAMES[gameKey]} · 每日榜</h1><p>单机挑战与玩家房间共享这款游戏的日榜；不同游戏分开排名，不混用积分。</p></div><label className={styles.field}>榜单日期（北京时间）<input aria-label="榜单日期" type="date" value={date ?? data?.date ?? today} max={today} onChange={(event) => { if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)) setSearch({ date: event.target.value }); }} /></label></div>
    <nav className={styles.tabs} aria-label="切换游戏日榜">{Object.entries(GAME_NAMES).map(([key, name]) => <Link key={key} to={`/games/leaderboards/${key}${date ? `?date=${date}` : ''}`} aria-current={key === gameKey ? 'page' : undefined}>{name}</Link>)}</nav>
    {error ? <p className={styles.error} role="alert">{error} <button className={styles.quietButton} type="button" onClick={() => setRevision((value) => value + 1)}>重新读取</button></p> : null}
    {!data && !error ? <p role="status" className={styles.empty}>正在读取每日榜…</p> : null}
    {data ? <><p className={styles.info}>本款每日冠军奖励 {data.dailyChampionCoins} 办公币。{data.rules}</p><section className={styles.panel}><div className={styles.panelHeading}><h2>{data.date} · 挑战积分</h2><span className={styles.muted}>同一玩家取当日最佳</span></div>{data.items.length === 0 ? <p className={styles.empty}>今天还没有有效成绩，完成一场挑战就有机会登榜。</p> : <ol className={styles.leaderboard}>{data.items.map((entry) => <li key={entry.publicId}><span>{entry.rank}</span><strong>{entry.displayName}<small>{entry.mode === 'solo' ? '单机挑战' : '玩家房间'} · {new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' }).format(new Date(entry.achievedAt))}</small></strong><span>{entry.score.toLocaleString('zh-CN')} 分</span></li>)}</ol>}</section><p className={styles.info} role="status">{data.award.status === 'awarded' ? `本榜已结算：${data.award.winner?.displayName ?? '当日冠军'} 获得 ${data.award.coins} 办公币，奖励已发至账号。` : data.award.status === 'no_eligible_score' ? '本榜没有可获奖的有效成绩，不发放办公币。' : '奖励待结算：次日北京时间 00:05 后由后台自动发放，无需手动领取。'}</p></> : null}
  </section>;
}
