import type { JSX } from 'react';

import type {
  CommunityBattleBootstrap,
  CommunityBattleMode,
  CommunityBattleModeDefinition,
  CommunityBattleProfile,
  CommunityBattleSkillDefinition,
  CommunityBattleStats,
} from '../../api/community';
import { Button, Card, Tag } from '../../components/ui';
import styles from './CommunityBattlePage.module.css';

const MODE_ORDER: readonly CommunityBattleMode[] = ['pve', 'pvp'];
const STAT_LABELS: Record<keyof CommunityBattleStats, string> = {
  hp: '活力',
  attack: '执行',
  defense: '抗压',
  speed: '反应',
  luck: '洞察',
};

const FALLBACK_MODES: Record<CommunityBattleMode, CommunityBattleModeDefinition> = {
  pve: {
    label: 'PVE 项目挑战',
    opponentLabel: 'NPC 项目组',
    skillTrack: 'pve',
    equipmentEnhancementPercent: 100,
    dailyRewardLimit: 14,
    winReward: { battleExperience: 30, workspaceCoins: 80, equipmentDrop: true },
    lossReward: { battleExperience: 15, workspaceCoins: 40, equipmentDrop: false },
    rules: ['三档项目难度', '完整计算装备强化', '使用 PVE 技能'],
  },
  pvp: {
    label: 'PVP 好友对战',
    opponentLabel: '已满足条件的好友',
    skillTrack: 'pvp',
    equipmentEnhancementPercent: 60,
    dailyRewardLimit: 5,
    friendAgeHours: 24,
    winReward: { battleExperience: 25, workspaceCoins: 120, equipmentDrop: true },
    lossReward: { battleExperience: 12, workspaceCoins: 60, equipmentDrop: false },
    rules: ['双方使用防守阵容', '强化增量只计 60%', '使用 PVP 技能'],
  },
};

function modeDefinition(
  bootstrap: CommunityBattleBootstrap,
  mode: CommunityBattleMode,
): CommunityBattleModeDefinition {
  return bootstrap.catalog.modes?.[mode] ?? FALLBACK_MODES[mode];
}

function modeSnapshot(
  profile: CommunityBattleProfile,
  mode: CommunityBattleMode,
): { power: number; stats: CommunityBattleStats; equipmentEnhancementPercent: number } {
  return profile.modeSnapshots?.[mode] ?? {
    power: mode === 'pve' ? profile.pvePower ?? profile.power : profile.pvpPower ?? profile.power,
    stats: profile.stats,
    equipmentEnhancementPercent: mode === 'pve' ? 100 : 60,
  };
}

function bonusText(
  bonus: Partial<CommunityBattleStats>,
  multiplier: number,
): string {
  const values = (Object.entries(bonus) as Array<[keyof CommunityBattleStats, number]>)
    .filter(([, amount]) => amount !== 0)
    .map(([stat, amount]) => `${STAT_LABELS[stat]} +${amount * multiplier}`);
  return values.length > 0 ? values.join('、') : '无属性加成';
}

function rewardText(definition: CommunityBattleModeDefinition, result: 'win' | 'loss'): string {
  const reward = result === 'win' ? definition.winReward : definition.lossReward;
  return `经验 +${reward.battleExperience} · 办公币 +${reward.workspaceCoins}${reward.equipmentDrop ? ' · 胜利可掉装备' : ''}`;
}

