import { useEffect, useState, type JSX } from 'react';
import { DEMON_TOWER_AFFIXES, DEMON_TOWER_CATALOG, DEMON_TOWER_EXPANSION_RULES, DEMON_TOWER_SKILLS, DEMON_TOWER_WEAPONS, DEMON_TOWER_ULTIMATES,
  demonTowerItemRarity, demonTowerQualityLimit, demonTowerStrengthRating, demonTowerUpgradeCost,
  type DemonTowerAction, type DemonTowerProfileView } from '@stealth-reader/shared';
import { TowerModal, TowerPanel } from './TowerElements';
import { DemonTowerGuide } from './DemonTowerGuide';
import { DemonTowerUpgradePreview, demonTowerUpgradePreview, type DemonTowerProgressItem } from './DemonTowerUpgradePreview';
import styles from './DemonTower.module.css';

const RULES = DEMON_TOWER_EXPANSION_RULES;
export const demonTowerExpansionUIEnabled = import.meta.env.VITE_DEMON_TOWER_EXPANSION_ENABLED === 'true';
type Props = { profile: DemonTowerProfileView; disabled: boolean; onAction: (action: DemonTowerAction) => Promise<boolean>; selectedItem?: string | null; onSelectItem?: (id: string) => void; active?: boolean; advancedEnabled?: boolean };

