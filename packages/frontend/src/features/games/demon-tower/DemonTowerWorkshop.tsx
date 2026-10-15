import { useState, type JSX } from 'react';
import { TOWER_WORKSHOP_SOURCE as C, towerWorkshopSets, type DemonTowerAction, type DemonTowerProfileView, type TowerForgeQuality, type TowerForgeSlot, type TowerRefineGrade, type TowerForgedItem } from '@stealth-reader/shared';
import { TowerModal, TowerPanel } from './TowerElements';
import styles from './DemonTower.module.css';
import layout from './DemonTowerWorkshop.module.css';

function Item({ item }: { item: TowerForgedItem }): JSX.Element {
  return <><h3>{item.quality} · {item.name}</h3><p>{C.SLOTS.find(s => s.key === item.slot)?.name} · 使用等级 {item.requiredLevel} · {item.set ? C.SETS[item.set as keyof typeof C.SETS]?.name : '独立单件'}{item.weaponType ? ` · ${C.WTYPES[item.weaponType as keyof typeof C.WTYPES]?.name}` : ''}</p><ul>{item.affixes.map(a => <li key={a.id}>{a.name}：{a.value ? `+${a.value}${a.stat === 'hp' ? ' 生命' : a.stat === 'dimPct' ? ' 属性点' : '%'}` : a.description}</li>)}</ul></>;
}

