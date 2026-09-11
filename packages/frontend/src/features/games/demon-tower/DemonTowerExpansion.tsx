import { useState, type JSX } from 'react';
import { DEMON_TOWER_AFFIXES, DEMON_TOWER_EXPANSION_RULES, DEMON_TOWER_SKILLS, DEMON_TOWER_WEAPONS, DEMON_TOWER_ULTIMATES,
  demonTowerItemRarity, demonTowerQualityLimit, demonTowerStrengthRating,
  type DemonTowerAction, type DemonTowerProfileView, type DemonTowerWorldView } from '@stealth-reader/shared';
import { TowerModal, TowerPanel } from './TowerElements';
import styles from './DemonTower.module.css';

const RULES = DEMON_TOWER_EXPANSION_RULES;
export const demonTowerExpansionUIEnabled = import.meta.env.VITE_DEMON_TOWER_EXPANSION_ENABLED === 'true';
type Props = { profile: DemonTowerProfileView; world: DemonTowerWorldView; disabled: boolean; onAction: (action: DemonTowerAction) => Promise<boolean>; onContinueBattle?: () => void; onSupplies?: () => void };

/** Uses the same versioned, uncertain-result-aware action queue as ordinary exploration. */
export function DemonTowerExpansion({ profile, disabled, onAction, onContinueBattle, onSupplies }: Props): JSX.Element | null {
  const [confirmation, setConfirmation] = useState<{ title: string; text: string; action: DemonTowerAction } | null>(null);
  const [selected, setSelected] = useState('w1');
  const value = profile.expansion;
  if (!value) return <TowerPanel title="秘境工坊"><p className={styles.notice}>扩展任务正在维护或尚未启用，已有角色与装备保留；普通探索仍可从探索任务页操作。</p></TowerPanel>;
  const can = (kind: DemonTowerAction['kind']) => !disabled && profile.availableActions.includes(kind);
  const ask = (title: string, text: string, action: DemonTowerAction) => setConfirmation({ title, text, action });
  const launch = (mode: 'rift' | 'weekly_boss') => void onAction({ kind: 'expedition', payload: { mode } }).then(ok => { if (ok) onContinueBattle?.(); });
  const ownedWeapon = profile.weapons.find(item => item.id === selected), ownedSkill = profile.skills.find(item => item.id === selected);
  const owned = ownedWeapon ?? ownedSkill;
  const kind = ownedWeapon ? 'weapon' : 'skill';
  const definition = (ownedWeapon ? DEMON_TOWER_WEAPONS : DEMON_TOWER_SKILLS).find(item => item.id === selected);
  const rarity = definition ? demonTowerItemRarity(definition.rarity, ownedWeapon?.breakthrough) : '凡';
  const score = definition ? demonTowerStrengthRating(kind, definition.id) : null;
  const ultimate = ownedWeapon ? DEMON_TOWER_ULTIMATES[ownedWeapon.id] : null;
  const star = owned?.star ?? 1;
  return <div className={styles.stack}>
    <TowerPanel title="秘境与灵气任务" detail={<span className={styles.badge}>账号存档 · 全程免费</span>}>
      <p className={styles.muted}>这里集中副本与成长打造；补给、残魂兑换和符文使用统一在「物资申领」。三个独立获取来源不改普通探索保底，秘境和周常可逐回合操作、刷新续战；失败不发装备，不回退次数。</p>
      {onSupplies ? <button type="button" className={styles.button} onClick={onSupplies}>前往物资申领</button> : null}
      {profile.battle && onContinueBattle ? <p className={styles.notice}>你有一场已保存的战斗。<button className={styles.textButton} type="button" onClick={onContinueBattle}>返回战斗现场</button></p> : null}
      <div className={styles.resourceList}><div className={styles.resource}><strong>{value.skillPages}</strong><small>技能残页</small></div><div className={styles.resource}><strong>{value.essences}</strong><small>妖塔精魄</small></div><div className={styles.resource}><strong>{value.passageTokens}</strong><small>通行凭证</small></div></div>
      <div className={styles.itemGrid} style={{ marginTop: 16 }}>
        <article className={styles.item}><h3>小秘境</h3><p>强化敌人和助灵；胜利获得武器、技能各一件，另有2残页和1精魄。武器池精/灵/仙/神权重30/30/25/15，等级筛选后归一。</p><p>今日 {value.riftsToday}/{RULES.riftsPerDay} · {RULES.riftCost}体力</p><button className={styles.button} type="button" disabled={!can('expedition') || profile.hp <= 0 || profile.stamina < RULES.riftCost || value.riftsToday >= RULES.riftsPerDay} onClick={() => launch('rift')}>进入小秘境</button></article>
        <article className={styles.item}><h3>灵气修炼点</h3><p>必得一件符合等级的技能和1—3残页，不掉武器。技能池凡/精/灵/仙权重30/30/25/15。</p><p>今日 {value.meditationsToday}/{RULES.meditationsPerDay} · {RULES.meditationCost}体力</p><button className={styles.button} type="button" disabled={!can('expedition') || profile.stamina < RULES.meditationCost || value.meditationsToday >= RULES.meditationsPerDay} onClick={() => void onAction({ kind: 'expedition', payload: { mode: 'meditate' } })}>前往灵气点</button></article>
        <article className={styles.item}><h3>周常守关者</h3><p>独立个人副本，世界通关后仍可挑战；胜利双物品、3残页、3精魄。神武器权重由10提高至15，全部权重重新归一，不影响全服血池/日榜。</p><p>本周 {value.weeklyBossAttempts}/{RULES.weeklyBossPerWeek} · {RULES.weeklyBossCost}体力 · 周一北京时间重置</p><button className={styles.button} type="button" disabled={!can('expedition') || profile.hp <= 0 || profile.stamina < RULES.weeklyBossCost || value.weeklyBossAttempts >= RULES.weeklyBossPerWeek} onClick={() => launch('weekly_boss')}>挑战周常守关者</button></article>
      </div>
    </TowerPanel>
    <TowerPanel title="星级、词条与突破工坊">
      <label>选择已收录物品 <select aria-label="成长工坊物品" value={selected} onChange={event => setSelected(event.target.value)}>{[...profile.weapons, ...profile.skills].map(item => <option key={item.id} value={item.id}>{(item.id.startsWith('w') ? DEMON_TOWER_WEAPONS : DEMON_TOWER_SKILLS).find(entry => entry.id === item.id)?.name}</option>)}</select></label>
      {owned && definition ? <>
        <p>{rarity} · {definition.name} +{owned.quality} · {star}/5星 · 熟练度 {owned.favor ?? 0}/{star * 15} · 暂存品质经验 {owned.qualityExperience ?? 0}</p>
        <p className={styles.muted}>当前境界最高 +{demonTowerQualityLimit(rarity, profile.level)}，旧有更高强化保留。新重复自动变为品质经验，达境界后自动兑现；既有副本完整迁移，不丢弃。技能每星效果+8%，施放和被动生效都可累积熟练度。</p>
        {ownedWeapon ? <p>突破 {ownedWeapon.breakthrough ?? 0} 次 · +3/+6/+9开放词条：{ownedWeapon.affixes?.map(key => `${DEMON_TOWER_AFFIXES[key].name}（${DEMON_TOWER_AFFIXES[key].description}）`).join('、') || '尚未开放'}。每次突破主维+3、相邻第二主维+4；精→灵→仙→神需要更高等级、精魄和矿石。</p> : null}
        {ultimate ? <p className={styles.notice}>{ultimate.name}：{ultimate.description} 当前{star >= 5 ? '已激活' : '需5星'}。</p> : null}
        <div className={styles.buttonRow}>
          <button className={styles.button} type="button" disabled={!can('star_up') || star >= 5 || profile.materials.soul < RULES.starCharmSoul} onClick={() => ask('使用免费升星符', `消耗40残魂，本次成功率${Math.round((RULES.starSuccess[star - 1] ?? 0) * 100)}%。失败保留星级和熟练度，不降星；成功后新星级熟练度从0开始。也可完全依靠使用熟练度免费升星。`, { kind: 'star_up', payload: { itemType: kind, itemId: owned.id } })}>升星符 · 40残魂</button>
          {ownedWeapon && rarity !== '神' ? <button className={styles.button} type="button" disabled={!can('breakthrough')} onClick={() => ask(`突破${definition.name}`, '精→灵需Lv31、+5、4精魄与20矿石；灵→仙需Lv46、+5、6精魄与30矿石；仙→神需Lv61、+5、8精魄与40矿石。服务器检查材料与门槛，不足不会扣除。', { kind: 'breakthrough', payload: { itemId: ownedWeapon.id } })}>品质突破</button> : null}
          <button className={styles.button} type="button" disabled={!can('market') || (owned.qualityExperience ?? 0) < 1} onClick={() => ask('兑换暂存品质经验', '将1点尚未兑现的品质经验换成3残魂。这会减少未来可兑现的强化次数；装备、现有星级和品质均保留。', { kind: 'market', payload: { offer: 'recycle_quality', itemId: owned.id } })}>1品质经验换3残魂</button>
        </div>
        {score ? <details style={{ marginTop: 12 }}><summary>强度设计评级 T{score.tier} · {score.score}/100</summary><p>数值贡献 {score.numeric}×35% + 常驻增益 {score.permanent}×25% + 功能 {score.utility}×25% + 泛用 {score.breadth}×15%。这是公开可复算的设计量表，不是实战DPS实测；不按稀有度直接冒充综合强度，也不改变已公示单品掉落权重。</p></details> : null}
      </> : null}
    </TowerPanel>
    {confirmation ? <TowerModal title={confirmation.title} onClose={() => setConfirmation(null)} footer={<div className={styles.actionsRight}><button type="button" className={styles.button} disabled={disabled} onClick={() => setConfirmation(null)}>取消</button><button type="button" className={styles.primary} disabled={!can(confirmation.action.kind)} onClick={() => void onAction(confirmation.action).then(ok => { if (ok) setConfirmation(null); })}>确认兑换</button></div>}><p>{confirmation.text}</p><p className={styles.muted}>操作由服务器幂等保存；网络不确定时先确认原操作，不会自动再次扣除。</p></TowerModal> : null}
  </div>;
}
