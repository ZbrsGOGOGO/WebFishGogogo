import { useEffect, useRef, useState, type JSX } from 'react';
import { DEVELOPMENT_CHECK_STATES, type DevelopmentCheckItem, type DevelopmentRequestDetail } from '@stealth-reader/shared';
import { communityDevelopmentApi } from '../../api/community-development';
import { CommunityApiError, getCommunitySessionGeneration } from '../../api/community-http';
import { useCommunityAuthStore } from '../../app/store/community-auth-store';
import { Button, Card, Tag, Textarea } from '../../components/ui';
import { developmentError, developmentTime } from './development-format';
import styles from './Development.module.css';

const LABELS = { todo: '待开发', in_progress: '实现中', done: '已验收', blocked: '有阻碍' } as const;
export function DevelopmentProgressCard({ detail, owner, onSaved, onConflict }: {
  detail: DevelopmentRequestDetail; owner: boolean;
  onSaved: (next: DevelopmentRequestDetail) => void; onConflict: () => void;
}): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [summary, setSummary] = useState(detail.progress?.summary ?? '');
  const [items, setItems] = useState<DevelopmentCheckItem[]>(detail.progress?.items ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const alive = useRef(true); const busy = useRef(false);
  const session = getCommunitySessionGeneration();
  const subject = useCommunityAuthStore((state) => state.user?.publicId);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const current = () => alive.current && session === getCommunitySessionGeneration() &&
    useCommunityAuthStore.getState().phase === 'active' && useCommunityAuthStore.getState().user?.publicId === subject;
  const hasRemaining = detail.progress?.items.some((item) => item.status !== 'done');
  async function save(): Promise<void> {
    if (busy.current || !owner || !current()) return;
    if (!summary.trim() || items.length === 0 || items.some((item) => !item.label.trim())) {
      setError('请填写交付范围说明，以及至少一项具体的验收内容。'); return;
    }
    busy.current = true; setSaving(true); setError(undefined);
    try {
      const next = await communityDevelopmentApi.saveProgress(detail.id, { expectedVersion: detail.version, summary: summary.trim(),
        items: items.map((item) => ({ ...item, label: item.label.trim() })) });
      if (current()) { setEditing(false); onSaved(next); }
    } catch (reason) {
      if (!current()) return;
      if (reason instanceof CommunityApiError && reason.status === 409) onConflict();
      setError(developmentError(reason, '分项进度保存失败'));
    } finally { if (current()) { busy.current = false; setSaving(false); } }
  }
  return <Card title="分项进度与交付范围" bodyClassName={styles.cardBody}>
    {detail.review?.hasUnreviewedChanges ? <p className={styles.scopeNote}>
      {detail.review.reviewedVersion > 0 ? `审阅后有新补充，需跟进（上次审阅至 v${detail.review.reviewedVersion}）。` : '尚未记录逐项审阅结果。'}
    </p> : detail.review?.reviewedAt ? <p className={styles.muted}>已审阅至 v{detail.review.reviewedVersion} · {developmentTime(detail.review.reviewedAt)}</p> : null}
    {detail.status === 'done' && hasRemaining ? <p className={styles.scopeNote}>本条仍有未完成子项；“已完成”保留的是旧批次结果，不代表整篇需求已实现。</p> : null}
    {detail.progress ? <>
      <p className={styles.plainText}>{detail.progress.summary}</p>
      <p className={styles.muted}>已验收 {detail.progress.items.filter((item) => item.status === 'done').length} / {detail.progress.items.length} 项</p>
      <ul className={styles.progressList}>{detail.progress.items.map((item) => <li key={item.id}>
        <Tag color={item.status === 'done' ? 'success' : item.status === 'blocked' ? 'danger' : 'neutral'}>{LABELS[item.status]}</Tag><span>{item.label}</span>
      </li>)}</ul>
    </> : <p className={styles.muted}>{detail.review?.summary ?? '尚无分项清单；请勿仅凭总状态推断正文和附件已全部实现。'}</p>}
    {owner && !editing ? <Button variant="secondary" onClick={() => setEditing(true)}>编辑分项进度</Button> : null}
    {owner && editing ? <form className={styles.progressEditor} onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <Textarea label="本批交付范围及未完成说明" value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={1200} rows={4} disabled={saving} required />
      {items.map((item, index) => <div className={styles.progressRow} key={item.id}>
        <input aria-label={`验收项 ${index + 1}`} value={item.label} maxLength={160} required disabled={saving} onChange={(event) => setItems((value) => value.map((row) => row.id === item.id ? { ...row, label: event.target.value } : row))} />
        <select aria-label={`验收项 ${index + 1} 状态`} disabled={saving} value={item.status} onChange={(event) => setItems((value) => value.map((row) => row.id === item.id ? { ...row, status: event.target.value as DevelopmentCheckItem['status'] } : row))}>
          {DEVELOPMENT_CHECK_STATES.map((state) => <option key={state} value={state}>{LABELS[state]}</option>)}
        </select>
        <Button variant="ghost" size="sm" disabled={saving} onClick={() => setItems((value) => value.filter((row) => row.id !== item.id))}>移除</Button>
      </div>)}
      <Button variant="secondary" disabled={saving || items.length >= 40} onClick={() => setItems((value) => [...value, { id: crypto.randomUUID(), label: '', status: 'todo' }])}>添加验收项</Button>
      <p className={styles.muted}>最多 40 项。保存会记录审阅版本并通知提交者，不自动把整条提案标为完成，也不执行附件或部署。</p>
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
      <div className={styles.headerActions}><Button type="submit" loading={saving}>保存分项进度</Button><Button variant="ghost" disabled={saving} onClick={() => {
        setEditing(false); setSummary(detail.progress?.summary ?? ''); setItems(detail.progress?.items ?? []); setError(undefined);
      }}>取消</Button></div>
    </form> : null}
  </Card>;
}
