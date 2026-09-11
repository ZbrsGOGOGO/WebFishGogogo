import { useRef, useState, type JSX } from 'react';
import type { DemonTowerProfileView } from '@stealth-reader/shared';
import { TowerModal, TowerPanel } from './TowerElements';
import type { DemonTowerActionHandler } from './useDemonTower';
import styles from './DemonTower.module.css';

export function towerProvisionsCurrentDate(serviceDate: string, now: number): boolean {
  return Number.isFinite(now) && new Date(now + 8 * 3600_000).toISOString().slice(0, 10) === serviceDate;
}

export function DemonTowerExplorationStats({ profile, disabled, now, onAction, onSupplies }: {
  profile: DemonTowerProfileView; disabled: boolean; now: number;
  onAction: DemonTowerActionHandler; onSupplies: () => void;
}): JSX.Element | null {
  const [quote, setQuote] = useState<{ version: number; serviceDate: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const value = profile.provisions;
  if (!value) return null;
  const currentDate = towerProvisionsCurrentDate(value.serviceDate, now);
  const reason = !currentDate ? '已经跨日，等待服务器同步统计。'
    : disabled || submitting ? '当前托管、提交或待确认，请同步后再操作。'
      : profile.battle ? '请先结束当前战斗。' : profile.hp <= 0 ? '请先恢复生命。'
        : value.passes < 1 ? '暂无探索符，可在物资申领中查看。'
          : value.passStarted >= value.passDailyLimit ? '今日探索符次数已用完，明日北京时间重置。'
            : !profile.availableActions.includes('explore_with_pass') ? '当前暂不能使用探索符。' : null;
  const changed = quote !== null && (quote.version !== profile.version || quote.serviceDate !== value.serviceDate || !towerProvisionsCurrentDate(quote.serviceDate, now));
  const usePass = async () => {
    if (!quote || reason || changed || inFlight.current) return;
    inFlight.current = true; setSubmitting(true);
    try { if (await onAction({ kind: 'explore_with_pass', payload: {} }, { expectedVersion: quote.version, serviceDate: quote.serviceDate })) setQuote(null); }
    finally { inFlight.current = false; setSubmitting(false); }
  };
  return <TowerPanel title="今日探索登记">
    <div className={styles.supplyContext}><span>普通探索 {value.ordinaryStarted} 次 · 符探索 {value.passStarted}/{value.passDailyLimit} 次 · 库存 {value.passes} 枚</span><button className={styles.button} type="button" onClick={onSupplies}>查看探索补给</button></div>
    <p className={styles.muted}>{value.serviceDate}（北京时间）· 统计从新版启用后开始，不补造历史。普通次数包含手动和托管，按进入探索计数，失败或撤离仍占已开始次数；普通探索没有每日 10 次硬上限。</p>
    <p className={styles.muted}>探索符每次消耗 1 枚，不扣体力；沿用相同探索和掉落规则，受每日符使用上限限制。必须手动确认，托管不会购买或使用探索符。</p>
    {reason ? <p className={styles.muted}>{reason}</p> : null}
    <button className={styles.button} type="button" disabled={Boolean(reason)} onClick={() => setQuote({ version: profile.version, serviceDate: value.serviceDate })}>使用探索符</button>
    {quote !== null ? <TowerModal title="确认使用探索符" onClose={() => { if (!submitting) setQuote(null); }} footer={<div className={styles.actionsRight}><button className={styles.button} type="button" disabled={submitting} onClick={() => setQuote(null)}>取消</button><button className={styles.primary} type="button" disabled={Boolean(reason) || changed} onClick={() => void usePass()}>确认探索</button></div>}>
      <p>消耗探索符 ×1，在当前第 {profile.selectedFloor} 层开始探索，不扣体力、不扣办公币。进入后即占一次符探索次数，撤离不退。</p>
      {changed ? <p role="alert" className={styles.notice}>角色或区域状态已变化，请关闭后重新确认，避免进入非预期楼层。</p> : reason ? <p role="alert" className={styles.notice}>{reason}</p> : null}
    </TowerModal> : null}
  </TowerPanel>;
}
