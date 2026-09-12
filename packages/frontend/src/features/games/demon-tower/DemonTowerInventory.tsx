import { useEffect, useRef, useState, type JSX } from 'react';
import { demonTowerItemDropPercent, demonTowerItemRarity, demonTowerUpgradeCost, type DemonTowerAction, type DemonTowerCatalog, type DemonTowerLoadout, type DemonTowerOwnedWeapon, type DemonTowerProfileView, type DemonTowerSkillDefinition, type DemonTowerWeaponDefinition } from '@stealth-reader/shared';

import { DemonTowerLootGuide } from './DemonTowerGrowth';
import { TowerIcon, TowerWeaponArt } from './DemonTowerArt';
import { TowerModal, TowerPanel } from './TowerElements';
import styles from './DemonTower.module.css';

type ItemDetail = { type: 'weapon'; definition: DemonTowerWeaponDefinition } | { type: 'skill'; definition: DemonTowerSkillDefinition };

export function DemonTowerInventory({ profile, catalog, disabled, onAction, onWorkshop }: { profile: DemonTowerProfileView; catalog: DemonTowerCatalog; disabled: boolean; onAction: (action: DemonTowerAction) => Promise<boolean>; onWorkshop?: () => void }): JSX.Element {
  const [draft, setDraft] = useState<DemonTowerLoadout>(() => structuredClone(profile.loadout));
  const serverSignature = JSON.stringify(profile.loadout);
  const previousSignature = useRef(serverSignature);
  const draftRef = useRef(draft); draftRef.current = draft;
  const [conflict, setConflict] = useState(false);
  const [category, setCategory] = useState<'weapons' | 'skills'>('weapons');
  const [showAll, setShowAll] = useState(false);
  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const [upgrade, setUpgrade] = useState<ItemDetail | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== serverSignature;
  const canEquip = !disabled && profile.availableActions.includes('equip');
  const canUpgrade = !disabled && profile.availableActions.includes('upgrade');

  useEffect(() => {
    if (previousSignature.current === serverSignature) return;
    const drafted = JSON.stringify(draftRef.current);
    if (drafted !== previousSignature.current && drafted !== serverSignature) setConflict(true);
    else { setDraft(structuredClone(profile.loadout)); setConflict(false); }
    previousSignature.current = serverSignature;
  }, [serverSignature, profile.loadout]);

  const reset = (): void => { setDraft(structuredClone(profile.loadout)); setConflict(false); setLocalError(null); };
  const selectSkill = (skill: DemonTowerSkillDefinition): void => {
    if (!canEquip) return;
    const slot = skill.kind === 'active' ? 'activeSkills' : 'passiveSkills';
    const limit = skill.kind === 'active' ? catalog.rules.activeSkillSlots : catalog.rules.passiveSkillSlots;
    if (!draft[slot].includes(skill.id) && draft[slot].length >= limit) { setLocalError(`最多装配 ${limit} 个${skill.kind === 'active' ? '主动' : '被动'}技能，请先卸下一个。`); return; }
    setDraft({ ...draft, [slot]: draft[slot].includes(skill.id) ? draft[slot].filter((id) => id !== skill.id) : [...draft[slot], skill.id] });
    setLocalError(null);
  };
  const reorder = (index: number, change: -1 | 1): void => {
    const next = [...draft.activeSkills]; const target = index + change;
    if (target < 0 || target >= next.length || !canEquip) return;
    [next[index], next[target]] = [next[target], next[index]]; setDraft({ ...draft, activeSkills: next });
  };
  const selectWeapon = (weapon: DemonTowerWeaponDefinition, slot: 'mainHand' | 'artifact'): void => {
    if (!canEquip) return;
    if (slot === 'artifact' && draft.mainHand === weapon.id) { setLocalError('这件法器已经作为主手，不能重复占用辅助槽位。请先更换主手。'); return; }
    if (slot === 'mainHand' && draft.artifact === weapon.id) {
      setDraft({ ...draft, mainHand: weapon.id, artifact: null });
      setLocalError('已将这件法器改为主手，并从辅助槽位卸下；保存后生效，不会重复计算加成。');
    } else { setDraft({ ...draft, [slot]: weapon.id }); setLocalError(null); }
  };
  const currentUpgrade = upgrade ? (upgrade.type === 'weapon' ? profile.weapons : profile.skills).find((item) => item.id === upgrade.definition.id) : null;
  const cost = upgrade && currentUpgrade ? demonTowerUpgradeCost(upgrade.type, upgrade.definition.id, currentUpgrade.quality, currentUpgrade.spareCopies, profile.level, currentUpgrade.levelExempt ?? !profile.growth, profile.expansion ? demonTowerItemRarity(upgrade.definition.rarity, upgrade.type === 'weapon' ? (currentUpgrade as DemonTowerOwnedWeapon).breakthrough : 0) : undefined) : null;
  const materialsEnough = cost ? Object.entries(cost.materials).every(([key, value]) => profile.materials[key as keyof typeof profile.materials] >= value) : false;
  const main = catalog.weapons.find((weapon) => weapon.id === draft.mainHand);
  const artifact = catalog.weapons.find((weapon) => weapon.id === draft.artifact);
  const visibleWeapons = catalog.weapons.filter((weapon) => showAll || profile.weapons.some((item) => item.id === weapon.id));
  const visibleSkills = catalog.skills.filter((skill) => showAll || profile.skills.some((item) => item.id === skill.id));

  return <div className={styles.stack}>
    <TowerPanel title="当前配装" detail={<span className={styles.badge}>{dirty ? '有未保存调整' : '已与服务器同步'}</span>}>
      {profile.battle ? <p className={styles.notice}>战斗中不能调整配装或品质强化。可以先查阅图鉴，完成或撤离后再更换。</p> : null}
      {conflict ? <p className={styles.error} role="alert">配装刚刚在其他页面发生变化。为避免覆盖，请先<button className={styles.textButton} type="button" onClick={reset}>读取最新配装</button>，再重新调整。</p> : null}
      {localError ? <p className={styles.error} role="alert">{localError}</p> : null}
      <div className={styles.twoColumns}>
        <div className={styles.loadoutSlots}>
          <div className={styles.loadoutSlot}><TowerWeaponArt weaponId={main?.id} label="主手武器" className={styles.itemArt} /><div><strong>{main?.name ?? '未装备主手'}</strong><small>主手 · {main?.type ?? '从图鉴选择'}</small></div></div>
          <div className={styles.loadoutSlot}><TowerWeaponArt weaponId={artifact?.id} label="辅助法器" className={styles.itemArt} /><div><strong>{artifact?.name ?? '未装配法器'}</strong><small>法器独立槽位</small></div>{draft.artifact ? <button className={styles.iconButton} type="button" aria-label="卸下法器" disabled={!canEquip} onClick={() => setDraft({ ...draft, artifact: null })}><TowerIcon name="close" /></button> : null}</div>
          <p className={styles.muted}>五类武器都可作为主手；辅助槽位仅可放法器，且不能与主手重复。调整不消耗办公币，保存后才生效。</p>
        </div>
        <div className={styles.loadoutSlots}>
          {Array.from({ length: catalog.rules.activeSkillSlots }, (_, index) => { const id = draft.activeSkills[index]; const skill = catalog.skills.find((item) => item.id === id); return <div key={index} className={styles.loadoutSlot}><span className={styles.slotNumber}>{String(index + 1).padStart(2, '0')}</span><div><strong>{skill?.name ?? '空主动技能位'}</strong><small>{skill ? `首领自动战斗第 ${index + 1} 优先 · 基础冷却 ${skill.cooldown} 回合` : '从下方选择主动技能'}</small></div>{id ? <><button type="button" className={styles.iconButton} aria-label={`${skill?.name}优先级上移`} disabled={!canEquip || index === 0} onClick={() => reorder(index, -1)}>↑</button><button type="button" className={styles.iconButton} aria-label={`卸下${skill?.name}`} disabled={!canEquip} onClick={() => setDraft({ ...draft, activeSkills: draft.activeSkills.filter((item) => item !== id) })}><TowerIcon name="close" /></button></> : null}</div>; })}
          <div className={styles.effects}>{Array.from({ length: catalog.rules.passiveSkillSlots }, (_, index) => { const id = draft.passiveSkills[index]; const skill = catalog.skills.find((item) => item.id === id); return <span className={styles.badge} key={index}>{skill?.name ?? `空被动位 ${index + 1}`}{id ? <button type="button" className={styles.textButton} aria-label={`卸下${skill?.name}`} disabled={!canEquip} onClick={() => setDraft({ ...draft, passiveSkills: draft.passiveSkills.filter((item) => item !== id) })}>×</button> : null}</span>; })}</div>
        </div>
      </div>
      <div className={styles.actionsRight} style={{ marginTop: 18 }}><button className={styles.button} type="button" disabled={disabled || !dirty} onClick={reset}>还原调整</button><button className={styles.primary} type="button" disabled={!canEquip || !dirty || conflict} onClick={() => { void onAction({ kind: 'equip', payload: structuredClone(draft) }).then((success) => { if (success) { setLocalError(null); setConflict(false); } }); }}>保存配装</button></div>
    </TowerPanel>
    <div className={styles.cultivationGuide} aria-label="装备培养入口"><p><strong>品质强化 +N</strong> 在下方物品卡片操作；星级熟练度与品质独立成长。{onWorkshop ? <small>残魂升星、武器稀有度突破与品质经验回收在秘境工坊。切换页签保留未保存配装，只有“保存配装”才提交。</small> : null}</p>{onWorkshop ? <button type="button" className={styles.button} onClick={onWorkshop}>前往升星与突破</button> : null}</div>
    <DemonTowerLootGuide profile={profile} />
    <TowerPanel title="物品档案" detail={<span className={styles.muted}>20 件武器 · 16 种技能</span>}>
      <div className={styles.itemCategory} aria-label="图鉴筛选"><button type="button" aria-pressed={category === 'weapons'} onClick={() => setCategory('weapons')}>武器 / 法器</button><button type="button" aria-pressed={category === 'skills'} onClick={() => setCategory('skills')}>技能</button><button type="button" aria-pressed={showAll} onClick={() => setShowAll((value) => !value)}>{showAll ? '切回已拥有' : '查看完整图鉴'}</button></div>
      {category === 'weapons' ? <div className={styles.itemGrid}>{visibleWeapons.map((weapon) => { const owned = profile.weapons.find((item) => item.id === weapon.id); const selected = draft.mainHand === weapon.id || draft.artifact === weapon.id; const exempt = Boolean(owned && (owned.levelExempt ?? !profile.growth)); const locked = profile.level < weapon.requiredLevel && !exempt; return <article className={styles.item} key={weapon.id} data-selected={selected} data-owned={Boolean(owned)}><div className={styles.itemTop}><TowerWeaponArt weaponId={weapon.id} label={weapon.name} className={styles.itemArt} /><div><h3>{weapon.name}{owned ? ` +${owned.quality}` : ''}</h3><span className={styles.itemMeta}>{weapon.rarity} · {weapon.type} · 获取 Lv{weapon.dropLevel ?? weapon.requiredLevel} / 装备 Lv{weapon.requiredLevel}{owned ? ` · 副本 ${owned.spareCopies}` : ' · 尚未获得'}</span></div></div><p className={styles.itemDescription}>{weapon.description}</p>{exempt ? <p className={styles.muted}>{catalog.starter.weapons.includes(weapon.id) ? "训练赠送可用：这件基础武器不受装备等级限制。" : "旧藏可用：更新前已拥有，保留原使用资格。"}</p> : null}{owned ? <div className={styles.notice}><strong>{owned.star ?? 1} / 5 星 · 品质 +{owned.quality} 独立保留</strong><p style={{ margin: "4px 0" }}>{(owned.star ?? 1) >= 5 ? "熟练度已满，作为主手时普通攻击/连击伤害+40%。" : `熟练度 ${owned.favor ?? 0} / ${(owned.star ?? 1) * 15} · 达标免费升星`}</p><progress aria-label={`${weapon.name}升星熟练度`} value={(owned.star ?? 1) >= 5 ? 1 : owned.favor ?? 0} max={(owned.star ?? 1) >= 5 ? 1 : (owned.star ?? 1) * 15} /></div> : null}<div className={styles.buttonRow}><button type="button" className={styles.button} disabled={!canEquip || !owned || locked || draft.mainHand === weapon.id} onClick={() => selectWeapon(weapon, 'mainHand')}>{draft.mainHand === weapon.id ? '当前主手' : locked ? `需要 Lv${weapon.requiredLevel}` : '选作主手'}</button>{weapon.type === '法器' ? <button type="button" className={styles.button} disabled={!canEquip || !owned || locked || draft.artifact === weapon.id || draft.mainHand === weapon.id} onClick={() => selectWeapon(weapon, 'artifact')}>{draft.artifact === weapon.id ? '当前辅助' : draft.mainHand === weapon.id ? '主手不可重复' : '装配辅助'}</button> : null}<button type="button" className={styles.button} disabled={!canUpgrade || !owned} onClick={() => setUpgrade({ type: 'weapon', definition: weapon })}>品质强化</button><button type="button" className={styles.textButton} onClick={() => setDetail({ type: 'weapon', definition: weapon })}>详情</button></div></article>; })}</div> : <div className={styles.itemGrid}>{visibleSkills.map((skill) => { const owned = profile.skills.find((item) => item.id === skill.id); const selected = (skill.kind === 'active' ? draft.activeSkills : draft.passiveSkills).includes(skill.id); const exempt = Boolean(owned && (owned.levelExempt ?? !profile.growth)); const locked = profile.level < skill.requiredLevel && !exempt; return <article className={styles.item} key={skill.id} data-selected={selected} data-owned={Boolean(owned)}><div className={styles.itemTop}><TowerIcon name={skill.category === '回复' ? 'heart' : skill.category === '维度' ? 'shield' : 'energy'} className={styles.itemArt} /><div><h3>{skill.name}{owned ? ` +${owned.quality}` : ''}</h3><span className={styles.itemMeta}>{skill.rarity} · {skill.kind === 'active' ? '主动' : '被动'} · Lv{skill.requiredLevel}{owned ? ` · 副本 ${owned.spareCopies}` : ' · 尚未获得'}</span></div></div><p className={styles.itemDescription}>{skill.description}</p>{exempt && profile.level < skill.requiredLevel ? <p className={styles.muted}>旧藏可用：原有技能保留学习和装配资格。</p> : null}<div className={styles.buttonRow}><button type="button" className={styles.button} disabled={!canEquip || !owned || locked} onClick={() => selectSkill(skill)}>{selected ? '从配装卸下' : locked ? `需要 Lv${skill.requiredLevel}` : '加入配装'}</button><button type="button" className={styles.button} disabled={!canUpgrade || !owned} onClick={() => setUpgrade({ type: 'skill', definition: skill })}>品质强化</button><button type="button" className={styles.textButton} onClick={() => setDetail({ type: 'skill', definition: skill })}>详情</button></div></article>; })}</div>}
      {(category === 'weapons' ? visibleWeapons : visibleSkills).length === 0 ? <p className={styles.empty}>暂时没有这一类物品。探索后可以继续收集，也可以切换完整图鉴查看效果。</p> : null}
    </TowerPanel>
    {detail ? <TowerModal title={detail.definition.name} onClose={() => setDetail(null)}><span className={styles.badge}>{detail.definition.rarity} · Lv{detail.definition.requiredLevel} · 品质上限 +{detail.definition.qualityCap}</span><p style={{ marginTop: 18 }}>{detail.definition.description}</p><p className={styles.muted}>获取 Lv{detail.definition.dropLevel ?? detail.definition.requiredLevel} · {detail.type === "weapon" ? "装备" : "学习"} Lv{detail.definition.requiredLevel} · T{detail.definition.tier}（按稀有度标记，并非强度评分）</p><p className={styles.muted}>当前等级常规条件概率：{demonTowerItemDropPercent(detail.type, detail.definition.id, profile.level).toFixed(2)}%。分母是已确定{detail.type === "weapon" ? "武器" : "技能"}掉落且无保底干预的次数；未达获取等级为0%。</p>{detail.type === 'weapon' ? <p className={styles.muted}>类型：{detail.definition.type}；主属性：{catalog.attributes[detail.definition.attribute]}。基础加成 {detail.definition.baseBonus}，实际总属性以保存后的人物档案为准。</p> : <p className={styles.muted}>{detail.definition.kind === 'active' ? `主动技能，基础冷却 ${detail.definition.cooldown} 回合。` : '被动技能，装入被动槽位后生效。'}技能描述为基础规则，品质提升与战斗状态均以服务端战报为准。</p>}</TowerModal> : null}
    {upgrade && currentUpgrade && cost ? <TowerModal title={`品质强化${upgrade.definition.name}`} onClose={() => setUpgrade(null)} footer={<div className={styles.actionsRight}><button type="button" className={styles.button} disabled={disabled} onClick={() => setUpgrade(null)}>暂不强化</button><button type="button" className={styles.primary} disabled={!canUpgrade || !cost.available || !materialsEnough} onClick={() => { void onAction({ kind: 'upgrade', payload: { itemType: upgrade.type, itemId: upgrade.definition.id } }).then((success) => { if (success) setUpgrade(null); }); }}>确认强化至 +{currentUpgrade.quality + 1}</button></div>}><p>当前 +{currentUpgrade.quality} → +{currentUpgrade.quality + 1}。品质强化必定成功，重复副本优先用于品质强化，不需要办公币。</p>{cost.reason === 'max_quality' ? <p className={styles.notice}>已达到品质上限，剩余副本会保留。</p> : cost.reason === 'level_required' ? <p className={styles.notice}>下次品质强化需要角色 Lv{cost.requiredLevel}，你当前为 Lv{profile.level}。</p> : null}{cost.spareCopies ? <p className={styles.notice}>消耗同名副本 ×1，当前拥有 {currentUpgrade.spareCopies} 份。不额外消耗材料。</p> : <div className={styles.resourceList}>{Object.entries(cost.materials).filter(([, value]) => value > 0).map(([key, value]) => <div className={styles.resource} key={key}><TowerIcon name="material" /><strong>{value}</strong><small>{catalog.materials[key as keyof typeof catalog.materials]} · 持有 {profile.materials[key as keyof typeof profile.materials]}</small></div>)}</div>}{!materialsEnough ? <p className={styles.error}>当前绑定材料不足，先探索收集，再来强化。</p> : null}</TowerModal> : null}
  </div>;
}
