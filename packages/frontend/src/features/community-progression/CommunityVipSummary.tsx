import { useEffect, useState, type JSX } from 'react';
import { Link } from 'react-router-dom';
import type { CommunityMembershipView, SupportTotals } from '@stealth-reader/shared';
import styles from './Progression.module.css';

export function membershipRemaining(expiresAt: string | null, now: number): string {
  if (!expiresAt) return '未获赠';
  const minutes = Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 60_000));
  if (!Number.isFinite(minutes) || minutes === 0) return '已到期';
  const days = Math.floor(minutes / 1440); const hours = Math.floor(minutes % 1440 / 60);
  return `${days > 0 ? `${days} 天 ` : ''}${hours} 小时 ${minutes % 60} 分钟`;
}
export function CommunityVipSummary({ vip, serverNow, giftDays, support, compact = false }: { vip: CommunityMembershipView; serverNow: string; giftDays: number; support?: SupportTotals; compact?: boolean }): JSX.Element {
  const [clock, setClock] = useState({ server: serverNow, elapsed: 0 });
  useEffect(() => {
    const began = performance.now(); setClock({ server: serverNow, elapsed: 0 });
    const timer = setInterval(() => setClock({ server: serverNow, elapsed: performance.now() - began }), 30_000);
    return () => clearInterval(timer);
  }, [serverNow]);
  const now = Date.parse(serverNow) + (clock.server === serverNow ? clock.elapsed : 0);
  const remaining = membershipRemaining(vip.expiresAt, now);
  const expiryReached = vip.expiresAt !== null && Date.parse(vip.expiresAt) <= now;
  return <section className={compact ? styles.summary : styles.card} aria-label="期权持有者权益">
    <div className={styles.status}><h2>期权持有者</h2><span>{expiryReached ? '权益已到期' : vip.active ? vip.source === 'afdian_support' ? '支持权益有效' : '赠送有效期内' : vip.expiresAt ? '当前未生效' : '当前未开通'}</span></div>
    <div className={styles.vipGrid}><div><p className={styles.muted}>{vip.active ? '预计剩余时长' : '距记录截止时间'}</p><strong className={styles.countdown}>{vip.expiresAt ? remaining : '未开通'}</strong>{vip.expiresAt ? <p>截止 {new Date(vip.expiresAt).toLocaleString('zh-CN', { hour12: false })}</p> : null}
      {support ? <p>累计有效支持 ¥{(support.amountFen / 100).toFixed(2)} · {support.months} 个月 · {support.orders} 笔</p> : null}</div>
      <div><p>原 VIP 更名为「期权持有者」，已有赠送期限保持不变。本轮最初上线时已有的正常账号，一次性赠送 {giftDays} × 24 小时；新注册账号不自动获赠，不随登录续期。</p>
        {!compact ? <><p>权益：九层妖塔服务器托管探索。仍消耗正常体力，沿用日常奖励上限，不增加伤害、掉落、摸鱼指数或管理员权限。</p>
          <p>后续通过爱发电月度支持，由管理员核验订单后登记授予；每个登记月为固定 30 天，接续现有期限。本站没有支付或自动续费入口，未核验不会自动到账。请先确认支持方案与账号对应关系，再进行支持。</p>
          <p>「期权持有者」是本站趣味身份名，不代表真实股权、证券、分红或投资权益。累计支持金额与月数仅用于本站支持记录，自己与管理员可见。</p>
          <div className={styles.actions}><a href="https://afdian.com/a/zbrshyyzxx" target="_blank" rel="noopener noreferrer">爱发电主页 ↗</a><Link to="/games/demon-tower">前往九层妖塔</Link></div></> : <Link to="/achievements">查看成就、称号和权益说明</Link>}
      </div></div></section>;
}
