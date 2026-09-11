import { useEffect, useRef, useState, type JSX } from 'react';
import { DEMON_TOWER_APPEARANCE_LABELS, DEMON_TOWER_APPEARANCE_OPTIONS, DEMON_TOWER_APPEARANCE_SLOTS, DEMON_TOWER_DEFAULT_APPEARANCE, type DemonTowerAction, type DemonTowerAppearance, type DemonTowerAppearanceSlot, type DemonTowerCombatPower, type DemonTowerProfileView } from '@stealth-reader/shared';
import { getCommunitySessionGeneration } from '../../../api/community-http';
import { TowerPortrait } from './DemonTowerArt';
import { TowerModal, TowerPanel } from './TowerElements';
import styles from './DemonTower.module.css';
import profileStyles from './DemonTowerProfile.module.css';

export function DemonTowerPower({ power }: { power?: DemonTowerCombatPower }): JSX.Element | null {
  if (!power) return null;
  const labels: Record<keyof DemonTowerCombatPower['parts'], string> = { level: '妖塔等级', attributes: '常驻五维', weapons: '已装武器', skills: '已装技能', innates: '已觉醒命格' };
  return <section className={profileStyles.power} aria-label="配装综合战力">
    <div className={profileStyles.powerHeading}><span>配装综合战力</span><strong>{power.total.toLocaleString('zh-CN')}</strong></div>
    <p>基础 {power.base.toLocaleString('zh-CN')} · 临时增益 +{power.temporary.toLocaleString('zh-CN')}</p>
    <details><summary>评分构成与适用范围</summary><dl className={profileStyles.breakdown}>{(Object.keys(labels) as Array<keyof typeof labels>).map(key => <div key={key}><dt>{labels[key]}</dt><dd>{power.parts[key].toLocaleString('zh-CN')}</dd></div>)}</dl><p>仅按当前配装计算，未装备的收藏不计分。常驻五维包含永久加成，临时药效单列；这是配装参考，不是实测 DPS、胜率或解锁门槛。</p><p>由服务器按已保存档案计算；战斗中的临时状态与旧战斗快照不用于承诺本场伤害。</p></details>
  </section>;
}

type Props = { profile: DemonTowerProfileView; ownerId: string | null; name: string; disabled: boolean; showSkins: boolean; onAction: (action: DemonTowerAction) => Promise<boolean> };
type Editor = { scope: string; id: number; draft: DemonTowerAppearance; original: DemonTowerAppearance; error: string | null };

