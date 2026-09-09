import { useEffect, useRef, useState, type JSX } from 'react';
import { DEMON_TOWER_ATTRIBUTE_KEYS, type DemonTowerAction, type DemonTowerAttribute, type DemonTowerCatalog, type DemonTowerProfileView } from '@stealth-reader/shared';

import { TowerModal } from './TowerElements';
import styles from './DemonTower.module.css';

/** Quantity is only a draft until the explicit, server-versioned confirmation. */
export function DemonTowerAttributeAllocate({ profile, catalog, disabled, onAction }: { profile: DemonTowerProfileView; catalog: DemonTowerCatalog; disabled: boolean; onAction: (action: DemonTowerAction) => Promise<boolean> }): JSX.Element {
  const [open, setOpen] = useState(false);
  const [attribute, setAttribute] = useState<DemonTowerAttribute>('STR');
  const [quantity, setQuantity] = useState('1');
  const [initialBudget, setInitialBudget] = useState(profile.unspentPoints);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const maximum = Math.min(1000, profile.unspentPoints);
  const count = /^[1-9]\d{0,3}$/.test(quantity) ? Number(quantity) : 0;
  const valid = count > 0 && count <= maximum;
  const available = !disabled && !sending && !profile.battle && profile.unspentPoints > 0 && profile.availableActions.includes('allocate');
  const submit = async (): Promise<void> => {
    if (!available || !valid || inFlight.current) return;
    inFlight.current = true; setSending(true); setError(null);
    try {
      const done = await onAction({ kind: 'allocate', payload: { attribute, points: count } });
      if (!alive.current) return;
      if (done) setOpen(false);
      else setError('分配尚未完成，请核对当前点数及工作台同步提示。结果待确认时不能提交新分配。');
    } catch {
      if (alive.current) setError('暂时未能确认分配结果，请关闭详情并查看工作台的同步提示。');
    } finally { inFlight.current = false; if (alive.current) setSending(false); }
  };
  return <><div className={styles.attributeAllocate}><p className={styles.muted}>每维右侧 + 快速分配 1 点；点数较多时，可以先核对数量再批量分配。</p><button type="button" className={styles.button} disabled={!available} onClick={() => { setAttribute('STR'); setQuantity('1'); setInitialBudget(profile.unspentPoints); setError(null); setOpen(true); }}>批量分配自由点</button></div>
    {open ? <TowerModal title="批量分配自由点" onClose={() => setOpen(false)} footer={<div className={styles.actionsRight}><button type="button" className={styles.button} onClick={() => setOpen(false)}>暂不分配</button><button type="submit" form="tower-attribute-allocation" className={styles.primary} disabled={!available || !valid}>{sending ? '正在分配…' : valid ? `确认分配 ${count} 点${catalog.attributes[attribute]}` : '输入有效数量后分配'}</button></div>}><form id="tower-attribute-allocation" onSubmit={(event) => { event.preventDefault(); void submit(); }}><label className={styles.field}>分配属性<select value={attribute} disabled={disabled || sending} onChange={(event) => { setAttribute(event.target.value as DemonTowerAttribute); setError(null); }}>{DEMON_TOWER_ATTRIBUTE_KEYS.map((key) => <option key={key} value={key}>{catalog.attributes[key]} · {key}</option>)}</select></label><label className={styles.field} style={{ marginTop: 15 }}>分配数量<input type="text" inputMode="numeric" maxLength={4} value={quantity} disabled={disabled || sending} aria-describedby="tower-allocation-preview" onChange={(event) => { setQuantity(event.target.value); setError(null); }} /></label><p id="tower-allocation-preview" className={styles.notice} style={{ marginTop: 16 }}>当前可用 {profile.unspentPoints} 点。{valid ? `将为${catalog.attributes[attribute]}分配 ${count} 点，确认后剩余 ${profile.unspentPoints - count} 点。` : maximum > 0 ? `请输入 1–${maximum} 的整数，不接受小数或超额分配。` : '当前没有可分配的自由点。'}</p><p className={styles.muted}>此处仅调整草稿，点击确认后才提交；不扣办公币、体力或绑定材料。</p>{initialBudget !== profile.unspentPoints ? <p className={styles.notice} role="status">其他行动已更新可用点数，请按当前 {profile.unspentPoints} 点重新核对。原输入数量不会自动改小或提交。</p> : null}{profile.battle ? <p className={styles.notice}>当前已有探索战斗，请先完成或撤离后分配。</p> : disabled ? <p className={styles.notice}>当前不能提交新行动；请等待同步，或关闭详情查看工作台提示。</p> : null}{error ? <p className={styles.error} role="alert">{error}</p> : null}</form></TowerModal> : null}
  </>;
}