export function CommunityBattleModeGuide({
  bootstrap,
  profile,
}: {
  bootstrap: CommunityBattleBootstrap;
  profile: CommunityBattleProfile;
}): JSX.Element {
  return (
    <Card title="PVE 与 PVP 的区别">
      <div className={styles.modeGuideGrid}>
        {MODE_ORDER.map((mode) => {
          const definition = modeDefinition(bootstrap, mode);
          const snapshot = modeSnapshot(profile, mode);
          const points = profile.skillPoints[mode];
          return (
            <article key={mode} data-mode={mode}>
              <header>
                <Tag color={mode === 'pve' ? 'success' : 'neutral'}>{mode.toUpperCase()}</Tag>
                <div><span>当前战力</span><strong>{snapshot.power}</strong></div>
              </header>
              <h3>{definition.label}</h3>
              <p>对手：{definition.opponentLabel}</p>
              <dl className={styles.rulesList}>
                <div><dt>生效技能</dt><dd>{mode.toUpperCase()} 独立技能树</dd></div>
                <div><dt>装备强化</dt><dd>强化增量计入 {definition.equipmentEnhancementPercent}%</dd></div>
                <div><dt>可用技能点</dt><dd>{points.available} / 已获得 {points.earned}</dd></div>
                <div><dt>每日奖励场次</dt><dd>{definition.dailyRewardLimit} 场</dd></div>
                <div><dt>基础胜利奖励</dt><dd>{rewardText(definition, 'win')}</dd></div>
                <div><dt>基础失败奖励</dt><dd>{rewardText(definition, 'loss')}</dd></div>
                {definition.friendAgeHours ? <div><dt>好友关系要求</dt><dd>满 {definition.friendAgeHours} 小时</dd></div> : null}
              </dl>
              <ul>{definition.rules.map((rule) => <li key={rule}>{rule}</li>)}</ul>
            </article>
          );
        })}
      </div>
    </Card>
  );
}

