import { useEffect, useState, type JSX } from 'react';
import { Link } from 'react-router-dom';
import type { CommunityMembershipView, SupportTotals } from '@stealth-reader/shared';
import styles from './GrowthSummary.module.css';

export function membershipRemaining(expiresAt: string | null, now: number): string {
  if (!expiresAt) return '未获赠';
  const minutes = Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 60_000));
  if (!Number.isFinite(minutes) || minutes === 0) return '已到期';
  const days = Math.floor(minutes / 1440), hours = Math.floor(minutes % 1440 / 60);
  return `${days > 0 ? `${days} 天 ` : ''}${hours} 小时 ${minutes % 60} 分钟`;
}
export function beijingMembershipDate(value: string): string {
  if (!Number.isFinite(Date.parse(value))) return '时间记录待确认';
  return new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}
export function CommunityVipSummary({ vip, serverNow, giftDays, support, compact = false }: { vip: CommunityMembershipView; serverNow: string; giftDays: number; support?: SupportTotals; compact?: boolean }): JSX.Element {
  const [clock, setClock] = useState({ server: serverNow, elapsed: 0 });
  useEffect(() => {
    const began = performance.now(); setClock({ server: serverNow, elapsed: 0 });
    const timer = setInterval(() => setClock({ server: serverNow, elapsed: performance.now() - began }), 30_000);
    return () => clearInterval(timer);
  }, [serverNow]);
  const now = Date.parse(serverNow) + (clock.server === serverNow ? clock.elapsed : 0);
  const expiry = vip.expiresAt ? Date.parse(vip.expiresAt) : NaN;
  const start = vip.startsAt ? Date.parse(vip.startsAt) : NaN;
  const unknown = !Number.isFinite(now) || Boolean(vip.expiresAt && !Number.isFinite(expiry)) || Boolean(vip.startsAt && !Number.isFinite(start)) || Boolean(vip.active && !vip.expiresAt);
  const expired = Number.isFinite(expiry) && expiry <= now;
  const future = Number.isFinite(start) && start > now;
  const active = !unknown && !expired && !future && vip.active;
  const state = unknown ? 'unknown' : expired ? 'expired' : future ? 'future' : active ? 'active' : vip.expiresAt ? 'inactive' : 'none';
  const label = unknown ? '权益状态待确认' : expired ? '权益已到期' : future ? '等待生效' : active ? vip.source === 'afdian_support' ? '支持权益有效' : vip.source === 'launch_gift' ? '赠送有效期内' : '权益有效' : vip.expiresAt ? '当前未生效' : '当前未开通';
  const remaining = unknown ? '待同步' : !vip.expiresAt ? '未开通' : expired ? '已到期' : membershipRemaining(vip.expiresAt, now);
  return <section className={`${styles.card} ${styles.membershipCard} ${compact ? styles.compactMembership : ''}`} aria-label="期权持有者权益">
    <div className={styles.heading}><div><span className={styles.eyebrow}>普通成员权益 / HOLDER</span><h2>期权持有者</h2></div><span className={styles.membershipStatus} data-state={state}>{label}</span></div>
    <div className={styles.membershipOverview}><div><span className={styles.metricLabel}>{active ? '预计剩余时长' : future ? '距记录截止时间 · 尚未生效' : '权益剩余时长'}</span><strong className={styles.countdown}>{remaining}</strong>{vip.expiresAt ? <p className={styles.metadata}>截止 <time dateTime={vip.expiresAt}>{beijingMembershipDate(vip.expiresAt)}</time>（北京时间）</p> : <p className={styles.metadata}>新注册账号不会自动获得赠送</p>}{future && vip.startsAt ? <p className={styles.metadata}>生效 <time dateTime={vip.startsAt}>{beijingMembershipDate(vip.startsAt)}</time>（北京时间）</p> : null}</div><div className={styles.benefitNote}><span aria-hidden="true">◇</span><div><strong>九层妖塔 · 托管探索</strong><p>仍消耗正常体力并沿用日常上限，不增加战力或管理权限。</p></div></div></div>
    {!compact ? <section className={styles.supportTotals} aria-label="已核验累计支持"><div className={styles.subheading}><h3>已核验的累计支持</h3><span>赠送、作废不计入</span></div>{support ? <dl className={styles.supportMetrics}><div><dt>有效支持金额</dt><dd>¥{(support.amountFen / 100).toFixed(2)}</dd></div><div><dt>登记月数</dt><dd>{support.months}<small>个月</small></dd></div><div><dt>登记笔数</dt><dd>{support.orders}<small>笔</small></dd></div></dl> : <p className={styles.metadata} role="status">支持总量暂未同步，不推算历史金额。</p>}</section> : null}
    <details className={styles.rules}><summary>权益、赠送与支持说明</summary><p>原 VIP 更名为「期权持有者」，已有赠送期限保持不变。本轮最初上线时已有的正常账号，一次性赠送 {giftDays} × 24 小时；新注册账号不自动获赠，不随登录续期。</p><p>权益：九层妖塔服务器托管探索。仍消耗正常体力，沿用日常奖励上限，不增加伤害、掉落、摸鱼指数或管理员权限。</p><p>后续通过爱发电月度支持，由管理员核验订单后登记授予；每个登记月为固定 30 天，接续现有期限。本站没有支付或自动续费入口，未核验不会自动到账。请先确认支持方案与账号对应关系，再进行支持。</p><p>「期权持有者」是本站趣味身份名，不代表真实股权、证券、分红或投资权益。累计支持金额与月数仅用于本站支持记录，自己与管理员可见。</p><div className={styles.actions}><a href="https://afdian.com/a/zbrshyyzxx" target="_blank" rel="noopener noreferrer">爱发电主页 ↗</a><Link to="/games/demon-tower">前往九层妖塔</Link></div></details>
    {compact ? <Link className={styles.textLink} to="/achievements">查看成就、称号和权益说明 →</Link> : null}
  </section>;
}
