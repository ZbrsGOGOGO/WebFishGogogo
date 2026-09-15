import type { JSX } from 'react';
import type { DemonTowerCatalog, DemonTowerExplorationReceipt } from '@stealth-reader/shared';

import { TowerPanel, towerTime } from './TowerElements';
import styles from './DemonTower.module.css';

const LABELS = { battle: '遭遇妖物', treasure: '发现宝匣', blessing: '灵脉机缘' } as const;

/** Always the server's immutable departure receipt; never infer or refund rewards. */
export function DemonTowerExplorationResult({ receipt, catalog, stale }: {
  receipt: DemonTowerExplorationReceipt; catalog: DemonTowerCatalog; stale: boolean;
}): JSX.Element {
  const result = receipt.result;
  const materials = result ? Object.entries(result.materials).filter(([, amount]) => amount > 0) : [];
  return <TowerPanel id="tower-exploration-result" title={result ? `探索出发结果 · ${LABELS[result.outcome]}` : '最近探索回执（旧版）'}
    detail={<span className={styles.muted}>{towerTime(receipt.completedAt)}</span>}>
    <p className={styles.muted}>{receipt.source === 'auto' ? '委托探索' : receipt.source === 'manual' ? '手动探索' : '旧版记录'} · 角色版本 {receipt.appliedVersion}{result ? ` · 第 ${result.floor} 层` : ''}。这是最近一次成功出发的记录，不是新的重复结算。</p>
    {stale ? <p className={styles.notice}>当前显示最近已确认回执，最新档案尚未同步；请先同步或确认原操作，再开始新行动。</p> : null}
    {result ? <>
      <p className={styles.reportSummary}>{result.outcome === 'battle'
        ? '这是出发时的妖物遭遇记录。仍有战斗时请在现场继续，已结束则查看行动战报；这里仅记录出发时已获得的经验与物品，战斗完成奖励另见战报。'
        : '本次是正常的非战斗探索，已经直接结算宝匣或机缘；没有战斗不是探索失败。'}普通探索可能遇到妖物、宝匣或机缘，三种结果均按出发规则消耗。</p>
      <dl className={`${styles.reportStats} ${styles.explorationStats}`} aria-label="探索实际消耗与已到账奖励">
        <div><dt>体力消耗</dt><dd>{result.staminaSpent}</dd></div>
        <div><dt>探索符消耗</dt><dd>{result.passesSpent}</dd></div>
        <div><dt>已获妖塔经验</dt><dd>+{result.experience.toLocaleString('zh-CN')}</dd></div>
      </dl>
      <div className={styles.effects} aria-label="探索已结算资源">
        {materials.map(([material, amount]) => <span className={styles.badge} key={material}>{catalog.materials[material as keyof typeof catalog.materials]} +{amount}</span>)}
        <span className={styles.badge}>灵石 +{result.spiritStones}</span><span className={styles.badge}>办公币已到账 +{receipt.officeCoinsGranted}</span>
      </div>
    </> : <p className={styles.notice}>旧版仅保存了以下真实文字回执和办公币到账记录，未保存结果分类、体力及其他奖励明细；这里不会推断或补造数值。</p>}
    {!result ? <p className={styles.muted}>原操作办公币已到账 +{receipt.officeCoinsGranted}；这不是本次新奖励。</p> : null}
    {receipt.events.length ? <ul className={styles.explorationEvents} aria-label="完整探索回执">{receipt.events.map((event, index) => <li key={`${receipt.requestId}-${index}`}>{event}</li>)}</ul> : <p className={styles.muted}>服务器没有保留更多文字明细。</p>}
    <details className={styles.explorationMetadata}><summary>操作编号与恢复说明</summary><p>编号 <code>{receipt.requestId}</code></p><p>该回执由服务器保存，刷新或返回页面可恢复。连接中断时确认原编号，不开始新编号补偿，也不在浏览器退款。</p></details>
  </TowerPanel>;
}
