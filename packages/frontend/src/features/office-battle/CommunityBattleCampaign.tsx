import type { JSX } from 'react';

import type {
  CommunityBattleBootstrap,
  CommunityBattleOffer,
  CommunityBattleProfile,
} from '../../api/community';
import { Button, Card, EmptyState, Tag } from '../../components/ui';
import styles from './CommunityBattlePage.module.css';

const TIER_LABELS = {
  simple: '普通关',
  balanced: '精英关',
  challenge: 'Boss 关',
} as const;

function firstClearText(offer: CommunityBattleOffer): string {
  const reward = offer.rewardPreview.firstClearBonus;
  if (!reward) return offer.stage?.cleared ? '本关首通奖励已领取' : '当前没有首通加成';
  return `首通：经验 +${reward.battleExperience} · 办公币 +${reward.workspaceCoins} · 零件 +${reward.parts}`;
}

export function CommunityBattleCampaignPanel({
  bootstrap,
  profile,
  busyKey,
  canMutate,
  onBattle,
}: {
  bootstrap: CommunityBattleBootstrap;
  profile: CommunityBattleProfile;
  busyKey: string | null;
  canMutate: boolean;
  onBattle: (offerId: string, mode: 'reward' | 'practice') => void;
}): JSX.Element {
  const catalog = bootstrap.catalog.pveCampaign;
  const progress = bootstrap.pveCampaign;
  const activeChapter = catalog?.chapters.find((chapter) => chapter.id === progress?.activeChapterId)
    ?? catalog?.chapters[0];

  return (
    <div role="tabpanel" className={styles.stack}>
      <Card
        title="PVE 项目主线"
        headerActions={progress
          ? <Tag color="success">已通关 {progress.clearedStages}/{progress.totalStages}</Tag>
          : <Tag color="neutral">项目挑战</Tag>}
      >
        <p className={styles.muted}>每章依次完成普通关、精英关和 Boss 关。首次胜利有额外奖励，重复挑战保留基础奖励和装备掉落。</p>
        {catalog && progress ? (
          <div className={styles.chapterRoute} aria-label="PVE 章节路线">
            {catalog.chapters.map((chapter) => {
              const state = progress.chapters.find((item) => item.id === chapter.id);
              return (
                <article
                  key={chapter.id}
                  data-state={state?.completed ? 'done' : state?.active ? 'active' : state?.unlocked ? 'open' : 'locked'}
                >
                  <span>第 {chapter.index} 章 · Lv.{chapter.unlockLevel}</span>
                  <strong>{chapter.name.replace(/^第.+?·\s*/, '')}</strong>
                  <small>{state?.completed ? '已通关' : state?.active ? '当前章节' : state?.unlocked ? '可挑战' : state?.lockReason ?? '尚未解锁'}</small>
                </article>
              );
            })}
          </div>
        ) : null}
      </Card>

      <Card
        title={activeChapter?.name ?? '当前项目挑战'}
        headerActions={bootstrap.dailyActions
          ? <Tag color="neutral">今日 {bootstrap.dailyActions.rewardedBattlesUsed}/{bootstrap.dailyActions.rewardedBattlesLimit}</Tag>
          : null}
      >
        {activeChapter ? <p className={styles.chapterSummary}>{activeChapter.summary}</p> : null}
        {bootstrap.offers.length === 0 ? (
          <EmptyState title="暂时没有可用关卡" message="刷新页面后再试一次。" />
        ) : (
          <div className={styles.campaignStageGrid}>
            {bootstrap.offers.map((offer) => {
              const stage = offer.stage;
              const unlocked = stage?.unlocked ?? true;
              const rewardDisabled = !canMutate
                || !unlocked
                || profile.energy.current < bootstrap.catalog.energy.costPerBattle;
              return (
                <article key={offer.offerId} data-state={stage?.cleared ? 'done' : unlocked ? 'open' : 'locked'}>
                  <header>
                    <Tag color={stage?.boss ? 'neutral' : stage?.cleared ? 'success' : 'neutral'}>
                      {stage?.boss ? 'Boss' : TIER_LABELS[offer.tier]}
                    </Tag>
                    <span>{stage ? `第 ${stage.index} 关` : TIER_LABELS[offer.tier]}</span>
                  </header>
                  <h3>{stage?.name ?? offer.opponent.displayName}</h3>
                  <p>{stage?.summary ?? `${offer.opponent.displayName} · 战力 ${offer.opponent.power}`}</p>
                  <dl className={styles.rulesList}>
                    <div><dt>对手</dt><dd>{offer.opponent.displayName}</dd></div>
                    <div><dt>对手战力</dt><dd>{offer.opponent.power}（差值 {offer.powerDifferencePercent > 0 ? '+' : ''}{offer.powerDifferencePercent}%）</dd></div>
                    <div><dt>基础奖励</dt><dd>经验 +{offer.rewardPreview.battleExperience} · 办公币 +{offer.rewardPreview.workspaceCoins}</dd></div>
                  </dl>
                  <div className={styles.firstClearReward} data-claimed={stage?.cleared || undefined}>
                    {firstClearText(offer)}
                  </div>
                  {!unlocked ? <p className={styles.stageLockReason}>{stage?.lockReason}</p> : null}
                  <div className={styles.offerActions}>
                    <Button
                      loading={busyKey === `battle:${offer.offerId}`}
                      disabled={rewardDisabled}
                      onClick={() => onBattle(offer.offerId, 'reward')}
                    >
                      {!unlocked ? stage?.lockReason ?? '尚未解锁' : `挑战 · ${bootstrap.catalog.energy.costPerBattle} 体力`}
                    </Button>
                    <Button
                      variant="secondary"
                      loading={busyKey === `battle:${offer.offerId}`}
                      disabled={!canMutate || !unlocked}
                      onClick={() => onBattle(offer.offerId, 'practice')}
                    >
                      练习 · 无奖励
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