export function DemonTowerWorkshop({ profile, disabled, balance, balanceStale, onAction }: {
  profile: DemonTowerProfileView; disabled: boolean; balance: number | null; balanceStale: boolean;
  onAction: (action: DemonTowerAction) => Promise<boolean>;
}): JSX.Element {
  const w = profile.workshop;
  const [slot, setSlot] = useState<TowerForgeSlot>('weapon'), [quality, setQuality] = useState<TowerForgeQuality>('白');
  const [grade, setGrade] = useState<TowerRefineGrade>('原矿'), [set, setSet] = useState(''), [weaponType, setWeaponType] = useState('zhong');
  const [ore, setOre] = useState<string>('ht'), [refineGrade, setRefineGrade] = useState<TowerRefineGrade>('粗炼');
  const [auxiliary, setAuxiliary] = useState(''), [auxiliaryCount, setAuxiliaryCount] = useState(1);
  const [resultOpen, setResultOpen] = useState(false), [inspect, setInspect] = useState<TowerForgedItem | null>(null);
  const [purchase, setPurchase] = useState<'ht' | 'mt' | null>(null);
  const [discard, setDiscard] = useState<TowerForgedItem | null>(null);
  disabled = disabled || !profile.availableActions.includes('workshop_forge');
  if (!w) return <p className={styles.notice}>锻造资料尚未同步，请刷新角色状态。</p>;
  const recipe = C.RECIPE[C.SLOT_CAT[slot]][quality];
  const cost = Object.entries(recipe).map(([id, n]) => ({ id, n: Math.max(1, Math.ceil(n * C.MAT_GRADE[grade].countMul)) }));
  const available = grade === '原矿' ? w.materials : w.refined[grade] ?? {};
  const auxOptions = Object.entries(C.FORGE_AUX).filter(([id, a]) => (a.q as readonly string[]).includes(quality) && C.MATS[id as keyof typeof C.MATS].tier < 5);
  const aux = auxOptions.find(([id]) => id === auxiliary);
  const enough = cost.every(m => (available[m.id] ?? 0) >= m.n) && (!aux || (w.materials[aux[0]] ?? 0) >= auxiliaryCount);
  const success = Math.min(100, Math.max(40, C.FORGE_BASE_SUCC[quality] + C.MAT_GRADE[grade].succ + (aux?.[1].succ ?? 0) * auxiliaryCount));
  const refine = C.REFINE.tiers.find(r => r.grade === refineGrade)!;
  const source = refine.fromGrade === '原矿' ? w.materials : w.refined[refine.fromGrade] ?? {};
  const materialName = (id: string): string => C.MATS[id as keyof typeof C.MATS]?.name ?? id;
  const setOptions = Object.entries(C.SETS).filter(([, definition]) => definition.quality.includes(quality) && (definition.slots as readonly string[]).includes(slot));
  const selectedSet = setOptions.some(([id]) => id === set) ? set : '';
  const submitForge = async (): Promise<void> => {
    if (await onAction({ kind: 'workshop_forge', payload: { slot, quality, grade, set: selectedSet, weaponType, auxiliary: aux?.[0] ?? '', auxiliaryCount: aux ? auxiliaryCount : 0 } })) setResultOpen(true);
  };
  return <div className={styles.stack}>
    <p className={styles.notice}>每日北京时间 00:00 体力补满，探索符不足 5 张补到 5 张，多出的已购探索符保留。探索和讨伐可获得锻造材料。</p>
    <TowerPanel title="锻造工作台" detail={<span className={styles.badge}>9 月 23 日版</span>}>
      <p className={styles.muted}>选择配方 → 核对材料和成功率 → 打造。结果与词条由服务器生成，失败产出白色残次装备，材料不返还。</p>
      <div className={layout.fields}>
        <label>部位<select value={slot} onChange={e => setSlot(e.target.value as TowerForgeSlot)}>{C.SLOTS.map(s => <option key={s.key} value={s.key}>{s.name}</option>)}</select></label>
        <label>主材品质<select value={quality} onChange={e => setQuality(e.target.value as TowerForgeQuality)}>{C.QUAL_ORDER.map(q => <option key={q} value={q}>{C.FORGE_MAT_LABEL[q]} · Lv{C.QUAL[q].req}</option>)}</select></label>
        <label>精炼等级<select value={grade} onChange={e => setGrade(e.target.value as TowerRefineGrade)}>{C.GRADE_ORDER.map(g => <option key={g}>{g}</option>)}</select></label>
        <label>套装归属<select value={selectedSet} onChange={e => setSet(e.target.value)}><option value="">默认归属</option>{setOptions.map(([id, s]) => <option key={id} value={id}>{s.name}</option>)}</select></label>
        <label>武器流派<select value={weaponType} disabled={slot !== 'weapon'} onChange={e => setWeaponType(e.target.value)}>{Object.entries(C.WTYPES).map(([id, t]) => <option key={id} value={id}>{t.name} · {t.dao}</option>)}</select></label>
        <label>辅助材料<select value={aux?.[0] ?? ''} onChange={e => setAuxiliary(e.target.value)}><option value="">不使用</option>{auxOptions.map(([id, a]) => <option key={id} value={id}>{a.name} · 库存{w.materials[id] ?? 0}</option>)}</select></label>
        {aux ? <label>辅料份数<select value={auxiliaryCount} onChange={e => setAuxiliaryCount(Number(e.target.value))}>{[1, 2, 3].map(n => <option key={n}>{n}</option>)}</select></label> : null}
      </div>
      <p>综合成功率 <strong>{success}%</strong>；材料库存：{cost.map(m => `${materialName(m.id)}（${grade}）${available[m.id] ?? 0}/${m.n}`).join('、')}。</p>
      {aux ? <p>另消耗{aux[1].name}×{auxiliaryCount}（库存{w.materials[aux[0]] ?? 0}）；辅料从原始库存扣除。</p> : null}
      <p className={styles.muted}>套装选项会按当前主材品质和部位限定；白、绿装备不带套装，红色毕业套未开放。若成品品质不足，不会带入越级套装。</p>
      <button className={styles.button} disabled={disabled || !enough || profile.level < C.QUAL[quality].req || w.items.length >= 200} onClick={() => void submitForge()}>确认耗材并打造</button>
      {w.lastForge ? <button className={styles.button} onClick={() => setResultOpen(true)}>查看上次打造结果</button> : null}
    </TowerPanel>
    <div className={layout.columns}>
      <TowerPanel title="材料精炼台"><p className={styles.muted}>逐级精炼，每批投入 3 份材料，产出 3 份精炼料；木炭分别消耗 6 / 9 / 12。库存按精炼等级分开保存。</p>
        <div className={layout.fields}><label>材料<select value={ore} onChange={e => setOre(e.target.value)}>{C.REFINE.ores.map(id => <option key={id} value={id}>{materialName(id)}</option>)}</select></label><label>目标等级<select value={refineGrade} onChange={e => setRefineGrade(e.target.value as TowerRefineGrade)}>{C.REFINE.tiers.map(r => <option key={r.grade}>{r.grade}</option>)}</select></label></div>
        <p>{refine.fromGrade} {source[ore] ?? 0}/3 · 木炭 {w.materials.mt ?? 0}/{refine.rneed} · 当前{refineGrade} {w.refined[refineGrade]?.[ore] ?? 0}</p>
        <button className={styles.button} disabled={disabled || (source[ore] ?? 0) < 3 || (w.materials.mt ?? 0) < refine.rneed} onClick={() => void onAction({ kind: 'workshop_refine', payload: { material: ore, grade: refineGrade, batches: 1 } })}>精炼一批</button>
      </TowerPanel>
      <TowerPanel title="基础材料补给"><p>统一办公币：{balanceStale ? '待同步' : balance ?? '待同步'}</p><p className={styles.muted}>黑铁精 8 办公币、木炭 5 办公币，每种每日限购 20。只在确认购买后扣款。</p>
        {(['ht', 'mt'] as const).map(id => <div className={layout.supply} key={id}><span>{materialName(id)} · 持有 {w.materials[id] ?? 0} · 今日剩余 {Math.max(0, 20 - (w.dailyBought[id] ?? 0))}</span><button className={styles.button} disabled={disabled || balanceStale || balance === null || balance < (id === 'ht' ? 8 : 5) || (w.dailyBought[id] ?? 0) >= 20} onClick={() => setPurchase(id)}>购买 1 份</button></div>)}
      </TowerPanel>
    </div>
    <TowerPanel title="套装配装进度"><p className={styles.muted}>3件/5件两档；同时仅激活穿戴件数最多的一套，同数按源码套装顺序优先。单件词条独立生效。</p><div className={layout.inventory}>{towerWorkshopSets(w).map(s => <article key={s.id} className={layout.item}><h3>{s.name} · {s.count}件 {s.active ? '· 已激活' : ''}</h3><p>{s.description}</p></article>)}</div></TowerPanel>
    <TowerPanel title="材料库存"><div className={layout.inventory}>{C.GRADE_ORDER.map(g => <article key={g} className={layout.item}><h3>{g}</h3><p>{Object.entries(g === '原矿' ? w.materials : w.refined[g] ?? {}).filter(([, n]) => n > 0).map(([id, n]) => `${materialName(id)}×${n}`).join(' · ') || '暂无材料'}</p></article>)}</div></TowerPanel>
    <TowerPanel title="打造装备档案" detail={<span className={styles.badge}>{w.items.length}/200</span>}>
      <div className={layout.inventory}>{w.items.slice().reverse().map(item => {
        const equipped = w.equipped[item.slot] === item.id;
        return <article key={item.id} className={layout.item}><Item item={item} /><div className={layout.actions}>
          <button className={styles.button} onClick={() => setInspect(item)}>详情</button>
          <button className={styles.button} disabled={disabled || profile.level < item.requiredLevel} onClick={() => void onAction({ kind: 'workshop_equip', payload: { itemId: item.id } })}>{equipped ? '卸下' : '穿戴'}</button>
          <button className={styles.button} disabled={disabled || (w.materials.ht ?? 0) < 1 || (w.materials.lm ?? 0) < 1} onClick={() => void onAction({ kind: 'workshop_recast', payload: { itemId: item.id } })}>重铸（黑铁精1、灵麻布1）</button>
          <button className={styles.button} disabled={disabled || equipped} onClick={() => setDiscard(item)}>丢弃</button>
        </div></article>;
      })}</div>
      {!w.items.length ? <p className={styles.empty}>尚无打造装备，先准备材料。原有武器和技能仍在「装备」「养成」中保留。</p> : null}
    </TowerPanel>
    {resultOpen && w.lastForge ? <TowerModal title="打造结果" onClose={() => setResultOpen(false)}><p role="status">{w.lastForge.failed ? '残次 · 材料不返还' : '打造成功'}</p><Item item={w.lastForge.item} /><p>主材 {w.lastForge.materialQuality} · {w.lastForge.grade} · 成功率 {w.lastForge.successPercent}%</p><p>已消耗：{Object.entries(w.lastForge.cost).map(([id, n]) => `${materialName(id)}×${n}`).join('、')}</p></TowerModal> : null}
    {inspect ? <TowerModal title="装备详情" onClose={() => setInspect(null)}><Item item={w.items.find(i => i.id === inspect.id) ?? inspect} /></TowerModal> : null}
    {purchase ? <TowerModal title="确认材料购买" onClose={() => setPurchase(null)}><p>购买 {materialName(purchase)}×1，将从全站统一钱包扣除 {purchase === 'ht' ? 8 : 5} 办公币。</p><button className={styles.button} disabled={disabled} onClick={async () => { if (await onAction({ kind: 'workshop_purchase', payload: { material: purchase, quantity: 1 } })) setPurchase(null); }}>确认购买</button></TowerModal> : null}
    {discard ? <TowerModal title="确认丢弃装备" onClose={() => setDiscard(null)}><Item item={discard} /><p>丢弃后无法找回，不返还任何材料。已穿戴的装备需先卸下。</p><button className={styles.button} disabled={disabled} onClick={async () => { if (await onAction({ kind: 'workshop_discard', payload: { itemId: discard.id } })) setDiscard(null); }}>确认丢弃</button></TowerModal> : null}
  </div>;
}
