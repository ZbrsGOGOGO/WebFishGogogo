import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { communityHttp, getCommunitySessionGeneration } from '../../api/community-http';
import { refreshCommunityWallet, useCommunityWalletStore } from '../../app/store/community-wallet-store';
import { useCommunityAuthStore } from '../../app/store/community-auth-store';
import { WorkspaceShortcuts } from './WorkspaceShortcuts';
import styles from './Workspace.module.css';

interface DailyWallet { date: string; timeZone: string; income: string; spent: string; serverTime: string }
const amount = (value: string): string => /^\d{1,40}$/.test(value) ? BigInt(value).toLocaleString('zh-CN') : '待同步';
export function WorkspaceOverview({ owner }: { owner: string }) {
  const wallet = useCommunityWalletStore();
  const [daily, setDaily] = useState<DailyWallet | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true, pending = false;
    const generation = getCommunitySessionGeneration();
    const load = async (): Promise<void> => {
      if (pending || document.hidden || useCommunityAuthStore.getState().user?.publicId !== owner) return;
      pending = true; setBusy(true);
      void refreshCommunityWallet();
      try {
        const next = await communityHttp.get<DailyWallet>('/v1/farm/wallet-daily');
        if (live && generation === getCommunitySessionGeneration() && useCommunityAuthStore.getState().user?.publicId === owner) { setDaily(next); setError(''); }
      } catch { if (live) setError('今日流水暂未同步，请稍后重试。'); }
      finally { pending = false; if (live) setBusy(false); }
    };
    const refresh = (): void => { void load(); };
    refresh(); const timer = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh);
    return () => { live = false; window.clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [owner, revision]);
  const balance = wallet.ownerId === owner ? wallet.officeCoins : null;
  return <>
    <div className={styles.toolbar}><span>账户概览</span><button type="button" disabled={busy} onClick={() => setRevision(n => n + 1)}>{busy ? '同步中…' : '刷新概览'}</button><Link to="/desk-pet">工位搭子</Link><Link to="/tools">全部工具</Link><Link to="/games">休闲项目</Link></div>
    <div className={styles.overview}>
      <section className={styles.metric} aria-label="办公币余额"><h2>办公币余额</h2><strong>{balance === null ? '待同步' : balance.toLocaleString('zh-CN')}</strong><p>{wallet.status === 'stale' || wallet.status === 'error' ? '余额待重新同步，不代表最新值' : '账户实际余额，非成长积分'} · <Link to="/farm">工位绿植</Link></p></section>
      <section className={styles.metric} aria-label="今日入账"><h2>今日入账 · 办公币</h2><strong>{daily ? `+${amount(daily.income)}` : '待同步'}</strong><p>全部已入账正向流水，含奖励及初始赠送</p></section>
      <section className={styles.metric} aria-label="今日支出"><h2>今日支出 · 办公币</h2><strong>{daily ? amount(daily.spent) : '待同步'}</strong><p>已扣除的种子、升级及其他消费</p></section>
    </div>
    <p className={styles.note}>{daily ? `${daily.date} · 北京时间 00:00—24:00，按实际入账时间；不含未领取奖励。` : '按北京时间当天实际办公币流水汇总，不推算历史缺失记录。'}{error ? <span role="status"> {error} 已显示的数字可能过期。</span> : null}</p>
    <WorkspaceShortcuts key={owner} owner={owner} />
  </>;
}
