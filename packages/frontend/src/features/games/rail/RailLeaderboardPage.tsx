import { useEffect, useState, type JSX } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { RailLeaderboard, RailPersonalStats } from '@stealth-reader/shared';

import { getCommunitySessionGeneration } from '../../../api/community-http';
import { communityRailApi, railErrorMessage } from '../../../api/community-rail';
import { useCommunityAuthStore } from '../../../app/store/community-auth-store';
import styles from './Rail.module.css';

export function RailLeaderboardPage(): JSX.Element {
  const userId = useCommunityAuthStore((auth) => auth.phase === 'active' ? auth.user?.publicId ?? null : null);
  const generation = getCommunitySessionGeneration();
  const [search, setSearch] = useSearchParams();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(search.get('date') ?? '') ? search.get('date')! : undefined;
  const key = `${generation}:${userId}:${date}`;
  const [snapshot, setSnapshot] = useState<{ key: string; board: RailLeaderboard; stats: RailPersonalStats } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    setSnapshot(null); setError(null);
    if (!userId) return undefined;
    let active = true; const controller = new AbortController();
    void Promise.all([communityRailApi.leaderboard(date, controller.signal), communityRailApi.stats(controller.signal)]).then(([board, stats]) => {
      if (active && generation === getCommunitySessionGeneration() && useCommunityAuthStore.getState().user?.publicId === userId) setSnapshot({ key, board, stats });
    }).catch((reason: unknown) => { if (active && !controller.signal.aborted) setError(railErrorMessage(reason)); });
    return () => { active = false; controller.abort(); };
  }, [key, generation, userId, date, retry]);
  const data = snapshot?.key === key ? snapshot : null;
  const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  return <section className={styles.page} aria-label="轨道难题排行榜"><div className={styles.toolbar}><Link to="/games/rail">← 轨道大厅</Link><Link to="/leaderboards">排行榜专区 →</Link></div><div className={styles.heading}><div><span className={styles.eyebrow}>SURVIVAL RECORDS</span><h1>轨道难题 · 生存日榜</h1><p>按有效真人赛局的生存表现排名。趣味恶魔评分单独展示，不影响办公币。</p></div><label className={styles.field}>榜单日期（北京时间）<input type="date" aria-label="轨道榜单日期" value={date ?? data?.board.date ?? today} max={today} onChange={(event) => { if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)) setSearch({ date: event.target.value }); }} /></label></div>
    {!userId ? <p className={styles.notice}><Link to="/login">登录账号</Link>后查看榜单与自己的累计记录。</p> : <>
      {error ? <p className={styles.error} role="alert">{error} <button className={styles.button} type="button" onClick={() => setRetry((value) => value + 1)}>重新读取</button></p> : null}
      {!data && !error ? <p className={styles.empty} role="status">正在读取生存记录…</p> : null}
      {data ? <div className={styles.stack}><p className={styles.notice}>每日冠军奖励 {data.board.dailyChampionCoins} 办公币。{data.board.rules}</p><section className={styles.panel}><div className={styles.panelTitle}><h2>{data.board.date} · 生存记录</h2><span className={styles.muted}>服务器验证 · 练习不上榜</span></div>{data.board.items.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>排名 / 玩家</th><th>生存率</th><th>生存回合</th><th>恶魔评分</th></tr></thead><tbody>{data.board.items.map((entry) => <tr key={entry.publicId}><td><strong>{entry.rank}. {entry.displayName}</strong>{entry.publicId === userId ? <span className={styles.pill} style={{ marginLeft: 6 }}>我</span> : null}</td><td>{(entry.rateBasisPoints / 100).toFixed(1)}%</td><td>{entry.survived}/{entry.eligibleRounds}</td><td>{entry.demonTotal}<small className={styles.muted} style={{ display: 'block' }}>不发币</small></td></tr>)}</tbody></table></div> : <p className={styles.empty}>这一天还没有有效的真人完整赛局。和朋友建房，完成全部回合后再来看看。</p>}</section><p className={styles.notice} role="status">{data.board.award.status === 'awarded' ? `已结算：${data.board.award.winner?.displayName ?? '当日冠军'} 获得 ${data.board.award.coins} 办公币。` : data.board.award.status === 'no_eligible_score' ? '当日没有符合条件的成绩，不发放办公币。' : '次日北京时间 00:05 后由后台自动结算，无需手动领取。'}</p><section className={styles.panel}><div className={styles.panelTitle}><h2>我的累计记录</h2><span className={styles.muted}>以服务器统计口径为准</span></div><div className={styles.body}><div className={styles.formGrid}><p>完成赛局 <strong>{data.stats.completedGames}</strong><br /><span className={styles.muted}>其中计榜 {data.stats.rankedGames} 局</span></p><p>生存率 <strong>{(data.stats.rateBasisPoints / 100).toFixed(1)}%</strong><br /><span className={styles.muted}>{data.stats.survived} / {data.stats.eligibleRounds} 个非列车长回合</span></p><p>恶魔评分 <strong>{data.stats.demonTotal}</strong><br /><span className={styles.muted}>仅趣味记录，不发币</span></p><p>恶魔 MVP <strong>{data.stats.demonMvpCount}</strong> 次</p></div></div></section></div> : null}
    </>}
  </section>;
}