export function CommunityBattleGrowthPanel({
  bootstrap,
  profile,
  levelProgress,
}: {
  bootstrap: CommunityBattleBootstrap;
  profile: CommunityBattleProfile;
  levelProgress: number;
}): JSX.Element {
  const leveling = bootstrap.catalog.leveling;
  const professionSkills = bootstrap.catalog.skills.definitions
    .filter((skill) => skill.profession === profile.profession)
    .map((skill) => ({
      level: skill.unlockLevel,
      label: `${skill.mode.toUpperCase()} 技能 · ${skill.name}`,
      kind: skill.mode,
    }));
  const rarityMilestones = (leveling?.rarityUnlocks ?? [
    { level: 1, rarity: 'common' as const, label: '标准' },
    { level: 10, rarity: 'uncommon' as const, label: '精工' },
    { level: 20, rarity: 'rare' as const, label: '专业' },
    { level: 30, rarity: 'epic' as const, label: '卓越' },
    { level: 40, rarity: 'legendary' as const, label: '代表作' },
  ]).map((item) => ({ level: item.level, label: `${item.label}装备`, kind: 'equipment' as const }));
  const milestones = [...professionSkills, ...rarityMilestones, {
    level: leveling?.maxLevel ?? 60,
    label: '等级上限',
    kind: 'level' as const,
  }].sort((left, right) => left.level - right.level || left.label.localeCompare(right.label));

  return (
    <div role="tabpanel" className={styles.stack}>
      <Card title="等级成长" headerActions={<Tag color="success">当前 Lv.{profile.battleLevel}</Tag>}>
        <div className={styles.levelOverviewGrid}>
          <div><span>累计经验</span><strong>{profile.totalBattleExperience}</strong><small>全站统一成长经验</small></div>
          <div><span>本级进度</span><strong>{profile.experienceInLevel}/{profile.experienceToNextLevel ?? 'MAX'}</strong><small>{levelProgress}%</small></div>
          <div><span>下一解锁</span><strong>{profile.nextUnlock ? `Lv.${profile.nextUnlock.level}` : '全部解锁'}</strong><small>{profile.nextUnlock?.name ?? '继续提升战力'}</small></div>
          <div><span>等级上限</span><strong>Lv.{leveling?.maxLevel ?? 60}</strong><small>等级由 PVE 与 PVP 共同成长</small></div>
        </div>
        <div className={styles.levelProgress}>
          <div><span>距离下一级</span><strong>{levelProgress}%</strong></div>
          <progress max={100} value={levelProgress}>{levelProgress}%</progress>
        </div>
      </Card>

      <Card title="等级与技能点规则">
        <div className={styles.growthRoute}>
          <div><b>级</b><strong>共享等级</strong><small>{leveling?.experienceRule ?? '升级所需经验会随等级逐步增加。'} PVE 和 PVP 获得的经验进入同一等级。</small></div>
          <div><b>副</b><strong>PVE 技能点</strong><small>{leveling?.pveSkillPointRule ?? 'PVE 技能点随等级获得。'} 当前可用 {profile.skillPoints.pve.available} 点。</small></div>
          <div><b>竞</b><strong>PVP 技能点</strong><small>{leveling?.pvpSkillPointRule ?? 'PVP 技能点从 Lv.5 开始获得。'} 当前可用 {profile.skillPoints.pvp.available} 点。</small></div>
          <div><b>装</b><strong>装备品质</strong><small>Lv.10/20/30/40 依次开放精工、专业、卓越、代表作装备。</small></div>
        </div>
      </Card>

      <Card title="等级解锁图鉴">
        <div className={styles.milestoneGrid}>
          {milestones.map((milestone) => {
            const state = profile.battleLevel >= milestone.level ? 'done' : 'future';
            return (
              <article key={`${milestone.level}-${milestone.label}`} data-state={state}>
                <span>Lv.{milestone.level}</span>
                <strong>{milestone.label}</strong>
                <small>{state === 'done' ? '已解锁' : `还需 ${milestone.level - profile.battleLevel} 级`}</small>
              </article>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

export function CommunityBattleSkillCodex({
  bootstrap,
  profile,
  mode,
  onModeChange,
  busyKey,
  canMutate,
  onUpgrade,
}: {
  bootstrap: CommunityBattleBootstrap;
  profile: CommunityBattleProfile;
  mode: CommunityBattleMode;
  onModeChange: (mode: CommunityBattleMode) => void;
  busyKey: string | null;
  canMutate: boolean;
  onUpgrade: (skill: CommunityBattleSkillDefinition) => void;
}): JSX.Element {
  const definition = modeDefinition(bootstrap, mode);
  const snapshot = modeSnapshot(profile, mode);
  const points = profile.skillPoints[mode];
  const skills = bootstrap.catalog.skills.definitions.filter(
    (skill) => skill.profession === profile.profession && skill.mode === mode,
  );

  return (
    <div role="tabpanel" className={styles.stack}>
      <Card title="技能图鉴" headerActions={<Tag color={points.available > 0 ? 'success' : 'neutral'}>可用 {points.available} 点</Tag>}>
        <div className={styles.modeSwitch} role="tablist" aria-label="技能类型">
          {MODE_ORDER.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={mode === item}
              data-selected={mode === item}
              onClick={() => onModeChange(item)}
            >
              {item.toUpperCase()} 技能
            </button>
          ))}
        </div>
        <div className={styles.skillModeSummary} data-mode={mode}>
          <div><span>{definition.label}</span><strong>战力 {snapshot.power}</strong></div>
          <p>{mode === 'pve' ? '只在 NPC 项目挑战中生效' : '只在好友 PVP 对战中生效'}；装备强化增量计入 {definition.equipmentEnhancementPercent}%。</p>
          <small>{bootstrap.catalog.skills.pointRule}</small>
        </div>
      </Card>

      <Card title={`${mode.toUpperCase()} 职业技能`}>
        <div className={styles.skillGrid}>
          {skills.map((skill) => {
            const level = profile.skillLevels[skill.id] ?? 0;
            const locked = profile.battleLevel < skill.unlockLevel;
            const maxed = level >= bootstrap.catalog.skills.maxLevel;
            const coinCost = bootstrap.catalog.skills.coinCosts[level] ?? 0;
            return (
              <article key={skill.id} data-locked={locked}>
                <div>
                  <span>{skill.mode.toUpperCase()} · 被动成长 · Lv.{skill.unlockLevel} 解锁</span>
                  <strong>{skill.name}</strong>
                  <small>{skill.description}</small>
                </div>
                <div className={styles.skillLevel}><b>Lv.{level}</b><span>/ {bootstrap.catalog.skills.maxLevel}</span></div>
                <dl className={styles.skillEffects}>
                  <div><dt>每级效果</dt><dd>{bonusText(skill.bonusPerLevel, 1)}</dd></div>
                  <div><dt>当前加成</dt><dd>{level > 0 ? bonusText(skill.bonusPerLevel, level) : '尚未学习'}</dd></div>
                  <div><dt>满级加成</dt><dd>{bonusText(skill.bonusPerLevel, bootstrap.catalog.skills.maxLevel)}</dd></div>
                </dl>
                <Button
                  loading={busyKey === `skill:${skill.id}`}
                  disabled={!canMutate || locked || maxed || points.available < 1 || profile.workspaceCoins < coinCost}
                  onClick={() => onUpgrade(skill)}
                >
                  {locked ? `Lv.${skill.unlockLevel} 解锁` : maxed ? '已满级' : `1 点 + ${coinCost} 办公币`}
                </Button>
              </article>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
