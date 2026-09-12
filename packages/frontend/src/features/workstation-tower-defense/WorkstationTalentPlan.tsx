import { useEffect, useRef, useState, type JSX } from 'react';
import type { WorkstationTalentPlanInput, WorkstationTalents } from '@stealth-reader/shared';
import styles from './WorkstationCampaignPage.module.css';

const KEYS = ['output', 'control', 'economy'] as const;
const LABELS = { output: '出力', control: '控制', economy: '经济' };
const same = (a: WorkstationTalents, b: WorkstationTalents) => KEYS.every(key => a[key] === b[key]);
const describe = (value: WorkstationTalents) => KEYS.map(key => `${LABELS[key]} ${value[key]}`).join(' / ');

/** Drafts are local. Only an acknowledged/independently re-read server plan is saved. */
export function WorkstationTalentPlan({ saved, points, currentRun, writesEnabled, busy, onSave, onReload }: {
  saved: WorkstationTalents; points: number; currentRun?: WorkstationTalents;
  writesEnabled: boolean; busy: boolean;
  onSave: (input: WorkstationTalentPlanInput) => Promise<boolean>;
  onReload: () => Promise<boolean>;
}): JSX.Element {
  const [draft, setDraft] = useState<WorkstationTalents>({ ...saved });
  const [baseline, setBaseline] = useState<WorkstationTalents>({ ...saved });
  const [pending, setPending] = useState(false), [notice, setNotice] = useState('');
  const dirty = !same(draft, baseline), changedElsewhere = dirty && !same(saved, baseline) && !same(saved, draft);
  const draftRef = useRef({ draft, dirty }); draftRef.current = { draft, dirty };
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    // Polls must not erase a draft. A lost-response save may be confirmed by a
    // later read; matching the exact desired plan is safe to acknowledge.
    if (!draftRef.current.dirty || same(saved, draftRef.current.draft)) {
      setDraft({ ...saved }); setBaseline({ ...saved });
    }
  }, [saved]);
  const total = KEYS.reduce((sum, key) => sum + draft[key], 0);
  const valid = KEYS.every(key => Number.isSafeInteger(draft[key]) && draft[key] >= 0 && draft[key] <= 5) && total <= points;
  const working = busy || pending;
  const visibleNotice = !dirty && same(saved, draft) && notice.startsWith('保存未确认')
    ? '已通过服务端存档核对当前方案，无需重复保存。' : notice;
  async function save(): Promise<void> {
    if (working || !writesEnabled || !valid || !dirty || changedElsewhere) return;
    const submitted = { ...draft }, expectedTalents = { ...baseline };
    setPending(true); setNotice('正在保存下一局方案…');
    try {
      const accepted = await onSave({ ...submitted, expectedTalents });
      if (!alive.current) return;
      if (accepted) { setDraft(submitted); setBaseline(submitted); setNotice('下一局方案已保存；当前局天赋不变。'); }
      else setNotice('保存未确认，请核对服务端已保存方案；草稿保留，可同步存档后重试。');
    } catch { if (alive.current) setNotice('保存未确认，草稿保留；请同步存档后重试。'); }
    finally { if (alive.current) setPending(false); }
  }
  return <section className={styles.talents} aria-label="三系天赋">
    <h2>成长便签 · 下一局天赋方案</h2>
    <p>共 {points} 点，免费重新分配，仅新建任务使用。出力每点 +4% 伤害；控制扩大脉冲并减冷却；经济每点 +8% 绿植收入。</p>
    <p aria-label="天赋点分配">已分配 {total} / {points} · 剩余 {points - total} 点</p>
    {KEYS.map(key => <label key={key}>{LABELS[key]}<input type="number" min="0" max="5" step="1" disabled={working || !writesEnabled} value={draft[key]} onChange={event => { setDraft(previous => ({ ...previous, [key]: Number(event.target.value) })); setNotice(''); }} /></label>)}
    {!valid ? <p className={styles.error} role="alert">每系须为 0–5 的整数，分配总和不能超过 {points} 点。</p> : null}
    <p aria-label="服务端天赋方案">已保存方案：{describe(saved)}</p>
    {currentRun ? <p aria-label="当前局天赋">当前局：{describe(currentRun)}。保存新方案不会改变当前准备、战斗或暂停中的任务。</p> : null}
    <p role="status">{pending ? '正在保存…' : dirty ? '有未保存修改' : '与服务器已保存方案一致'}{visibleNotice ? ` · ${visibleNotice}` : ''}</p>
    {changedElsewhere ? <p className={styles.error} role="alert">另一页面已更新方案。请先载入服务端已保存方案，再重新分配；不会覆盖它。</p> : null}
    <div className={styles.talentActions}>
      <button type="button" disabled={working || !writesEnabled || !valid || !dirty || changedElsewhere} onClick={() => { void save(); }}>保存天赋</button>
      <button type="button" disabled={working || (!dirty && same(saved, baseline))} onClick={() => { setDraft({ ...saved }); setBaseline({ ...saved }); setNotice('已载入服务端方案，未保存草稿已取消。'); }}>载入已保存方案</button>
      <button type="button" disabled={working} onClick={() => { setPending(true); void onReload().then(ok => { if (alive.current) setNotice(ok ? '已同步存档，服务端方案已更新；未保存草稿仍保留。' : '同步未完成，保留已知存档与草稿。'); }).catch(() => { if (alive.current) setNotice('同步未完成，保留已知存档与草稿。'); }).finally(() => { if (alive.current) setPending(false); }); }}>同步存档</button>
    </div>
  </section>;
}
