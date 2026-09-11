import { useState, type JSX } from 'react';
import { DEMON_TOWER_EXPANSION_RULES, DEMON_TOWER_SKILLS, type DemonTowerAction, type DemonTowerProfileView } from '@stealth-reader/shared';
import { TowerModal, TowerPanel } from './TowerElements';
import styles from './DemonTower.module.css';

const RULES = DEMON_TOWER_EXPANSION_RULES;
/** Historical offers retain their original prices, pools and pity, in the single supply workspace. */
export function DemonTowerLegacyMarket({ profile, disabled, onAction }: { profile: DemonTowerProfileView; disabled: boolean; onAction: (action: DemonTowerAction) => Promise<boolean> }): JSX.Element | null {
  const [confirmation, setConfirmation] = useState<{ title: string; text: string; action: DemonTowerAction } | null>(null);
  const value = profile.expansion;
  if (!value) return null;
  const can = (kind: DemonTowerAction['kind']) => !disabled && profile.availableActions.includes(kind);
  const ask = (title: string, text: string, action: DemonTowerAction) => setConfirmation({ title, text, action });
  const unavailable = [
    profile.level < 16 ? '武器箱需 Lv16。' : profile.materials.soul < RULES.weaponBoxSoul ? `武器箱需 ${RULES.weaponBoxSoul} 残魂，当前不足。` : '',
    profile.materials.soul < RULES.skillBoxSoul ? `技能箱需 ${RULES.skillBoxSoul} 残魂，当前不足。` : '',
    profile.materials.soul < RULES.enlightenmentSoul ? `悟性丹需 ${RULES.enlightenmentSoul} 残魂，当前不足。` : '',
    DEMON_TOWER_SKILLS.every(item => item.requiredLevel > profile.level || profile.skills.some(owned => owned.id === item.id)) ? '当前等级可学技能已集齐，悟性丹暂停兑换。' : '',
  ].filter(Boolean);
  return <>
    <TowerPanel title="传统兑换" detail={<span className={styles.badge}>只消耗塔内绑定残魂</span>}>
      <p>原有兑换保留价格与保底，与上方「精级武器箱」独立计数。不支持充值，不扣办公币。武器箱累计 {value.weaponBoxes} 个，本轮 {value.weaponBoxPity}/10；每第10箱必得灵以上，Lv16开始开放。技能箱附送残页×1。</p>
      {!can('market') ? <p className={styles.muted}>{profile.battle ? '当前战斗期间不能兑换，请先完成或撤离探索。' : '当前维护、托管或操作待确认，暂不能兑换。'}</p> : null}
      {unavailable.length ? <p className={styles.muted}>{unavailable.join(' ')}</p> : null}
      <div className={styles.buttonRow}>
        <button type="button" className={styles.button} disabled={!can('market') || profile.level < 16 || profile.materials.soul < RULES.weaponBoxSoul} onClick={() => ask('兑换武器箱', `消耗${RULES.weaponBoxSoul}残魂。精/灵/仙/神权重10/35/40/15，排除未达获取等级后归一；第10箱至少灵。`, { kind: 'market', payload: { offer: 'weapon_box' } })}>武器箱 · {RULES.weaponBoxSoul}残魂</button>
        <button type="button" className={styles.button} disabled={!can('market') || profile.materials.soul < RULES.skillBoxSoul} onClick={() => ask('兑换技能残页箱', `消耗${RULES.skillBoxSoul}残魂。获得技能×1及残页×1；技能凡/精/灵/仙权重10/35/40/15，等级筛选后归一。`, { kind: 'market', payload: { offer: 'skill_box' } })}>技能箱 · {RULES.skillBoxSoul}残魂</button>
        <button type="button" className={styles.button} disabled={!can('market') || profile.materials.soul < RULES.enlightenmentSoul || DEMON_TOWER_SKILLS.every(item => item.requiredLevel > profile.level || profile.skills.some(owned => owned.id === item.id))} onClick={() => ask('兑换悟性丹', `消耗${RULES.enlightenmentSoul}残魂，等概率习得一个当前等级可学习、尚未拥有的技能；已学全时不扣材料。`, { kind: 'market', payload: { offer: 'enlightenment' } })}>悟性丹 · {RULES.enlightenmentSoul}残魂</button>
      </div>
      <details style={{ marginTop: 16 }}><summary>30残页自选仙级技能 · Lv46</summary><div className={styles.buttonRow} style={{ marginTop: 12 }}>{DEMON_TOWER_SKILLS.filter(item => item.rarity === '仙').map(item => <button key={item.id} type="button" className={styles.button} disabled={!can('market') || profile.level < item.requiredLevel || value.skillPages < RULES.selectionPages} onClick={() => ask(`自选${item.name}`, '消耗30残页，明确获得这一个技能；已有同名时转为品质经验，不随机替换。', { kind: 'market', payload: { offer: 'skill_selection', itemId: item.id } })}>{item.name}</button>)}</div></details>
    </TowerPanel>
    {confirmation ? <TowerModal title={confirmation.title} onClose={() => setConfirmation(null)} footer={<div className={styles.actionsRight}><button type="button" className={styles.button} onClick={() => setConfirmation(null)}>取消</button><button type="button" className={styles.primary} disabled={!can(confirmation.action.kind)} onClick={() => void onAction(confirmation.action).then(ok => { if (ok) setConfirmation(null); })}>确认兑换</button></div>}><p>{confirmation.text}</p><p className={styles.muted}>操作由服务器幂等保存；网络不确定时先确认原操作，不会自动再次扣除。</p></TowerModal> : null}
  </>;
}
