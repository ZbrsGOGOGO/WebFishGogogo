import { useEffect, useState, type FormEvent, type JSX } from 'react';
import type { SupportAdminView, SupportGrantInput } from '@stealth-reader/shared';
import { communityProgressionApi, progressionErrorMessage, progressionUncertain } from '../../api/community-progression';
import styles from './Progression.module.css';

/** Rendered only for admins; API independently checks live DB role for every read/write. */
export function SupportAdminPanel({ writesEnabled }: { writesEnabled: boolean }): JSX.Element {
  const [view, setView] = useState<SupportAdminView | null>(null), [offset, setOffset] = useState(0);
  const [username, setUsername] = useState(''), [reference, setReference] = useState(''), [amount, setAmount] = useState(''), [months, setMonths] = useState('1');
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [pending, setPending] = useState<SupportGrantInput | null>(null), [refreshKey, refresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setView(null);
    void communityProgressionApi.supportAdmin(offset, controller.signal).then(result => { if (!controller.signal.aborted) setView(result); }).catch(error => { if (!controller.signal.aborted) setMessage(progressionErrorMessage(error)); });
    return () => controller.abort();
  }, [offset, refreshKey]);
  const grant = async (input: SupportGrantInput): Promise<void> => {
    setBusy(true); setMessage(''); setPending(input);
    try {
      const result = await communityProgressionApi.supportGrant(input);
      setPending(null); setReference(''); setConfirmed(false); setMessage(result.replayed ? '已确认：原登记成功，未重复发放。' : '已登记并授予期权持有者期限。'); setOffset(0); refresh(value => value + 1);
    } catch (error) { if (!progressionUncertain(error)) setPending(null); setMessage(progressionErrorMessage(error, true)); }
    finally { setBusy(false); }
  };
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (!/^\d+(?:\.\d{1,2})?$/.test(amount)) { setMessage('金额须为人民币元，最多两位小数。'); return; }
    const amountFen = Math.round(Number(amount) * 100), monthCount = Number(months);
    if (!Number.isSafeInteger(amountFen) || amountFen < 1 || amountFen > 100_000_000 || !Number.isInteger(monthCount) || monthCount < 1 || monthCount > 12 || !confirmed) { setMessage('请核对金额、1–12 个月的期限，并勾选核验确认。'); return; }
    void grant({ requestId: crypto.randomUUID(), username: username.trim(), orderReference: reference.trim(), amountFen, months: monthCount, confirmed: true });
  };
  const revoke = async (id: string): Promise<void> => {
    if (!window.confirm('确认作废这笔登记？对应期限将失效，保留作废审计。不处理站外退款，不移动其他登记的起止时间。')) return;
    setBusy(true);
    try { await communityProgressionApi.supportRevoke(id); setMessage('已作废该登记；如存在后续登记，请检查生效日期之间是否有空档。'); refresh(value => value + 1); }
    catch (error) { setMessage(progressionErrorMessage(error, true)); }
    finally { setBusy(false); }
  };
  return <section className={styles.card} aria-label="支持管理后台"><h2>支持管理后台</h2><p>仅站点管理员可见。登记已核验的真实爱发电订单，不发办公币，不改变角色权限；本站不自动向爱发电查询或扣款。金额按人民币记录，不能混入其他币种。原赠送不计入支持总量。</p>
    <button className={styles.button} type="button" disabled={busy} onClick={() => refresh(value => value + 1)}>刷新支持记录</button>
    {message ? <p className={styles.notice} role="status">{message}</p> : null}
    {view ? <><p>有效累计：¥{(view.totals.amountFen / 100).toFixed(2)} · {view.totals.months} 个月 · {view.totals.orders} 笔；当前支持期限生效 {view.activeHolders} 人（不含仅赠送和待生效）。</p><p className={styles.muted}>原始累计（含作废）：¥{(view.grossTotals.amountFen / 100).toFixed(2)} · {view.grossTotals.months} 个月 · {view.grossTotals.orders} 笔</p></> : <p>正在读取支持台账…</p>}
    <form onSubmit={submit}><fieldset disabled={busy || Boolean(pending) || !writesEnabled} className={styles.supportForm}><legend>核验后授予</legend>
      <label>用户登录账号<input required value={username} maxLength={32} onChange={e => setUsername(e.target.value)} autoComplete="off" /></label>
      <label>爱发电订单号<input required value={reference} minLength={6} maxLength={80} pattern="[A-Za-z0-9_-]+" onChange={e => setReference(e.target.value)} autoComplete="off" /></label>
      <label>实际支持金额（人民币元）<input required inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></label>
      <label>授予月数（每月 30 天）<input required type="number" min={1} max={12} step={1} value={months} onChange={e => setMonths(e.target.value)} /></label>
      <label className={styles.confirmSupport}><input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />我已在爱发电核验付款、账号归属与月数，确认授予</label><button className={styles.button} type="submit">登记并授予</button>
    </fieldset></form>
    {pending ? <p>上次登记结果尚待确认；输入已锁定，重试不会重复发放。<button className={styles.button} type="button" disabled={busy || !writesEnabled} onClick={() => { void grant(pending); }}>确认上次登记</button></p> : null}
    <div className={styles.supportHistory}>{view?.entries.map(row => <article key={row.id}><div className={styles.status}><strong>{row.displayName ?? '已匿名化用户'}{row.username ? `（${row.username}）` : ''}</strong><span>{row.revokedAt ? '已作废' : '已登记'}</span></div><p>¥{(row.amountFen / 100).toFixed(2)} · {row.months} 个月 · 订单尾号 {row.orderHint ?? '已清除'}</p><p>生效 {new Date(row.startsAt).toLocaleString('zh-CN')} → 截止 {new Date(row.expiresAt).toLocaleString('zh-CN')}</p><small>登记 {new Date(row.createdAt).toLocaleString('zh-CN')} · 凭据 {row.id}</small>{!row.revokedAt ? <div><button className={styles.button} type="button" disabled={busy || Boolean(pending) || !writesEnabled} onClick={() => { void revoke(row.id); }}>作废这笔登记</button></div> : null}</article>)}</div>
    {view?.entries.length === 0 ? <p>还没有支持登记，不会把赠送或历史未知金额算作支持。</p> : null}
    <div className={styles.actions}><button className={styles.button} disabled={offset === 0 || busy || Boolean(pending)} onClick={() => setOffset(value => Math.max(0, value - 50))}>上一页</button><span>第 {offset / 50 + 1} 页</span><button className={styles.button} disabled={!view?.hasMore || busy || Boolean(pending)} onClick={() => setOffset(value => value + 50)}>下一页</button></div>
  </section>;
}
