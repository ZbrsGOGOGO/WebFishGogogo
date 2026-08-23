import { useEffect, useMemo, useState, type JSX } from 'react';

import { Button } from '../../components/ui';
import type { CommunityBattleSettlement } from '../../api/community';
import styles from './CommunityBattlePage.module.css';

function reducedMotionPreferred(): boolean {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export interface ServerBattleReplayProps {
  settlement: CommunityBattleSettlement;
}

/** 只播放服务端事件序列；seed 仅用于审计展示，绝不在浏览器重新推演。 */
export function ServerBattleReplay({ settlement }: ServerBattleReplayProps): JSX.Element {
  const [reducedMotion, setReducedMotion] = useState(reducedMotionPreferred);
  const [fast, setFast] = useState(false);
  const [playing, setPlaying] = useState(!reducedMotion);
  const [visibleCount, setVisibleCount] = useState(
    reducedMotion ? settlement.events.length : Math.min(1, settlement.events.length),
  );

  useEffect(() => {
    const showAll = reducedMotion;
    setPlaying(!showAll);
    setVisibleCount(showAll ? settlement.events.length : Math.min(1, settlement.events.length));
  }, [reducedMotion, settlement.battleId, settlement.events.length]);

  useEffect(() => {
    if (!playing || visibleCount >= settlement.events.length) return undefined;
    const timer = globalThis.setTimeout(
      () => setVisibleCount((value) => Math.min(value + 1, settlement.events.length)),
      fast ? 220 : 650,
    );
    return () => globalThis.clearTimeout(timer);
  }, [fast, playing, settlement.events.length, visibleCount]);

  useEffect(() => {
    if (visibleCount >= settlement.events.length) setPlaying(false);
  }, [settlement.events.length, visibleCount]);

  const visibleEvents = useMemo(
    () => [...settlement.events]
      .sort((left, right) => left.sequence - right.sequence)
      .slice(0, visibleCount),
    [settlement.events, visibleCount],
  );

  return (
    <section className={styles.replay} aria-labelledby="server-replay-title">
      <div className={styles.sectionHeading}>
        <div>
          <span>战斗回放</span>
          <h2 id="server-replay-title">
            {settlement.winner === 'player' ? '本次胜出' : '本次惜败'}
          </h2>
        </div>
        <div className={styles.inlineActions}>
          <Button
            variant="secondary"
            onClick={() => setFast((value) => !value)}
            aria-pressed={fast}
            disabled={reducedMotion || visibleCount >= settlement.events.length}
          >
            {fast ? '正常速度' : '快速回放'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setVisibleCount(settlement.events.length);
              setPlaying(false);
            }}
            disabled={visibleCount >= settlement.events.length}
          >
            跳过演出
          </Button>
        </div>
      </div>

      <label className={styles.motionChoice}>
        <input
          type="checkbox"
          checked={reducedMotion}
          onChange={(event) => setReducedMotion(event.target.checked)}
        />
        减少动态效果（直接展示完整战报）
      </label>

      <div className={styles.fighterGrid}>
        <div>
          <strong>{settlement.player.displayName}</strong>
          <span>Lv.{settlement.player.battleLevel} · 战力 {settlement.player.power}</span>
        </div>
        <b aria-hidden="true">VS</b>
        <div>
          <strong>{settlement.opponent.displayName}</strong>
          <span>Lv.{settlement.opponent.battleLevel} · 战力 {settlement.opponent.power}</span>
        </div>
      </div>

      <ol className={styles.eventList} aria-live="polite" aria-label="战斗事件">
        {visibleEvents.map((event) => (
          <li key={`${event.sequence}-${event.kind}`}>
            <span>第 {event.round} 回合</span>
            <p>{event.message}</p>
            <small>
              我方生命 {event.playerHp} · 对方生命 {event.opponentHp}
              {event.damage ? ` · 伤害 ${event.damage}` : ''}
              {event.healing ? ` · 治疗 ${event.healing}` : ''}
            </small>
          </li>
        ))}
      </ol>

      {visibleCount >= settlement.events.length ? (
        <div className={styles.rewardSummary} role="status">
          <strong>{settlement.mode === 'practice' ? '练习赛不产生奖励' : '完整奖励'}</strong>
          {settlement.mode === 'reward' ? (
            <p>
              职场经验 +{settlement.reward.battleExperience}
              {' · '}办公币 +{settlement.reward.workspaceCoins} · 零件 +{settlement.reward.parts}
            </p>
          ) : null}
          {settlement.reward.droppedEquipment ? (
            <p>装备掉落：{settlement.reward.droppedEquipment.name}</p>
          ) : null}
          {settlement.reward.pendingRewardId ? <p>仓库已满，装备进入待领取区。</p> : null}
        </div>
      ) : null}

    </section>
  );
}
