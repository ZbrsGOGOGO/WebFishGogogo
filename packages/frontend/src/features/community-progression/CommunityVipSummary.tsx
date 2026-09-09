import { useEffect, useState, type JSX } from 'react';
import { Link } from 'react-router-dom';
import type { CommunityMembershipView } from '@stealth-reader/shared';
import styles from './Progression.module.css';

export function membershipRemaining(expiresAt: string | null, now: number): string {
  if (!expiresAt) return '未获赠';
  const minutes = Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 60_000));
  if (!Number.isFinite(minutes) || minutes === 0) return '已到期';
  const days = Math.floor(minutes / 1440); const hours = Math.floor(minutes % 1440 / 60);
  return `${days > 0 ? `${days} 天 ` : ''}${hours} 小时 ${minutes % 60} 分钟`;
}
export function CommunityVipSummary({ vip, serverNow, giftDays, compact = false }: { vip: CommunityMembershipView; serverNow: string; giftDays: number; compact?: boolean }): JSX.Element {
  const [clock, setClock] = useState({ server: serverNow, elapsed: 0 });
  useEffect(() => {
    const began = performance.now(); setClock({ server: serverNow, elapsed: 0 });
    const timer = setInterval(() => setClock({ server: serverNow, elapsed: performance.now() - began }), 30_000);
    return () => clearInterval(timer);
  }, [serverNow]);
  const now = Date.parse(serverNow) + (clock.server === serverNow ? clock.elapsed : 0);
  const remaining = membershipRemaining(vip.expiresAt, now);
  const expiryReached = vip.expiresAt !== null && Date.parse(vip.expiresAt) <= now;
  return <section className={compact ? styles.summary : styles.card} aria-label="VIP 权益"><div className={styles.status}><h2>VIP 权益</h2><span>{expiryReached ? '权益已到期' : vip.active ? '赠送有效期内' : vip.expiresAt ? '当前未生效' : '当前未开通'}</span></div><div className={styles.vipGrid}><div><p className={styles.muted}>预计剩余时长</p><strong className={styles.countdown}>{remaining}</strong>{vip.expiresAt ? <p>截止 {new Date(vip.expiresAt).toLocaleString('zh-CN', { hour12: false })}</p> : null}</div><div><p>本轮上线时已有的正常账号，一次性赠送 {giftDays} × 24 小时；“一个月”指固定 {giftDays} 天，不随登录续期。新注册账号不自动获赠。</p>{!compact ? <><p>权益：九层妖塔服务器托管探索。仍消耗正常体力，沿用日常奖励上限，不增加伤害、掉落或管理员权限。</p><p>当前没有收费、购买或自动续费入口。截止和能否启动以服务器确认结果为准；到期后仍可手动探索。</p><Link to="/games/demon-tower">前往九层妖塔</Link></> : <Link to="/achievements">查看成就、称号和权益说明</Link>}</div></div></section>;
}
