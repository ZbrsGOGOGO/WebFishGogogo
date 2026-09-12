import type { JSX } from 'react';
import { DEMON_TOWER_EXPANSION_RULES as RULES, type DemonTowerAction, type DemonTowerProfileView } from '@stealth-reader/shared';
import { TowerPanel } from './TowerElements';
import styles from './DemonTower.module.css';

/** All personal expedition entry points belong to exploration, not equipment cultivation. */
export function DemonTowerExpeditions({ profile, disabled, onAction, onContinueBattle }: {
  profile: DemonTowerProfileView; disabled: boolean; onAction: (action: DemonTowerAction) => Promise<boolean>; onContinueBattle?: () => void;
}): JSX.Element | null {
  const value = profile.expansion;
  if (!value) return null;
  const can = !disabled && !profile.battle && profile.availableActions.includes('expedition');
  const launch = (mode: 'rift' | 'weekly_boss') => void onAction({ kind: 'expedition', payload: { mode } }).then(ok => { if (ok) onContinueBattle?.(); });
  return <TowerPanel title="秘境与灵气任务" detail={<span className={styles.badge}>独立个人探索</span>}>
    <p className={styles.muted}>三个独立获取来源不改普通探索保底；秘境和周常可逐回合操作、刷新续战。失败不发装备，不回退次数。</p>
    {profile.battle && onContinueBattle ? <p className={styles.notice}>你有一场已保存的战斗。<button className={styles.textButton} type="button" onClick={onContinueBattle}>返回战斗现场</button></p> : null}
    <div className={styles.itemGrid}>
      <article className={styles.item}><h3>小秘境</h3><p>强化敌人和助灵；胜利获得武器、技能各一件，另有2残页和1精魄。武器池精/灵/仙/神权重30/30/25/15，等级筛选后归一。</p><p>今日 {value.riftsToday}/{RULES.riftsPerDay} · {RULES.riftCost}体力</p><button className={styles.button} type="button" disabled={!can || profile.hp <= 0 || profile.stamina < RULES.riftCost || value.riftsToday >= RULES.riftsPerDay} onClick={() => launch('rift')}>进入小秘境</button></article>
      <article className={styles.item}><h3>灵气修炼点</h3><p>必得一件符合等级的技能和1—3残页，不掉武器。技能池凡/精/灵/仙权重30/30/25/15。</p><p>今日 {value.meditationsToday}/{RULES.meditationsPerDay} · {RULES.meditationCost}体力</p><button className={styles.button} type="button" disabled={!can || profile.stamina < RULES.meditationCost || value.meditationsToday >= RULES.meditationsPerDay} onClick={() => void onAction({ kind: 'expedition', payload: { mode: 'meditate' } })}>前往灵气点</button></article>
      <article className={styles.item}><h3>周常守关者</h3><p>独立个人副本，世界通关后仍可挑战；胜利双物品、3残页、3精魄。神武器权重由10提高至15，全部权重重新归一，不影响全服血池/日榜。</p><p>本周 {value.weeklyBossAttempts}/{RULES.weeklyBossPerWeek} · {RULES.weeklyBossCost}体力 · 周一北京时间重置</p><button className={styles.button} type="button" disabled={!can || profile.hp <= 0 || profile.stamina < RULES.weeklyBossCost || value.weeklyBossAttempts >= RULES.weeklyBossPerWeek} onClick={() => launch('weekly_boss')}>挑战周常守关者</button></article>
    </div>
  </TowerPanel>;
}
