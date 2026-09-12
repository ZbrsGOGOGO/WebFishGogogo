import { useEffect, useRef, useState, type JSX } from 'react';
import { demonTowerItemDropPercent, demonTowerItemRarity, demonTowerQualityLimit, type DemonTowerAction, type DemonTowerCatalog, type DemonTowerLoadout, type DemonTowerProfileView, type DemonTowerSkillDefinition, type DemonTowerWeaponDefinition } from '@stealth-reader/shared';

import { DemonTowerLootGuide } from './DemonTowerGrowth';
import { TowerIcon, TowerWeaponArt } from './DemonTowerArt';
import { TowerModal, TowerPanel } from './TowerElements';
import { DemonTowerUpgradePreview, type DemonTowerProgressItem } from './DemonTowerUpgradePreview';
import styles from './DemonTower.module.css';
import compact from './DemonTowerInventory.module.css';

type ItemDetail = { type: 'weapon'; definition: DemonTowerWeaponDefinition } | { type: 'skill'; definition: DemonTowerSkillDefinition };
const PAGE_SIZE = 6;

export function DemonTowerInventory({ profile, catalog, disabled, onAction, onWorkshop }: { profile: DemonTowerProfileView; catalog: DemonTowerCatalog; disabled: boolean; onAction: (action: DemonTowerAction) => Promise<boolean>; onWorkshop?: (itemId?: string) => void }): JSX.Element {
  const [draft, setDraft] = useState<DemonTowerLoadout>(() => structuredClone(profile.loadout));
  const serverSignature = JSON.stringify(profile.loadout);
  const previousSignature = useRef(serverSignature);
  const draftRef = useRef(draft); draftRef.current = draft;
  const [conflict, setConflict] = useState(false);
  const [category, setCategory] = useState<'weapons' | 'skills'>('weapons');
  const [showAll, setShowAll] = useState(false);
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== serverSignature;
  const canEquip = !disabled && profile.availableActions.includes('equip');

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
  const main = catalog.weapons.find((weapon) => weapon.id === draft.mainHand);
  const artifact = catalog.weapons.find((weapon) => weapon.id === draft.artifact);
  const visibleWeapons = catalog.weapons.filter((weapon) => showAll || profile.weapons.some((item) => item.id === weapon.id));
  const visibleSkills = catalog.skills.filter((skill) => showAll || profile.skills.some((item) => item.id === skill.id));
  const totalItems = category === 'weapons' ? visibleWeapons.length : visibleSkills.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pageStart = currentPage * PAGE_SIZE;
  const changeCategory = (next: typeof category): void => { setCategory(next); setPage(0); };
  const detailOwnedWeapon = detail?.type === 'weapon' ? profile.weapons.find(item => item.id === detail.definition.id) : undefined;
  const detailOwnedSkill = detail?.type === 'skill' ? profile.skills.find(item => item.id === detail.definition.id) : undefined;
  const detailProgress: DemonTowerProgressItem | null = detail?.type === 'weapon' && detailOwnedWeapon
    ? { kind: 'weapon', definition: detail.definition, owned: detailOwnedWeapon }
    : detail?.type === 'skill' && detailOwnedSkill ? { kind: 'skill', definition: detail.definition, owned: detailOwnedSkill } : null;
  const detailRarity = detail?.type === 'weapon' && detailOwnedWeapon ? demonTowerItemRarity(detail.definition.rarity, detailOwnedWeapon.breakthrough) : detail?.definition.rarity;
  const detailQualityCap = detailRarity ? demonTowerQualityLimit(detailRarity, 120) : 0;

  return <div className={`${styles.stack} ${compact.inventory}`}>
    <TowerPanel title="当前配装" className={compact.loadoutPanel} detail={<span className={styles.badge}>{dirty ? '有未保存调整' : '已与服务器同步'}</span>}>
      {profile.battle ? <p className={styles.notice}>战斗中不能调整配装。可以先查阅图鉴，完成或撤离后再更换。</p> : null}
      {conflict ? <p className={styles.error} role="alert">配装刚刚在其他页面发生变化。为避免覆盖，请先<button className={styles.textButton} type="button" onClick={reset}>读取最新配装</button>，再重新调整。</p> : null}
      {localError ? <p className={styles.error} role="alert">{localError}</p> : null}
      <div className={compact.loadoutColumns}>
        <div className={styles.loadoutSlots}>
          <div className={styles.loadoutSlot}><TowerWeaponArt weaponId={main?.id} label="主手武器" className={styles.itemArt} /><div><strong>{main?.name ?? '未装备主手'}</strong><small>主手 · {main?.type ?? '从图鉴选择'}</small></div></div>
          <div className={styles.loadoutSlot}><TowerWeaponArt weaponId={artifact?.id} label="辅助法器" className={styles.itemArt} /><div><strong>{artifact?.name ?? '未装配法器'}</strong><small>法器独立槽位</small></div>{draft.artifact ? <button className={styles.iconButton} type="button" aria-label="卸下法器" disabled={!canEquip} onClick={() => setDraft({ ...draft, artifact: null })}><TowerIcon name="close" /></button> : null}</div>
          <p className={compact.hint}>主手可用五类武器，辅助仅法器且不重复。免费调整，保存后生效。</p>
        </div>
        <div className={styles.loadoutSlots}>
          {Array.from({ length: catalog.rules.activeSkillSlots }, (_, index) => { const id = draft.activeSkills[index]; const skill = catalog.skills.find((item) => item.id === id); return <div key={index} className={styles.loadoutSlot}><span className={styles.slotNumber}>{String(index + 1).padStart(2, '0')}</span><div><strong>{skill?.name ?? '空主动技能位'}</strong><small>{skill ? `首领自动战斗第 ${index + 1} 优先 · 基础冷却 ${skill.cooldown} 回合` : '从下方选择主动技能'}</small></div>{id ? <><button type="button" className={styles.iconButton} aria-label={`${skill?.name}优先级上移`} disabled={!canEquip || index === 0} onClick={() => reorder(index, -1)}>↑</button><button type="button" className={styles.iconButton} aria-label={`卸下${skill?.name}`} disabled={!canEquip} onClick={() => setDraft({ ...draft, activeSkills: draft.activeSkills.filter((item) => item !== id) })}><TowerIcon name="close" /></button></> : null}</div>; })}
          <div className={styles.effects}>{Array.from({ length: catalog.rules.passiveSkillSlots }, (_, index) => { const id = draft.passiveSkills[index]; const skill = catalog.skills.find((item) => item.id === id); return <span className={styles.badge} key={index}>{skill?.name ?? `空被动位 ${index + 1}`}{id ? <button type="button" className={styles.textButton} aria-label={`卸下${skill?.name}`} disabled={!canEquip} onClick={() => setDraft({ ...draft, passiveSkills: draft.passiveSkills.filter((item) => item !== id) })}>×</button> : null}</span>; })}</div>
        </div>
      </div>
      <div className={`${styles.actionsRight} ${compact.saveActions}`}><button className={styles.button} type="button" disabled={disabled || !dirty} onClick={reset}>还原调整</button><button className={styles.primary} type="button" disabled={!canEquip || !dirty || conflict} onClick={() => { void onAction({ kind: 'equip', payload: structuredClone(draft) }).then((success) => { if (success) { setLocalError(null); setConflict(false); } }); }}>保存配装</button></div>
    </TowerPanel>
    <details className={compact.collectionGuide}><summary>收集与培养说明</summary><DemonTowerLootGuide profile={profile} /></details>
    <TowerPanel title="物品档案" className={compact.catalogPanel} detail={<span className={styles.muted}>{catalog.weapons.length} 件武器 · {catalog.skills.length} 种技能</span>}>
      <div className={compact.toolbar} aria-label="图鉴筛选">
        <div className={styles.itemCategory}>
          <button type="button" aria-pressed={category === 'weapons'} onClick={() => changeCategory('weapons')}>武器 / 法器</button>
          <button type="button" aria-pressed={category === 'skills'} onClick={() => changeCategory('skills')}>技能</button>
          <button type="button" aria-pressed={showAll} onClick={() => { setShowAll(value => !value); setPage(0); }}>{showAll ? '切回已拥有' : '查看完整图鉴'}</button>
        </div>
        <span className={compact.count}>{showAll ? '完整图鉴' : '已拥有'} · 共 {totalItems} 件</span>
      </div>
      <div className={compact.grid} aria-label={category === 'weapons' ? '本页武器' : '本页技能'}>
        {category === 'weapons' ? visibleWeapons.slice(pageStart, pageStart + PAGE_SIZE).map(weapon => {
          const owned = profile.weapons.find(item => item.id === weapon.id);
          const selected = draft.mainHand === weapon.id || draft.artifact === weapon.id;
          const exempt = Boolean(owned && (owned.levelExempt ?? !profile.growth));
          const locked = profile.level < weapon.requiredLevel && !exempt;
          const rarity = profile.expansion && owned ? demonTowerItemRarity(weapon.rarity, owned.breakthrough) : weapon.rarity;
          return <article className={compact.card} key={weapon.id} aria-label={weapon.name} data-selected={selected} data-owned={Boolean(owned)}>
            <div className={compact.cardHeading}><TowerWeaponArt weaponId={weapon.id} label={weapon.name} className={compact.art} /><div><h3>{weapon.name}{owned ? ' +' + owned.quality : ''}</h3><span className={compact.meta}>{rarity} · {weapon.type} · 装备 Lv{weapon.requiredLevel}</span></div></div>
            {owned ? <><p className={compact.stats}><span aria-label={weapon.name + '星级'}>★ {owned.star ?? 1}/5</span><span>副本 {owned.spareCopies}</span>{owned.qualityExperience !== undefined ? <span>品质经验 {owned.qualityExperience}</span> : null}</p>
              <div className={compact.proficiency}><span>{(owned.star ?? 1) >= 5 ? '熟练度已满' : '熟练度 ' + (owned.favor ?? 0) + ' / ' + ((owned.star ?? 1) * 15)}</span><progress aria-label={weapon.name + '升星熟练度'} value={(owned.star ?? 1) >= 5 ? 1 : owned.favor ?? 0} max={(owned.star ?? 1) >= 5 ? 1 : (owned.star ?? 1) * 15} /></div>
            </> : <p className={compact.hint}>尚未获得 · 获取 Lv{weapon.dropLevel ?? weapon.requiredLevel}</p>}
            {exempt ? <p className={compact.eligibility}>{catalog.starter.weapons.includes(weapon.id) ? '训练赠送可用' : '旧藏可用'} · 保留装备资格</p> : null}
            <div className={compact.cardActions}>
              <button type="button" className={styles.button} disabled={!canEquip || !owned || locked || draft.mainHand === weapon.id} onClick={() => selectWeapon(weapon, 'mainHand')}>{draft.mainHand === weapon.id ? '当前主手' : locked ? '需要 Lv' + weapon.requiredLevel : '选作主手'}</button>
              {weapon.type === '法器' ? <button type="button" className={styles.button} disabled={!canEquip || !owned || locked || draft.artifact === weapon.id || draft.mainHand === weapon.id} onClick={() => selectWeapon(weapon, 'artifact')}>{draft.artifact === weapon.id ? '当前辅助' : draft.mainHand === weapon.id ? '主手不可重复' : '装配辅助'}</button> : null}
              {onWorkshop ? <button type="button" className={styles.button} disabled={!owned} onClick={() => onWorkshop(weapon.id)}>去养成</button> : null}
              <button type="button" className={styles.textButton} onClick={() => setDetail({ type: 'weapon', definition: weapon })}>详情</button>
            </div>
          </article>;
        }) : visibleSkills.slice(pageStart, pageStart + PAGE_SIZE).map(skill => {
          const owned = profile.skills.find(item => item.id === skill.id);
          const selected = (skill.kind === 'active' ? draft.activeSkills : draft.passiveSkills).includes(skill.id);
          const exempt = Boolean(owned && (owned.levelExempt ?? !profile.growth));
          const locked = profile.level < skill.requiredLevel && !exempt;
          return <article className={compact.card} key={skill.id} aria-label={skill.name} data-selected={selected} data-owned={Boolean(owned)}>
            <div className={compact.cardHeading}><TowerIcon name={skill.category === '回复' ? 'heart' : skill.category === '维度' ? 'shield' : 'energy'} className={compact.art} /><div><h3>{skill.name}{owned ? ' +' + owned.quality : ''}</h3><span className={compact.meta}>{skill.rarity} · {skill.kind === 'active' ? '主动' : '被动'} · Lv{skill.requiredLevel}</span></div></div>
            <p className={compact.stats}>{owned ? <>{owned.star !== undefined ? <span>★ {owned.star}/5</span> : null}{owned.favor !== undefined ? <span>熟练度 {owned.favor}</span> : null}<span>副本 {owned.spareCopies}</span>{owned.qualityExperience !== undefined ? <span>品质经验 {owned.qualityExperience}</span> : null}</> : <span>尚未获得 · 获取 Lv{skill.dropLevel ?? skill.requiredLevel}</span>}{skill.kind === 'active' ? <span>冷却 {skill.cooldown} 回合</span> : <span>被动槽生效</span>}</p>
            {exempt && profile.level < skill.requiredLevel ? <p className={compact.eligibility}>旧藏可用 · 保留学习和装配资格</p> : null}
            <div className={compact.cardActions}>
              <button type="button" className={styles.button} disabled={!canEquip || !owned || locked} onClick={() => selectSkill(skill)}>{selected ? '从配装卸下' : locked ? '需要 Lv' + skill.requiredLevel : '加入配装'}</button>
              {onWorkshop ? <button type="button" className={styles.button} disabled={!owned} onClick={() => onWorkshop(skill.id)}>去养成</button> : null}
              <button type="button" className={styles.textButton} onClick={() => setDetail({ type: 'skill', definition: skill })}>详情</button>
            </div>
          </article>;
        })}
      </div>
      {totalItems === 0 ? <p className={styles.empty}>暂时没有这一类物品。探索后可以继续收集，也可以切换完整图鉴查看效果。</p> : null}
      <nav className={compact.pagination} aria-label="物品档案分页">
        <button type="button" className={styles.button} disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>上一页</button>
        <span role="status" aria-label="物品分页进度">第 {currentPage + 1} / {totalPages} 页 · {totalItems ? pageStart + 1 : 0}–{Math.min(pageStart + PAGE_SIZE, totalItems)} / {totalItems} 件</span>
        <button type="button" className={styles.button} disabled={currentPage + 1 >= totalPages} onClick={() => setPage(currentPage + 1)}>下一页</button>
      </nav>
    </TowerPanel>
    {detail ? <TowerModal title={detail.definition.name} onClose={() => setDetail(null)}><span className={styles.badge}>{detailRarity} · Lv{detail.definition.requiredLevel} · 品质上限 +{detailQualityCap}</span><p style={{ marginTop: 18 }}>{detail.definition.description}</p>{detailProgress ? <DemonTowerUpgradePreview item={detailProgress} showStars={detail.type === 'weapon' ? detailOwnedWeapon?.star !== undefined : detailOwnedSkill?.star !== undefined} labelledBy={`${detail.definition.name}实际成长数值`} /> : null}<p className={styles.muted}>获取 Lv{detail.definition.dropLevel ?? detail.definition.requiredLevel} · {detail.type === "weapon" ? "装备" : "学习"} Lv{detail.definition.requiredLevel} · T{detail.definition.tier}（按稀有度标记，并非强度评分）</p><p className={styles.muted}>当前等级常规条件概率：{demonTowerItemDropPercent(detail.type, detail.definition.id, profile.level).toFixed(2)}%。分母是已确定{detail.type === "weapon" ? "武器" : "技能"}掉落且无保底干预的次数；未达获取等级为0%。</p>{detail.type === 'weapon' ? <p className={styles.muted}>类型：{detail.definition.type}；主属性：{catalog.attributes[detail.definition.attribute]}。基础加成 {detail.definition.baseBonus}，实际总属性以保存后的人物档案为准。</p> : <p className={styles.muted}>{detail.definition.kind === 'active' ? `主动技能，基础冷却 ${detail.definition.cooldown} 回合。` : '被动技能，装入被动槽位后生效。'}技能描述为基础规则，品质提升与战斗状态均以服务端战报为准。</p>}</TowerModal> : null}
  </div>;
}