/** Drafts live only inside this account's mounted profile panel; saving is explicit. */
export function DemonTowerAppearancePanel({ profile, ownerId, name, disabled, showSkins, onAction }: Props): JSX.Element {
  const generation = getCommunitySessionGeneration();
  const scope = `${ownerId}:${generation}`;
  const currentScope = useRef(scope); currentScope.current = scope;
  const mounted = useRef(true);
  const sequence = useRef(0);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const sending = useRef<string | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setEditor(null); setSaving(null); sending.current = null; }, [scope]);
  const current = editor?.scope === scope ? editor : null;
  const busy = saving === scope;
  const canSave = !disabled && !busy && Boolean(ownerId) && profile.availableActions.includes('set_appearance');
  const expansion = showSkins ? profile.expansion : undefined;
  const canSkin = !disabled && !busy && profile.availableActions.includes('select_skin');
  const changed = current && DEMON_TOWER_APPEARANCE_SLOTS.some(slot => current.draft[slot] !== current.original[slot]);
  const edit = (): void => {
    const appearance = { ...(profile.appearance ?? DEMON_TOWER_DEFAULT_APPEARANCE) };
    setEditor({ scope, id: ++sequence.current, draft: appearance, original: { ...appearance }, error: null });
  };
  const update = (slot: DemonTowerAppearanceSlot, id: string): void => {
    if (!DEMON_TOWER_APPEARANCE_OPTIONS[slot].some(option => option.id === id)) return;
    setEditor(previous => previous?.scope === scope ? { ...previous, draft: { ...previous.draft, [slot]: id }, error: null } : previous);
  };
  const randomize = (): void => {
    const draft = { ...DEMON_TOWER_DEFAULT_APPEARANCE };
    for (const slot of DEMON_TOWER_APPEARANCE_SLOTS) {
      const options = DEMON_TOWER_APPEARANCE_OPTIONS[slot];
      Object.assign(draft, { [slot]: options[Math.floor(Math.random() * options.length)].id });
    }
    setEditor(previous => previous?.scope === scope ? { ...previous, draft, error: null } : previous);
  };
  const save = async (): Promise<void> => {
    if (!current || !changed || !canSave || sending.current === scope) return;
    const editorId = current.id;
    sending.current = scope; setSaving(scope);
    let ok = false;
    try { ok = await onAction({ kind: 'set_appearance', payload: { appearance: { ...current.draft } } }); }
    catch { /* The draft is retained; the shared action flow handles uncertain requests. */ }
    if (!mounted.current || currentScope.current !== scope || getCommunitySessionGeneration() !== generation) return;
    sending.current = null; setSaving(null);
    setEditor(previous => previous?.scope === scope && previous.id === editorId ? ok ? null : { ...previous, error: '保存尚未确认，预览已保留。请查看页面操作提示；如提示确认上次操作，请先完成确认。' } : previous);
  };
  return <TowerPanel title="档案外观">
    <div className={profileStyles.appearanceSummary}><div><h3>寻道者形象</h3><p>八个部位自由组合，仅影响外观。手持装饰不替换战斗武器，也不增加战力。</p></div><button type="button" className={styles.button} disabled={busy} onClick={edit}>编辑人物形象</button></div>
    {!canSave ? <p className={profileStyles.editorNote}>当前只能预览；请在战斗和委托结束、恢复可写状态后保存。</p> : null}
    {expansion ? <fieldset className={profileStyles.skins} disabled={!canSkin}><legend>低调工作台皮肤 · 由服务器保存</legend><div className={styles.buttonRow}>{expansion.unlockedSkins.map(skin => <button type="button" className={styles.button} key={skin} aria-pressed={expansion.skin === skin} disabled={!canSkin || expansion.skin === skin} onClick={() => void onAction({ kind: 'select_skin', payload: { skin } })}>{({ field: '野外笔记', ledger: '数据台账', memo: '便签白板' })[skin]}</button>)}</div></fieldset> : null}
    {current ? <TowerModal title="编辑人物形象" onClose={() => setEditor(null)} footer={<div className={styles.actionsRight}><button type="button" className={styles.button} onClick={() => setEditor(null)}>{busy ? '收起编辑' : '取消'}</button><button type="button" className={styles.primary} disabled={!canSave || !changed} onClick={() => void save()}>{busy ? '保存中…' : '保存形象'}</button></div>}>
      <div className={profileStyles.editor}><div className={profileStyles.preview}><TowerPortrait name={name} appearance={current.draft} /><p>本地预览 · 尚未保存<br />免费外观，不影响配装或收益。</p></div><fieldset className={profileStyles.editorControls} disabled={busy}><legend>选择八个部位</legend>{DEMON_TOWER_APPEARANCE_SLOTS.map(slot => <label key={slot}>{DEMON_TOWER_APPEARANCE_LABELS[slot]}<select value={current.draft[slot]} onChange={event => update(slot, event.target.value)}>{DEMON_TOWER_APPEARANCE_OPTIONS[slot].map(option => <option value={option.id} key={option.id}>{option.label}</option>)}</select></label>)}</fieldset></div>
      <div className={styles.buttonRow} style={{ marginTop: 16 }}><button type="button" className={styles.button} disabled={busy} onClick={randomize}>随机搭配</button><button type="button" className={styles.button} disabled={busy} onClick={() => setEditor(previous => previous?.scope === scope ? { ...previous, draft: { ...DEMON_TOWER_DEFAULT_APPEARANCE }, error: null } : previous)}>预览默认形象</button></div>
      <p className={profileStyles.editorNote}>点击保存后才会同步到当前账号；取消或离开人物档案会丢弃未保存预览。帽子可能遮住部分发型。工作台皮肤在编辑窗口外单独选择。</p>
      {busy ? <p className={profileStyles.editorStatus} role="status">保存已提交，收起窗口不会撤销服务器上的操作。</p> : current.error ? <p className={profileStyles.editorStatus} role="alert">{current.error}</p> : null}
    </TowerModal> : null}
  </TowerPanel>;
}
