import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { OfficeDrawing, OfficeHubOverview, OfficeStroke } from '@stealth-reader/shared';
import { officeHubApi, officeHubError } from '../../api/office-hub';
import { CommunityApiError, getCommunitySessionGeneration } from '../../api/community-http';
import styles from './OfficeHubPage.module.css';
import drawingStyles from './OfficeDrawingPanel.module.css';

type Command = (action: string, data?: Record<string, unknown>) => Promise<boolean>;
// PostgreSQL jsonb does not preserve object key order. Compare drawing meaning,
// not transport serialization, including the order of points within each stroke.
const fingerprint = (strokes: OfficeStroke[]): string => JSON.stringify(strokes.map(s => [s.color, s.width, s.points.map(p => [p.x, p.y])]));
const statusOf = (drawing: OfficeDrawing): NonNullable<OfficeDrawing['status']> => drawing.status ?? (drawing.strokes.length ? 'published' : 'draft');
async function boundedResult<T>(request: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([request, new Promise<T>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('服务器响应超时，结果尚未确认')), 8000); })]); }
    finally { clearTimeout(timer); }
}
export function OfficeDrawingImage({ strokes, label = '同事的画作' }: { strokes: OfficeStroke[]; label?: string }) {
    return <svg className={styles.drawing} viewBox="0 0 1000 1000" role="img" aria-label={label}>{strokes.map((s, i) => <polyline key={i} points={s.points.map(p => `${p.x},${p.y}`).join(' ')} stroke={s.color} strokeWidth={s.width} fill="none" strokeLinecap="round" strokeLinejoin="round" />)}</svg>;
}

