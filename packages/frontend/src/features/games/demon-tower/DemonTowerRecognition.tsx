import type { JSX } from 'react';
import type { DemonTowerAction, DemonTowerProfileView, DemonTowerWorldView } from '@stealth-reader/shared';
import { TowerPanel } from './TowerElements';
import styles from './DemonTower.module.css';

type Props = { profile: DemonTowerProfileView; disabled: boolean; onAction: (action: DemonTowerAction) => Promise<boolean> };

/** Shared-world rewards stay beside the shared-world contribution view. */
export function DemonTowerFirstClear({ profile, world, disabled, onAction }: Props & { world: DemonTowerWorldView }): JSX.Element | null {
  const value = profile.expansion;
  if (!value) return null;
  const can = !disabled && profile.availableActions.includes('claim_boss_loot');
  return <TowerPanel title="首杀贡献凭证">
    <p className={styles.muted}>对共享守关者造成有效伤害的玩家，在该层击败后可各领取一次首杀奖励；历史贡献也可核验，不要求抢到最后一击。</p>
    <div className={styles.buttonRow}>{Array.from({ length: world.currentFloor }, (_, index) => index + 1).filter(floor => floor < world.currentFloor || world.phase !== 'boss').map(floor => <button className={styles.button} type="button" key={floor} disabled={!can || value.claimedBossFloors.includes(floor)} onClick={() => void onAction({ kind: 'claim_boss_loot', payload: { floor } })}>第{floor}层{value.claimedBossFloors.includes(floor) ? '已领取' : '核验首杀贡献'}</button>)}</div>
    {world.currentFloor === 1 && world.phase === 'boss' ? <p className={styles.muted}>首层守关者尚未击败，完成协作后在此核验贡献。</p> : null}
    <p>首杀称号：{value.titles.join('、') || '完成共同讨伐后领取'}</p>
  </TowerPanel>;
}

/** Personal presentation belongs to the character profile, not the dungeon list. */
export function DemonTowerSkinPicker({ profile, disabled, onAction }: Props): JSX.Element | null {
  const value = profile.expansion;
  if (!value) return null;
  const can = !disabled && profile.availableActions.includes('select_skin');
  return <TowerPanel title="档案外观"><p className={styles.muted}>只改变妖塔工作区的表现，不影响装备或收益。当前选择由服务器保存。</p><fieldset disabled={!can}><legend>低调工作台皮肤</legend><div className={styles.buttonRow}>{value.unlockedSkins.map(skin => <button type="button" className={styles.button} key={skin} aria-pressed={value.skin === skin} disabled={!can || value.skin === skin} onClick={() => void onAction({ kind: 'select_skin', payload: { skin } })}>{({ field: '野外笔记', ledger: '数据台账', memo: '便签白板' })[skin]}</button>)}</div></fieldset></TowerPanel>;
}
