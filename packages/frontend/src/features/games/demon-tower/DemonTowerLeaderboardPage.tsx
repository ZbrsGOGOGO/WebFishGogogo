import { useEffect, useState, type JSX } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { DemonTowerCatalog, DemonTowerLeaderboard } from '@stealth-reader/shared';

import { communityDemonTowerApi, demonTowerReadErrorMessage } from '../../../api/community-demon-tower';
import { useCommunityAuthStore } from '../../../app/store/community-auth-store';
import { TowerIcon } from './DemonTowerArt';
import { TowerContributionList } from './DemonTowerWorld';
import { TowerPanel, towerTime } from './TowerElements';
import { towerSessionKey, useTowerSessionKey } from './useTowerSession';
import styles from './DemonTower.module.css';

export function towerDateValid(value: string): boolean {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function DemonTowerLeaderboardPage(): JSX.Element {
  const ownerId = useCommunityAuthStore((state) => state.phase === 'active' ? state.user?.publicId ?? null : null);
  const sessionKey = useTowerSessionKey();
  const [search, setSearch] = useSearchParams();
  const date = search.get('date') ?? '';
  const validDate = towerDateValid(date);
  const [catalog, setCatalog] = useState<DemonTowerCatalog | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [draftDate, setDraftDate] = useState(validDate ? date : '');
  const [revision, setRevision] = useState(0);
  const [snapshot, setSnapshot] = useState<{ key: string; date: string; value: DemonTowerLeaderboard } | null>(null);
  const [boardError, setBoardError] = useState<{ key: string; date: string; value: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const board = snapshot?.key === sessionKey && snapshot.date === date ? snapshot.value : null;
  const error = [catalogError, boardError?.key === sessionKey && boardError.date === date ? boardError.value : null].filter(Boolean).join(' ');
  const reading = catalogLoading || loading;

  useEffect(() => { setDraftDate(validDate ? date : ''); }, [date, validDate]);
  useEffect(() => {
    let active = true; const controller = new AbortController();
    setCatalogLoading(true);
    const timeout = setTimeout(() => controller.abort(), 25_000);
    void communityDemonTowerApi.catalog(controller.signal).then((next) => {
      if (active) { setCatalog(next); setCatalogError(null); }
    }).catch((reason) => { if (active) setCatalogError(controller.signal.aborted ? '规则资料读取超时，请重新读取。' : `规则资料：${demonTowerReadErrorMessage(reason)}`); }).finally(() => { clearTimeout(timeout); if (active) setCatalogLoading(false); });
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [revision]);
  useEffect(() => {
    if (!catalog?.enabled || !validDate) { setLoading(false); return undefined; }
    let active = true; let timer: ReturnType<typeof setTimeout> | undefined; let controller: AbortController | undefined;
    const current = (): boolean => active && towerSessionKey() === sessionKey;
    const read = async (): Promise<void> => {
      controller = new AbortController(); setLoading(true);
      const timeout = setTimeout(() => controller?.abort(), 25_000);
      try { const next = await communityDemonTowerApi.leaderboard(date || undefined, controller.signal); if (current()) { setSnapshot({ key: sessionKey, date, value: next }); setBoardError(null); } }
      catch (reason) { if (current()) setBoardError({ key: sessionKey, date, value: controller.signal.aborted ? '榜单读取超时，请重新读取。' : `榜单：${demonTowerReadErrorMessage(reason)}` }); }
      finally { clearTimeout(timeout); if (current()) { setLoading(false); timer = setTimeout(() => { void read(); }, document.hidden ? 45_000 : 15_000); } }
    };
    void read(); return () => { active = false; controller?.abort(); if (timer) clearTimeout(timer); };
  }, [catalog?.enabled, date, validDate, revision, sessionKey]);
  const queryDate = (nextDate: string): void => {
    const next = new URLSearchParams(search);
    if (nextDate) next.set('date', nextDate); else next.delete('date');
    setSearch(next);
    if (date === nextDate) setRevision((value) => value + 1);
  };

  return <section className={styles.page} aria-label="九层妖塔首领讨伐日榜">
    <header className={styles.heading}><div><span className={styles.eyebrow}>COOPERATIVE RECORDS / DAILY</span><h1>九层妖塔 · 首领讨伐日榜</h1><p>按当日首领有效伤害排序；建设另记楼层贡献，不折算伤害，不参与本榜奖励。公开记录不包含角色背包或操作内容。</p></div><Link to="/games/demon-tower" className={styles.button}>返回妖塔</Link></header>
    {catalog?.enabled === false ? <p className={styles.notice}>九层妖塔尚未开放，首领讨伐日榜暂不可用。</p> : <>
      <TowerPanel title="按北京时间自然日记档" detail={<span className={styles.badge}>公开榜单</span>}>
        <form className={styles.buttonRow} onSubmit={(event) => { event.preventDefault(); if (!reading && towerDateValid(draftDate)) queryDate(draftDate); }}><label className={styles.field}>查询日期<input type="date" value={draftDate} onChange={(event) => setDraftDate(event.target.value)} /></label><button type="submit" className={styles.button} disabled={reading}>查询</button><button type="button" className={styles.textButton} disabled={reading} onClick={() => queryDate('')}>回到今日</button></form>
        {board ? <p className={styles.muted} style={{ marginTop: 13 }}>当前服务日 {board.serviceDate} · 最近同步 {towerTime(board.serverNow)}</p> : null}
      </TowerPanel>
      {!validDate ? <p className={styles.error} role="alert">日期格式不正确，请选择有效日期，或回到今日。</p> : null}
      {error ? <div className={styles.error} role="alert" style={{ marginTop: 18 }}>{error}<button type="button" className={styles.textButton} style={{ marginLeft: 12 }} onClick={() => setRevision((value) => value + 1)}>重新读取</button></div> : null}
      {!board && reading ? <p className={styles.loading} role="status">正在读取首领讨伐日榜…</p> : null}
      {board ? <div className={styles.stack} style={{ marginTop: 18 }}>
        <TowerPanel title={`${board.serviceDate} · 首领有效伤害`} detail={<span className={styles.muted}>前 50 位及我的名次</span>}><TowerContributionList entries={board.entries} ownerId={ownerId} daily me={board.me} /><p className={styles.muted} style={{ marginTop: 16 }}>{board.rewardDescription}</p></TowerPanel>
        <TowerPanel title="日榜奖励"><div className={styles.buttonRow}><TowerIcon name="coin" /><strong>冠军奖励标准 {catalog?.rules.dailyLeaderboardCoins ?? '待同步'} 办公币</strong><span className={styles.badge}>{board.award.status === 'awarded' ? '已结算' : board.award.status === 'no_eligible_player' ? '本日无有效获奖者' : '等待结算'}</span></div><p className={styles.muted} style={{ marginTop: 13 }}>本日奖励实际到账 {board.award.officeCoins} 办公币{board.award.status === 'pending' ? '，尚未结算，不代表奖励标准为零' : ''}。按有效首领伤害排名，奖励通过全站统一钱包发放；页面刷新不会触发重复发奖。</p><Link to="/leaderboards" className={styles.textButton}>查看全站办公币排行榜 →</Link></TowerPanel>
      </div> : null}
    </>}
  </section>;
}