/** Keeps a single immutable pending request until its outcome is known; never stores private words in browser storage. */
export function OfficeDrawingEditor({ drawing, serverTime, onSettled }: { drawing: OfficeDrawing; serverTime: string; onSettled: () => void }) {
    const [remote, setRemote] = useState(drawing), [strokes, setStrokes] = useState(drawing.strokes);
    const [color, setColor] = useState('#334155'), [clock, setClock] = useState(0);
    const [saving, setSaving] = useState(false), [error, setError] = useState(''), [conflict, setConflict] = useState(false);
    const remoteRef = useRef(drawing), local = useRef(drawing.strokes), saved = useRef(fingerprint(drawing.strokes));
    const anchor = useRef({ server: Date.parse(serverTime), mono: performance.now() });
    const generation = useRef(getCommunitySessionGeneration()), alive = useRef(true), active = useRef<number | null>(null);
    const locked = useRef(false), reading = useRef(false), conflicted = useRef(false), failure = useRef(false), lastAttempt = useRef(-Infinity);
    const notify = useRef(onSettled); notify.current = onSettled;
    const pending = useRef<{ id: string; action: 'drawing_save' | 'drawing_publish'; data: { postId: string; expectedRevision: number; strokes: OfficeStroke[] } } | null>(null);
    const ownSession = (): boolean => alive.current && generation.current === getCommunitySessionGeneration();
    const serverNow = (): number => anchor.current.server + performance.now() - anchor.current.mono;
    const updateLocal = (next: OfficeStroke[]): void => { local.current = next; setStrokes(next); };
    function receive(next: OfficeDrawing, time: string, responseToPending = false): void {
        if (!ownSession() || next.id !== drawing.id || (next.revision ?? 0) < (remoteRef.current.revision ?? 0)) return;
        anchor.current = { server: Math.max(serverNow(), Date.parse(time)), mono: performance.now() };
        const changed = (next.revision ?? 0) > (remoteRef.current.revision ?? 0);
        const incoming = fingerprint(next.strokes), dirty = fingerprint(local.current) !== saved.current;
        const matchesPending = pending.current && incoming === fingerprint(pending.current.data.strokes) && (next.revision ?? 0) === pending.current.data.expectedRevision + 1;
        const competingResponse = responseToPending && pending.current && !matchesPending;
        if (statusOf(next) === 'draft' && (competingResponse || changed && (dirty || pending.current) && !matchesPending)) {
            conflicted.current = true; setConflict(true);
            setError('另一页面更新了草稿。你的未保存笔画暂留本页，请先核对服务器草稿，不会自动覆盖。');
        } else if (!dirty && !pending.current) updateLocal(next.strokes);
        remoteRef.current = next; saved.current = incoming; setRemote(next);
        if (statusOf(next) !== 'draft') { active.current = null; pending.current = null; failure.current = false; }
        setClock(c => c + 1);
    }
    useEffect(() => { receive(drawing, serverTime); }, [drawing, serverTime]); // eslint-disable-line react-hooks/exhaustive-deps
    async function readResult(): Promise<void> {
        if (!ownSession() || reading.current) return;
        reading.current = true;
        try {
            const view = await boundedResult(officeHubApi.overview(undefined, 'drawing'));
            if (!ownSession()) return;
            const next = view.drawingWorkspace?.current;
            if (next?.id === drawing.id) {
                receive(next, view.serverTime);
                if (statusOf(next) !== 'draft') notify.current();
            }
        } catch { if (ownSession()) setError('暂时无法读取结算结果。服务器仍会处理已保存的草稿，恢复网络后请重试查询。'); }
        finally { reading.current = false; }
    }
    async function send(publish = false, retry = false): Promise<void> {
        if (!ownSession() || locked.current || conflicted.current || statusOf(remoteRef.current) !== 'draft') return;
        if (pending.current && !retry) return;
        if (!pending.current) {
            if (serverNow() >= Date.parse(remoteRef.current.deadlineAt!)) { void readResult(); return; }
            if (!publish && fingerprint(local.current) === saved.current) return;
            pending.current = { id: crypto.randomUUID(), action: publish ? 'drawing_publish' : 'drawing_save', data: { postId: drawing.id, expectedRevision: remoteRef.current.revision ?? 0, strokes: structuredClone(local.current) } };
        }
        const request = pending.current;
        locked.current = true; lastAttempt.current = performance.now(); setSaving(true); setError('');
        try {
            const view = await boundedResult(officeHubApi.action(request.action, request.data, request.id));
            if (!ownSession()) return;
            const next = view.drawingWorkspace?.current?.id === drawing.id ? view.drawingWorkspace.current : view.drawings.find(d => d.id === drawing.id);
            if (!next?.status) throw new Error('服务器没有返回可确认的草稿状态');
            receive(next, view.serverTime, true);
            pending.current = null; failure.current = conflicted.current;
            if (!conflicted.current) setError('');
            if (statusOf(next) !== 'draft') notify.current();
        } catch (e) {
            if (!ownSession()) return;
            failure.current = true;
            const code = e instanceof CommunityApiError ? (e.body as { code?: string } | null)?.code : null;
            if (code === 'OFFICE_DRAWING_VERSION_CONFLICT') { conflicted.current = true; setConflict(true); pending.current = null; }
            else if (e instanceof CommunityApiError && e.status >= 400 && e.status < 500 && e.status !== 401) pending.current = null;
            setError(`${officeHubError(e)}。未确认保存的笔画仍留在本页，到期只能提交服务器已保存部分。`);
        } finally { locked.current = false; if (ownSession()) setSaving(false); }
    }
    const sendRef = useRef(send), readRef = useRef(readResult); sendRef.current = send; readRef.current = readResult;
    useEffect(() => {
        alive.current = true;
        let lastRead = -Infinity;
        const tick = (): void => {
            if (!ownSession()) return;
            setClock(c => c + 1);
            if (statusOf(remoteRef.current) !== 'draft') return;
            if (serverNow() >= Date.parse(remoteRef.current.deadlineAt!)) {
                active.current = null;
                if (performance.now() - lastRead >= 2500) { lastRead = performance.now(); void readRef.current(); }
            } else if (!failure.current && performance.now() - lastAttempt.current >= 1800) void sendRef.current();
        };
        const timer = window.setInterval(tick, 250);
        const visible = (): void => { if (!document.hidden) { tick(); void readRef.current(); } else if (!failure.current && performance.now() - lastAttempt.current >= 800) void sendRef.current(); };
        const online = (): void => { if (pending.current) void sendRef.current(false, true); else { failure.current = false; tick(); void readRef.current(); } };
        const leave = (event: BeforeUnloadEvent): void => { if (ownSession() && statusOf(remoteRef.current) === 'draft' && (pending.current || fingerprint(local.current) !== saved.current)) { event.preventDefault(); event.returnValue = ''; } };
        document.addEventListener('visibilitychange', visible); window.addEventListener('online', online); window.addEventListener('beforeunload', leave);
        return () => { alive.current = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); window.removeEventListener('online', online); window.removeEventListener('beforeunload', leave); };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    void clock;
    const state = statusOf(remote), remaining = Math.max(0, Math.ceil((Date.parse(remote.deadlineAt!) - serverNow()) / 1000));
    const dirty = fingerprint(strokes) !== saved.current;
    const disabled = state !== 'draft' || remaining === 0 || conflict || failure.current || !ownSession();
    function point(e: PointerEvent<SVGSVGElement>) {
        const r = e.currentTarget.getBoundingClientRect();
        return { x: Math.max(0, Math.min(1000, Math.round((e.clientX - r.left) / Math.max(1, r.width) * 1000))), y: Math.max(0, Math.min(1000, Math.round((e.clientY - r.top) / Math.max(1, r.height) * 1000))) };
    }
    function loadSaved(): void {
        if (!ownSession()) return;
        pending.current = null; conflicted.current = false; failure.current = false; setConflict(false); setError('');
        updateLocal(remoteRef.current.strokes); void readResult();
    }
    return <section aria-label="我的绘画任务" className={drawingStyles.editor}>
        {state === 'draft' ? <>
            <div className={drawingStyles.timerRow}><p>仅你可见的题目：<strong>{remote.word}</strong></p><strong className={drawingStyles.timer} data-urgent={remaining <= 30} role="timer" aria-label="绘画剩余时间">{`${Math.floor(remaining / 60).toString().padStart(2, '0')}:${(remaining % 60).toString().padStart(2, '0')}`}</strong></div>
            <progress aria-label="绘画剩余进度" max={120} value={remaining} />
            {remaining > 0 && remaining <= 30 && <p className={drawingStyles.warning} role="status">还剩 30 秒以内，到时将自动提交已保存的画作。</p>}
            {remaining === 0 && <p role="status">时间到，画布已锁定，正在核对服务器自动提交结果…</p>}
            <p className={drawingStyles.saveStatus} role="status">{saving ? '正在保存到服务器…' : dirty ? '有笔画尚未确认保存，请勿刷新或切换页面。' : remote.savedAt ? '草稿已保存到服务器，可刷新恢复；到期自动提交。' : '还没有保存的笔画；空白到期会结束并保留机会使用记录。'}</p>
            <div className={styles.actions}><label>笔色<select value={color} disabled={disabled} onChange={e => setColor(e.target.value)}><option value="#334155">墨色</option><option value="#2563eb">蓝</option><option value="#dc2626">红</option><option value="#16a34a">绿</option></select></label><button disabled={disabled || !strokes.length || active.current !== null} onClick={() => updateLocal(local.current.slice(0, -1))}>撤销一笔</button><span>最多 100 笔，不写字母和文字</span></div>
            <svg className={`${styles.drawing} ${styles.pad}`} viewBox="0 0 1000 1000" role="img" aria-label="绘画画布" aria-disabled={disabled}
                onPointerDown={e => { if (disabled || serverNow() >= Date.parse(remoteRef.current.deadlineAt!) || local.current.length >= 100 || local.current.reduce((n, x) => n + x.points.length, 0) > 2998 || active.current !== null) return; active.current = e.pointerId; e.currentTarget.setPointerCapture?.(e.pointerId); const p = point(e); updateLocal([...local.current, { points: [p, p], color, width: 4 }]); }}
                onPointerMove={e => { if (disabled || active.current !== e.pointerId || serverNow() >= Date.parse(remoteRef.current.deadlineAt!)) return; const s = local.current, p = point(e); if (!s.length || s[s.length - 1].points.length >= 200 || s.reduce((n, x) => n + x.points.length, 0) >= 3000) return; updateLocal(s.map((x, i) => i === s.length - 1 ? { ...x, points: [...x.points, p] } : x)); }}
                onPointerUp={() => { active.current = null; if (!failure.current && performance.now() - lastAttempt.current >= 800) void send(); }} onPointerCancel={() => { active.current = null; }}>
                {strokes.map((s, i) => <polyline key={i} points={s.points.map(p => `${p.x},${p.y}`).join(' ')} stroke={s.color} strokeWidth={s.width} fill="none" strokeLinecap="round" />)}
            </svg>
            <div className={styles.actions}><button disabled={disabled || saving || !strokes.length} onClick={() => void send(true)}>提前提交到猜画墙</button><button disabled={disabled || saving || !dirty} onClick={() => void send()}>立即保存草稿</button></div>
        </> : <p className={state === 'expired_empty' ? drawingStyles.warning : styles.notice} role="status">{state === 'expired_empty' ? '本次空白结束：截止时没有已保存的笔画，没有发布空画；本次机会已使用。' : remote.submission === 'automatic' ? '时间到，服务器已自动提交最后保存的画作。' : '你的画作已提交到猜画墙。'}</p>}
        {error && <p className={drawingStyles.warning} role="alert">{error}</p>}
        {state !== 'draft' && dirty && <p className={drawingStyles.warning}>部分本地笔画未在截止前保存，不在已发布画作中；服务器不会补写过期内容。</p>}
        <div className={styles.actions}>
            {failure.current && !conflict && state === 'draft' && remaining > 0 && <button disabled={saving} onClick={() => { failure.current = false; void send(false, Boolean(pending.current)); }}>{pending.current ? '重试保存（原请求）' : '重新保存草稿'}</button>}
            {(remaining === 0 || error) && <button disabled={saving} onClick={() => void readResult()}>重新查询保存与结算结果</button>}
            {conflict && <button disabled={saving} onClick={loadSaved}>放弃本页未保存笔画，读取服务器草稿</button>}
        </div>
        <p className={drawingStyles.hint}>已保存内容由服务器到期结算，关闭页面也会处理。断网或离开前未确认保存的部分无法保证提交；机会在领取时扣除，不因空白或离线自动返还。</p>
    </section>;
}

export function OfficeDrawingPanel({ view, busy, command, refresh }: { view: OfficeHubOverview; busy: boolean; command: Command; refresh: () => Promise<void> }) {
    const [guesses, setGuesses] = useState<Record<string, string>>({});
    const workspace = view.drawingWorkspace, current = workspace?.current;
    const legacyDraft = !workspace ? view.drawings.find(d => d.mine && !d.strokes.length) : null;
    return <div className={styles.stack}><section className={styles.panel}>
        <div className={styles.sectionTitle}><h2>异步猜画墙 · {view.collection.theme}</h2><button disabled={busy || !workspace || workspace.dailyRemaining <= 0 || Boolean(current && statusOf(current) === 'draft')} onClick={() => void command('drawing_start')}>领取绘画主题</button></div>
        <p>无需在线匹配。每题 2 分钟，到期自动提交已保存的画作；猜手每张最多猜 5 次，猜中后双方可领社交积分。投稿不得写文字。</p>
        {workspace ? <p className={drawingStyles.quota}>今日剩余 <strong>{workspace.dailyRemaining} / {workspace.dailyLimit}</strong> 次 · 已使用 {workspace.dailyUsed} 次 · 北京时间零点更新</p> : <p role="status">当前服务器尚未提供自动保存状态，请刷新后再开始绘画。{legacyDraft && <>仅你可见的题目：{legacyDraft.word}</>}</p>}
        {current && <OfficeDrawingEditor key={current.id} drawing={current} serverTime={view.serverTime} onSettled={() => void refresh()} />}
    </section><div className={styles.gallery}>{view.drawings.filter(d => statusOf(d) === 'published').map(d => <article className={styles.panel} key={d.id}><div className={styles.sectionTitle}><h3>{d.author.displayName}的画</h3><span>{d.theme}</span></div><OfficeDrawingImage strokes={d.strokes} /><p>{d.word ? `答案：${d.word}` : `${d.wordLength} 个字`} · {d.guesses} 人猜中</p>{d.mine ? <button disabled={busy} onClick={() => void command('post_delete', { postId: d.id })}>撤下我的画</button> : <><form onSubmit={e => { e.preventDefault(); void command('drawing_guess', { postId: d.id, guess: guesses[d.id] ?? '' }); }}><label>你的答案<input required maxLength={30} disabled={d.solved || d.attempts >= 5} value={guesses[d.id] ?? ''} onChange={e => setGuesses({ ...guesses, [d.id]: e.target.value })} /></label><button disabled={busy || d.solved || d.attempts >= 5}>{d.solved ? '已猜中' : `提交（还剩 ${5 - d.attempts} 次）`}</button></form><button disabled={busy} onClick={() => void command('post_report', { postId: d.id })}>举报文字提示 / 不当内容</button></>}</article>)}</div></div>;
}
