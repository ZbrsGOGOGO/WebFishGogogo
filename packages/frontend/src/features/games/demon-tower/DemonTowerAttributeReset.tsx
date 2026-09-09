import { useState, type JSX } from 'react';
import type { DemonTowerAction, DemonTowerCatalog, DemonTowerProfileView } from '@stealth-reader/shared';

import { TowerModal, towerTime } from './TowerElements';
import styles from './DemonTower.module.css';

/** The server exposes refundable points and a rolling deadline, not a midnight reset. */
export function DemonTowerAttributeReset({ profile, catalog, now, disabled, onAction }: { profile: DemonTowerProfileView; catalog: DemonTowerCatalog; now: number; disabled: boolean; onAction: (action: DemonTowerAction) => Promise<boolean> }): JSX.Element {
  const [confirm, setConfirm] = useState(false);
  const reset = profile.attributeReset;
  const cooling = reset.eligibleAt !== null && now < reset.eligibleAt;
  const cooldownHours = catalog.rules.attributeResetCooldownMs / 3_600_000;
  const remainingMinutes = reset.eligibleAt === null ? 0 : Math.max(0, Math.ceil((reset.eligibleAt - now) / 60_000));
  const allowed = !disabled && !profile.battle && reset.allocatedPoints > 0 && !cooling && profile.availableActions.includes('reset_attributes');
  const reason = profile.battle ? '请先完成或撤离当前战斗，再调整成长方向。' : reset.allocatedPoints === 0 ? '还没有已分配的自由点，无需重置。' : cooling ? `下次可用：${towerTime(reset.eligibleAt!)}，约剩 ${Math.floor(remainingMinutes / 60)} 小时 ${remainingMinutes % 60} 分钟；以服务器同步为准。` : `可返还 ${reset.allocatedPoints} 个已分配自由点；成功后需间隔 ${cooldownHours} 小时，不按每日零点刷新。`;
  return <section className={styles.attributeReset} aria-label="成长方向调整"><div><h3>免费调整成长方向</h3><p className={styles.muted}>{reason}</p></div><button type="button" className={styles.button} disabled={!allowed} onClick={() => setConfirm(true)}>免费重置自由点</button>
    {confirm ? <TowerModal title="确认免费重置自由点" onClose={() => setConfirm(false)} footer={<div className={styles.actionsRight}><button type="button" className={styles.button} onClick={() => setConfirm(false)}>保留当前分配</button><button type="button" className={styles.primary} disabled={!allowed} onClick={() => { void onAction({ kind: 'reset_attributes', payload: {} }).then((done) => { if (done) setConfirm(false); }); }}>确认返还 {reset.allocatedPoints} 点</button></div>}><p>返还当前已分配的 <strong>{reset.allocatedPoints} 个自由点</strong>，五维恢复基础成长值，返还后可重新分配。</p><ul className={styles.helpList}><li>完全免费，不扣办公币、体力或绑定材料。</li><li>不提供治疗；最大生命降低时，当前生命会限制到新的上限。</li><li>不改变等级、经验、背包或已保存的装备技能。</li><li>成功后间隔 {cooldownHours} 小时才能再次重置，不按每日零点刷新。</li></ul>{!allowed ? <p className={styles.notice}>{disabled ? '当前不能提交新行动，请等待同步或维护结束。' : reason}</p> : null}</TowerModal> : null}
  </section>;
}
