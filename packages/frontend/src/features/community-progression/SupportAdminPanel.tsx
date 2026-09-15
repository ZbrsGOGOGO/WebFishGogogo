import { useEffect, useRef, useState, type FormEvent, type JSX } from 'react';
import type { SupportAdminView, SupportGrantInput } from '@stealth-reader/shared';
import { communityProgressionApi, progressionErrorMessage, progressionUncertain } from '../../api/community-progression';
import { beijingMembershipDate } from './CommunityVipSummary';
import styles from './GrowthSummary.module.css';

/** Parent controls visibility; the API independently checks live DB admin role. */
export function SupportAdminPanel({ writesEnabled }: { writesEnabled: boolean }): JSX.Element {
  const [view, setView] = useState<SupportAdminView | null>(null), [offset, setOffset] = useState(0);
  const [username, setUsername] = useState(''), [reference, setReference] = useState(''), [amount, setAmount] = useState(''), [months, setMonths] = useState('1');
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [pending, setPending] = useState<SupportGrantInput | null>(null), [pendingRevoke, setPendingRevoke] = useState<string | null>(null);
  const [refreshKey, refresh] = useState(0), [loading, setLoading] = useState(true), [readError, setReadError] = useState('');
  const operationInFlight = useRef(false);
  const locked = busy || Boolean(pending) || Boolean(pendingRevoke);
  useEffect(() => {
    const controller = new AbortController(); setView(null); setLoading(true); setReadError('');
    void communityProgressionApi.supportAdmin(offset, controller.signal).then(result => {
      if (!controller.signal.aborted) { setView(result); setLoading(false); }
    }).catch(error => {
      if (!controller.signal.aborted) { setReadError(progressionErrorMessage(error)); setLoading(false); }
    });
    return () => controller.abort();
  }, [offset, refreshKey]);
  const grant = async (input: SupportGrantInput): Promise<void> => {
    if (operationInFlight.current || pendingRevoke || !writesEnabled) return;
    operationInFlight.current = true; setBusy(true); setMessage(''); setPending(input);
    try {
      const result = await communityProgressionApi.supportGrant(input);
      setPending(null); setReference(''); setConfirmed(false);
      setMessage(result.replayed ? '已确认：原登记成功，未重复发放。' : '已登记并授予期权持有者期限。');
      setOffset(0); refresh(value => value + 1);
    } catch (error) { if (!progressionUncertain(error)) setPending(null); setMessage(progressionErrorMessage(error, true)); }
    finally { operationInFlight.current = false; setBusy(false); }
  };
  const submit = (event: FormEvent): void => {
    event.preventDefault(); if (locked || operationInFlight.current || !writesEnabled) return;
    if (!/^\d+(?:\.\d{1,2})?$/.test(amount)) { setMessage('金额须为人民币元，最多两位小数。'); return; }
    const amountFen = Math.round(Number(amount) * 100), monthCount = Number(months);
    if (!Number.isSafeInteger(amountFen) || amountFen < 1 || amountFen > 100_000_000 || !Number.isInteger(monthCount) || monthCount < 1 || monthCount > 12 || !confirmed) { setMessage('请核对金额、1–12 个月的期限，并勾选核验确认。'); return; }
    void grant({ requestId: crypto.randomUUID(), username: username.trim(), orderReference: reference.trim(), amountFen, months: monthCount, confirmed: true });
  };
  const revoke = async (id: string, confirmingPrevious = false): Promise<void> => {
    if (operationInFlight.current || pending || !writesEnabled || (pendingRevoke && pendingRevoke !== id)) return;
    if (!confirmingPrevious && !window.confirm('确认作废这笔登记？对应期限将失效，保留作废审计。不处理站外退款，不移动其他登记的起止时间。')) return;
    operationInFlight.current = true; setBusy(true); setMessage(''); setPendingRevoke(id);
    try {
      await communityProgressionApi.supportRevoke(id); setPendingRevoke(null);
      setMessage('已作废该登记；如存在后续登记，请检查生效日期之间是否有空档。'); refresh(value => value + 1);
    } catch (error) { if (!progressionUncertain(error)) setPendingRevoke(null); setMessage(progressionErrorMessage(error, true)); }
    finally { operationInFlight.current = false; setBusy(false); }
  };
  return <section className={`${styles.card} ${styles.adminCard}`} aria-label="支持管理后台">
    <div className={styles.heading}><div><span className={styles.eyebrow}>管理员 / SUPPORT LEDGER</span><h2>支持管理后台</h2><p>只登记已核验订单，不自动查询或扣款。</p></div><button className={styles.button} type="button" disabled={busy || loading} onClick={() => refresh(value => value + 1)}>{loading ? '同步台账中…' : '刷新支持记录'}</button></div>
    <div className={styles.adminBoundary}><span>人工核验</span><span>人民币账本</span><span>不发办公币</span><span>不改变角色权限</span></div>
    {message ? <p className={styles.notice} role="status">{message}</p> : null}
    {loading ? <div className={styles.statePanel} role="status"><strong>正在读取支持台账…</strong><p>不会用零金额或历史未知数替代实际登记。</p></div> : readError ? <div className={styles.error} role="alert"><strong>支持台账暂未同步</strong><p>{readError}</p><button className={styles.button} type="button" disabled={busy} onClick={() => refresh(value => value + 1)}>重新读取台账</button></div> : null}
    {view ? <><dl className={`${styles.supportMetrics} ${styles.adminMetrics}`} aria-label="有效支持累计"><div><dt>有效支持金额</dt><dd>¥{(view.totals.amountFen / 100).toFixed(2)}</dd></div><div><dt>有效登记月数</dt><dd>{view.totals.months}<small>个月</small></dd></div><div><dt>有效登记笔数</dt><dd>{view.totals.orders}<small>笔</small></dd></div><div><dt>当前支持生效</dt><dd>{view.activeHolders}<small>人</small></dd></div></dl><p className={styles.metadata}>有效累计不含作废；当前生效人数不含仅赠送和待生效。</p></> : null}
    {!writesEnabled ? <p className={styles.notice} role="status">当前维护只读，可查看台账，不能授予或作废。</p> : null}
    <form onSubmit={submit} aria-label="核验后授予表单"><fieldset disabled={locked || !writesEnabled} className={styles.supportForm}><legend>核验后授予</legend>
      <label>用户登录账号<input required value={username} maxLength={32} onChange={event => setUsername(event.target.value)} autoComplete="off" /></label>
      <label>爱发电订单号<input required value={reference} minLength={6} maxLength={80} pattern="[A-Za-z0-9_-]+" onChange={event => setReference(event.target.value)} autoComplete="off" /></label>
      <label>实际支持金额（人民币元）<input required inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} /></label>
      <label>授予月数（每月 30 天）<input required type="number" min={1} max={12} step={1} value={months} onChange={event => setMonths(event.target.value)} /></label>
      <label className={styles.confirmSupport}><input type="checkbox" required checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />我已在爱发电核验付款、账号归属与月数，确认授予</label><button className={`${styles.button} ${styles.primaryButton}`} type="submit">{busy && pending ? '登记处理中…' : '登记并授予'}</button>
    </fieldset></form>
    {pending ? <div className={styles.pendingNotice} role="status"><strong>上次登记结果尚待确认</strong><p>输入已锁定，重试使用原操作编号，不会重复发放。</p><button className={styles.button} type="button" disabled={busy || !writesEnabled} onClick={() => { void grant(pending); }}>确认上次登记</button></div> : null}
    {pendingRevoke ? <div className={styles.pendingNotice} role="status"><strong>上次作废结果尚待确认</strong><p>其他写入和翻页已锁定，仅确认原登记的作废结果。</p><button className={styles.button} type="button" disabled={busy || !writesEnabled} onClick={() => { void revoke(pendingRevoke, true); }}>确认上次作废</button></div> : null}
    {view ? <section className={styles.supportHistory} aria-label="支持登记记录"><div className={styles.subheading}><h3>登记记录</h3><span>第 {offset / 50 + 1} 页 · 北京时间</span></div>{view.entries.map(row => <article key={row.id} data-revoked={Boolean(row.revokedAt)}><div className={styles.entryHeader}><div><strong>{row.displayName ?? '已匿名化用户'}</strong>{row.username ? <span>登录账号 · {row.username}</span> : null}</div><span className={styles.entryStatus}>{row.revokedAt ? '已作废' : '已登记'}</span></div><div className={styles.entryAmount}><strong>¥{(row.amountFen / 100).toFixed(2)}</strong><span>{row.months} 个月 · 订单尾号 {row.orderHint ?? '已清除'}</span></div><p className={styles.entryDates}>生效 {beijingMembershipDate(row.startsAt)}<br />截止 {beijingMembershipDate(row.expiresAt)}（北京时间）</p><details className={styles.entryDetails}><summary>登记审计信息</summary><p>登记 {beijingMembershipDate(row.createdAt)}（北京时间）</p><p>凭据 {row.id}</p>{row.revokedAt ? <p>作废 {beijingMembershipDate(row.revokedAt)}（北京时间）</p> : null}</details>{!row.revokedAt ? <button className={`${styles.button} ${styles.revokeButton}`} type="button" disabled={locked || !writesEnabled} onClick={() => { void revoke(row.id); }}>作废这笔登记</button> : null}</article>)}{view.entries.length === 0 ? <div className={styles.statePanel}><strong>还没有支持登记</strong><p>不会把赠送或历史未知金额算作支持。</p></div> : null}<div className={styles.actions}><button className={styles.button} type="button" disabled={offset === 0 || locked || loading} onClick={() => setOffset(value => Math.max(0, value - 50))}>上一页</button><span className={styles.metadata}>第 {offset / 50 + 1} 页</span><button className={styles.button} type="button" disabled={!view.hasMore || locked || loading} onClick={() => setOffset(value => value + 50)}>下一页</button></div></section> : null}
    <details className={styles.rules}><summary>台账口径与授予边界</summary><p>仅站点管理员可见。登记已核验的真实爱发电订单，不发办公币，不改变角色权限；本站不自动向爱发电查询或扣款。金额按人民币记录，不能混入其他币种。原赠送不计入支持总量。</p>{view ? <p>原始累计（含作废）：¥{(view.grossTotals.amountFen / 100).toFixed(2)} · {view.grossTotals.months} 个月 · {view.grossTotals.orders} 笔</p> : null}<p>作废只处理本站期限并保留审计，不执行站外退款，也不移动其他登记的起止时间。</p></details>
  </section>;
}