/** Uses the same versioned, uncertain-result-aware action queue as ordinary exploration. */
export function DemonTowerExpansion({ profile, disabled, onAction, selectedItem, onSelectItem, active = true, advancedEnabled = true }: Props): JSX.Element | null {
  const [confirmation, setConfirmation] = useState<{ title: string; text: string; action: DemonTowerAction } | null>(null);
  const [selection, setSelection] = useState(selectedItem ?? profile.weapons[0]?.id ?? profile.skills[0]?.id ?? '');
  const [upgrading, setUpgrading] = useState(false);
  const items = [...profile.weapons, ...profile.skills];
  const selected = items.some(item => item.id === selection) ? selection : items[0]?.id ?? '';
  useEffect(() => { if (selectedItem) setSelection(selectedItem); setConfirmation(null); setUpgrading(false); }, [selectedItem]);
  useEffect(() => { if (!active) { setConfirmation(null); setUpgrading(false); } }, [active]);
  const value = profile.expansion;
  const advanced = advancedEnabled && Boolean(value);
  useEffect(() => { if (!advanced) setConfirmation(null); }, [advanced]);
  const can = (kind: DemonTowerAction['kind']) => !disabled && !profile.battle && (kind === 'upgrade' || advanced) && profile.availableActions.includes(kind);
  const ask = (title: string, text: string, action: DemonTowerAction) => setConfirmation({ title, text, action });
  const ownedWeapon = profile.weapons.find(item => item.id === selected), ownedSkill = profile.skills.find(item => item.id === selected);
  const owned = ownedWeapon ?? ownedSkill;
  const kind = ownedWeapon ? 'weapon' : 'skill';
  const weaponDefinition = ownedWeapon ? DEMON_TOWER_WEAPONS.find(item => item.id === selected) : undefined;
  const skillDefinition = ownedSkill ? DEMON_TOWER_SKILLS.find(item => item.id === selected) : undefined;
  const definition = weaponDefinition ?? skillDefinition;
  const progressItem: DemonTowerProgressItem | null = ownedWeapon && weaponDefinition
    ? { kind: 'weapon', owned: ownedWeapon, definition: weaponDefinition }
    : ownedSkill && skillDefinition ? { kind: 'skill', owned: ownedSkill, definition: skillDefinition } : null;
  const progress = progressItem ? demonTowerUpgradePreview(progressItem, advanced) : null;
  const rarity = definition ? demonTowerItemRarity(definition.rarity, ownedWeapon?.breakthrough) : '凡';
  const score = definition ? demonTowerStrengthRating(kind, definition.id) : null;
  const ultimate = ownedWeapon ? DEMON_TOWER_ULTIMATES[ownedWeapon.id] : null;
  const star = owned?.star ?? 1;
  const cost = owned && definition ? demonTowerUpgradeCost(kind, owned.id, owned.quality, owned.spareCopies, profile.level, owned.levelExempt ?? !profile.growth, value ? rarity : undefined) : null;
  const materialsEnough = cost ? Object.entries(cost.materials).every(([key, amount]) => profile.materials[key as keyof typeof profile.materials] >= amount) : false;
  return <div className={styles.stack}>
    <TowerPanel title={advanced ? '养成工坊 · 星级 / 稀有度 / 品质' : '养成工坊 · 基础品质强化'}>
      <p className={styles.muted}>{advanced ? '升星看星数，突破升稀有度，品质强化增加 +N；三者独立保留。' : '高级培养正在维护或尚未启用；基础品质强化仍可使用，原有装备与进度保留。'}这里统一培养已拥有物品，不会保存或覆盖装备标签的配装草稿。</p>
      {advanced && value ? <p className={styles.muted}>技能残页 {value.skillPages} · 妖塔精魄 {value.essences} · 通行凭证 {value.passageTokens}</p> : null}
      {selectedItem && !items.some(item => item.id === selectedItem) ? <p role="status" className={styles.notice}>链接中的物品尚未拥有或已变化，请从自己的物品中选择；不会按无效链接提交操作。</p> : null}
      <label className={styles.field}>选择已收录物品 <select aria-label="成长工坊物品" value={selected} onChange={event => { setSelection(event.target.value); setConfirmation(null); setUpgrading(false); onSelectItem?.(event.target.value); }}>{items.map(item => <option key={item.id} value={item.id}>{(item.id.startsWith('w') ? DEMON_TOWER_WEAPONS : DEMON_TOWER_SKILLS).find(entry => entry.id === item.id)?.name}</option>)}</select></label>
      {owned && definition ? <>
        <p>{rarity} · {definition.name} +{owned.quality}{advanced ? ` · ${star}/5星 · 熟练度 ${owned.favor ?? 0}/${star * 15} · 暂存品质经验 ${owned.qualityExperience ?? 0}` : ` · 同名副本 ${owned.spareCopies}`}</p>
        {advanced ? <p className={styles.muted}>当前境界最高 +{demonTowerQualityLimit(rarity, profile.level)}，旧有更高强化保留。新重复自动变为品质经验，达境界后自动兑现；既有副本完整迁移，不丢弃。技能每星效果+8%，施放和被动生效都可累积熟练度。</p> : null}
        {advanced && ownedWeapon ? <p>突破 {ownedWeapon.breakthrough ?? 0} 次 · +3/+6/+9开放词条：{ownedWeapon.affixes?.map(key => `${DEMON_TOWER_AFFIXES[key].name}（${DEMON_TOWER_AFFIXES[key].description}）`).join('、') || '尚未开放'}。每次突破主维+3、相邻第二主维+4；精→灵→仙→神需要更高等级、精魄和矿石。</p> : null}
        {advanced && ultimate ? <p className={styles.notice}>{ultimate.name}：{ultimate.description} 当前{star >= 5 ? '已激活' : '需5星'}。</p> : null}
        {progressItem ? <DemonTowerUpgradePreview item={progressItem} showStars={advanced} /> : null}
        <div className={styles.buttonRow}>
          <button className={styles.button} type="button" disabled={!can('upgrade')} onClick={() => setUpgrading(true)}>品质强化 +N</button>
          {advanced ? <>
          <button className={styles.button} type="button" disabled={!can('star_up') || star >= 5 || profile.materials.soul < RULES.starCharmSoul} onClick={() => ask('残魂升星', `${progress?.star ?? ''}消耗40残魂，本次成功率${Math.round((RULES.starSuccess[star - 1] ?? 0) * 100)}%。失败保留星级和熟练度，不降星；成功后新星级熟练度从0开始。也可完全依靠使用熟练度免费升星。`, { kind: 'star_up', payload: { itemType: kind, itemId: owned.id } })}>残魂升星 · 40残魂</button>
          {ownedWeapon && rarity !== '神' ? <button className={styles.button} type="button" disabled={!can('breakthrough')} onClick={() => ask(`突破${definition.name}`, '精→灵需Lv31、+5、4精魄与20矿石；灵→仙需Lv46、+5、6精魄与30矿石；仙→神需Lv61、+5、8精魄与40矿石。服务器检查材料与门槛，不足不会扣除。', { kind: 'breakthrough', payload: { itemId: ownedWeapon.id } })}>稀有度突破</button> : null}
          <button className={styles.button} type="button" disabled={!can('market') || (owned.qualityExperience ?? 0) < 1} onClick={() => ask('兑换暂存品质经验', '将1点尚未兑现的品质经验换成3残魂。这会减少未来可兑现的强化次数；装备、现有星级和品质均保留。', { kind: 'market', payload: { offer: 'recycle_quality', itemId: owned.id } })}>1品质经验换3残魂</button>
          </> : null}
        </div>
        {score ? <details style={{ marginTop: 12 }}><summary>强度设计评级 T{score.tier} · {score.score}/100</summary><p>数值贡献 {score.numeric}×35% + 常驻增益 {score.permanent}×25% + 功能 {score.utility}×25% + 泛用 {score.breadth}×15%。这是公开可复算的设计量表，不是实战DPS实测；不按稀有度直接冒充综合强度，也不改变已公示单品掉落权重。</p></details> : null}
      </> : null}
    </TowerPanel>
    {advanced ? <DemonTowerGuide profile={profile} /> : null}
    {upgrading && owned && definition && cost ? <TowerModal title={`品质强化${definition.name}`} onClose={() => setUpgrading(false)} footer={<div className={styles.actionsRight}><button type="button" className={styles.button} disabled={disabled} onClick={() => setUpgrading(false)}>暂不强化</button><button type="button" className={styles.primary} disabled={!can('upgrade') || !cost.available || !materialsEnough} onClick={() => { void onAction({ kind: 'upgrade', payload: { itemType: kind, itemId: owned.id } }).then(success => { if (success) setUpgrading(false); }); }}>确认强化至 +{owned.quality + 1}</button></div>}>
      <p>当前 +{owned.quality} → +{owned.quality + 1}。品质强化必定成功，重复副本优先用于品质强化，不需要办公币。</p>
      {progress ? <p className={styles.notice}>{progress.quality}</p> : null}
      {cost.reason === 'max_quality' ? <p className={styles.notice}>已达到品质上限，剩余副本会保留。</p> : cost.reason === 'level_required' ? <p className={styles.notice}>下次品质强化需要角色 Lv{cost.requiredLevel}，你当前为 Lv{profile.level}。</p> : null}
      {cost.spareCopies ? <p className={styles.notice}>消耗同名副本 ×1，当前拥有 {owned.spareCopies} 份。不额外消耗材料。</p> : <div className={styles.resourceList}>{Object.entries(cost.materials).filter(([, amount]) => amount > 0).map(([key, amount]) => <div className={styles.resource} key={key}><strong>{amount}</strong><small>{DEMON_TOWER_CATALOG.materials[key as keyof typeof profile.materials]} · 持有 {profile.materials[key as keyof typeof profile.materials]}</small></div>)}</div>}
      {!materialsEnough ? <p className={styles.error}>当前绑定材料不足，先探索收集，再来强化。</p> : null}
    </TowerModal> : null}
    {confirmation ? <TowerModal title={confirmation.title} onClose={() => setConfirmation(null)} footer={<div className={styles.actionsRight}><button type="button" className={styles.button} disabled={disabled} onClick={() => setConfirmation(null)}>取消</button><button type="button" className={styles.primary} disabled={!can(confirmation.action.kind)} onClick={() => void onAction(confirmation.action).then(ok => { if (ok) setConfirmation(null); })}>{confirmation.action.kind === 'star_up' ? '确认消耗残魂升星' : confirmation.action.kind === 'breakthrough' ? '确认稀有度突破' : '确认回收品质经验'}</button></div>}><p>{confirmation.text}</p><p className={styles.muted}>操作由服务器幂等保存；网络不确定时先确认原操作，不会自动再次扣除。</p></TowerModal> : null}
  </div>;
}
