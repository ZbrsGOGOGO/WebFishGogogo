import { useEffect, useState, type JSX } from 'react';

import {
  communityGuildApi,
  communityGuildErrorMessage,
  createCommunityIdempotencyKey,
  type CommunityGuildOverview,
} from '../../api/community';
import { Button, Card, EmptyState, Tag } from '../../components/ui';
import styles from './CommunityBattlePage.module.css';

export interface CommunityGuildPanelProps {
  onAssetsChanged?: () => void | Promise<void>;
}

export function CommunityGuildPanel({ onAssetsChanged }: CommunityGuildPanelProps = {}): JSX.Element {
  const [overview, setOverview] = useState<CommunityGuildOverview | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<string | null>('load');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    communityGuildApi.overview()
      .then(setOverview)
      .catch((requestError) => setError(communityGuildErrorMessage(requestError)))
      .finally(() => setBusy(null));
  }, []);

  async function mutate(
    action: string,
    operation: () => Promise<CommunityGuildOverview>,
    success: string,
  ): Promise<void> {
    setBusy(action);
    setError(null);
    setNotice(null);
    try {
      const result = await operation();
      setOverview(result);
      await onAssetsChanged?.();
      setNotice(success);
    } catch (requestError) {
      setError(communityGuildErrorMessage(requestError));
    } finally {
      setBusy(null);
    }
  }

  async function refreshOverview(): Promise<void> {
    setBusy('refresh');
    setError(null);
    try {
      setOverview(await communityGuildApi.overview());
    } catch (requestError) {
      setError(communityGuildErrorMessage(requestError));
    } finally {
      setBusy(null);
    }
  }

  if (busy === 'load' || !overview) return <p role="status">正在加载帮派档案…</p>;

  const membership = overview.membership;
  return (
    <div role="tabpanel" className={styles.stack}>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}

      <Card
        title="帮派协作"
        headerActions={<Tag color={overview.unlocked ? 'success' : 'neutral'}>Lv.{overview.unlockLevel} 解锁</Tag>}
      >
        <p className={styles.muted}>
          个人办公币 {overview.player.officeCoins}。帮派不创建第二种货币；捐赠只是把办公币转入公开金库，金库不能转回个人。
        </p>
        {!overview.unlocked ? (
          <EmptyState
            title={`当前职场 Lv.${overview.player.level}`}
            message={`达到 Lv.${overview.unlockLevel} 后可免费加入，创建帮派需要 ${overview.rules.createCost} 办公币。`}
          />
        ) : null}
      </Card>

      {overview.unlocked && !membership ? (
        <>
          <Card title="创建帮派" headerActions={<Tag color="neutral">固定回收 {overview.rules.createCost} 币</Tag>}>
            <div className={styles.settingsGrid}>
              <label>
                帮派名称
                <input value={name} maxLength={16} onChange={(event) => setName(event.target.value)} placeholder="例如：准时下班联盟" />
              </label>
            </div>
            <Button
              loading={busy === 'create'}
              disabled={Boolean(busy) || name.trim().length < 2 || overview.player.officeCoins < overview.rules.createCost}
              onClick={() => void mutate(
                'create',
                () => communityGuildApi.create(name, createCommunityIdempotencyKey('guild-create')),
                '帮派创建成功',
              )}
            >
              创建帮派
            </Button>
          </Card>
          <Card title="可加入帮派">
            {overview.suggestions.length === 0 ? (
              <EmptyState title="暂时还没有帮派" message="你可以成为第一位创建者。" />
            ) : (
              <ul className={styles.friendList}>
                {overview.suggestions.map((guild) => (
                  <li key={guild.id}>
                    <div>
                      <strong>{guild.name}</strong>
                      <small>Lv.{guild.level} · {guild.memberCount}/{guild.memberCapacity} 人 · 金库 {guild.treasury}</small>
                    </div>
                    <Button
                      loading={busy === `join:${guild.id}`}
                      disabled={Boolean(busy) || guild.memberCount >= guild.memberCapacity}
                      onClick={() => void mutate(
                        `join:${guild.id}`,
                        () => communityGuildApi.join(guild.id, createCommunityIdempotencyKey('guild-join')),
                        `已加入 ${guild.name}`,
                      )}
                    >
                      加入
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      ) : null}

      {membership ? (
        <>
          <section className={styles.summaryGrid} aria-label="帮派摘要">
            <div><span>我的帮派</span><strong>{membership.guild.name}</strong><small>帮派 Lv.{membership.guild.level}</small></div>
            <div><span>公开金库</span><strong>{membership.guild.treasury}</strong><small>只能用于配置好的建设</small></div>
            <div><span>成员</span><strong>{membership.guild.memberCount}/{membership.guild.memberCapacity}</strong><small>{membership.me.role === 'owner' ? '负责人' : '成员'}</small></div>
            <div><span>个人活跃</span><strong>{membership.me.activity}</strong><small>今日已捐 {membership.me.donatedToday}</small></div>
          </section>

          <Card
            title={`共享首领 · ${membership.boss.bossName}`}
            headerActions={(
              <div className={styles.inlineActions}>
                <Tag color={membership.boss.status === 'defeated' ? 'success' : 'brand'}>
                  {membership.boss.status === 'defeated' ? '今日已击败' : '全帮共享血量'}
                </Tag>
                <Button
                  variant="secondary"
                  loading={busy === 'refresh'}
                  disabled={Boolean(busy)}
                  onClick={() => void refreshOverview()}
                >
                  刷新进度
                </Button>
              </div>
            )}
          >
            <div className={styles.bossPanel}>
              <div className={styles.bossHealth}>
                <div>
                  <strong>{membership.boss.remainingHp} / {membership.boss.maxHp} HP</strong>
                  <span>每日 05:00 重置</span>
                </div>
                <progress
                  aria-label="首领剩余血量"
                  max={membership.boss.maxHp}
                  value={membership.boss.remainingHp}
                />
              </div>
              <p className={styles.muted}>
                每位成员每日 {overview.rules.boss.dailyAttempts} 次有效攻击，消耗 {overview.rules.boss.energyCost} 体力；
                结算固定获得 {overview.rules.boss.reward.officeCoins} 办公币、{overview.rules.boss.reward.experience} 职场经验和
                {overview.rules.boss.reward.activity} 帮派活跃。伤害、血量和贡献榜都由服务器统一记录。
              </p>
              {membership.boss.myContribution ? (
                <p className={styles.notice} role="status">
                  今日贡献 {membership.boss.myContribution.damage} 伤害
                  {membership.boss.myContribution.criticalHit ? ' · 暴击' : ''}
                </p>
              ) : null}
              <div className={styles.inlineActions}>
                <Button
                  loading={busy === 'boss'}
                  disabled={Boolean(busy) || !membership.boss.canAttack}
                  onClick={() => void mutate(
                    'boss',
                    () => communityGuildApi.attackBoss(createCommunityIdempotencyKey('guild-boss')),
                    '攻击已结算，伤害、奖励和贡献榜均已写入服务器',
                  )}
                >
                  {membership.boss.status === 'defeated'
                    ? '今日已击败'
                    : membership.boss.attempted
                      ? '今日已挑战'
                      : overview.player.energy < overview.rules.boss.energyCost
                        ? '体力不足'
                        : `投入 ${overview.rules.boss.energyCost} 体力攻击`}
                </Button>
                <Tag color="neutral">体力 {overview.player.energy}/{overview.player.energyCapacity}</Tag>
              </div>
            </div>

            {membership.boss.leaderboard.length > 0 ? (
              <ol className={styles.bossLeaderboard} aria-label="今日贡献榜">
                {membership.boss.leaderboard.map((entry) => (
                  <li key={entry.publicId ?? `${entry.rank}-${entry.displayName}`}>
                    <span>#{entry.rank}</span>
                    <strong>{entry.displayName}</strong>
                    <b>{entry.damage} 伤害{entry.criticalHit ? ' · 暴击' : ''}</b>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState title="今天还没有人出手" message="完成攻击后会立即写入共享进度，其他成员刷新后即可看到。" />
            )}
          </Card>

          <Card title="捐入帮派金库" headerActions={<Tag color="neutral">每日前 {overview.rules.dailyEffectiveDonation} 计活跃</Tag>}>
            <p className={styles.muted}>超过每日有效上限仍可捐赠，但不会增加个人活跃；捐赠不是系统增发。</p>
            <div className={styles.inlineActions}>
              {[100, 500].map((amount) => (
                <Button
                  key={amount}
                  variant="secondary"
                  loading={busy === `donate:${amount}`}
                  disabled={Boolean(busy) || overview.player.officeCoins < amount}
                  onClick={() => void mutate(
                    `donate:${amount}`,
                    () => communityGuildApi.donate(amount, createCommunityIdempotencyKey('guild-donate')),
                    `已向金库捐入 ${amount} 办公币`,
                  )}
                >
                  捐 {amount} 币
                </Button>
              ))}
            </div>
          </Card>

          <Card title="帮派建设">
            <div className={styles.skillGrid}>
              {membership.buildings.map((building) => {
                const maxed = building.level >= building.maxLevel;
                const canUpgrade = membership.me.role === 'owner' && membership.guild.treasury >= building.nextCost;
                return (
                  <article key={building.key}>
                    <div><span>Lv.{building.level}/{building.maxLevel}</span><strong>{building.name}</strong><small>{building.description}</small></div>
                    <Button
                      variant="secondary"
                      loading={busy === `building:${building.key}`}
                      disabled={Boolean(busy) || maxed || !canUpgrade}
                      onClick={() => void mutate(
                        `building:${building.key}`,
                        () => communityGuildApi.upgradeBuilding(building.key, createCommunityIdempotencyKey('guild-building')),
                        `${building.name}已升到 Lv.${building.level + 1}`,
                      )}
                    >
                      {maxed ? '已满级' : membership.me.role !== 'owner' ? '负责人可升级' : `${building.nextCost} 金库币升级`}
                    </Button>
                  </article>
                );
              })}
            </div>
          </Card>

          <Card title="成员名单">
            <ul className={styles.friendList}>
              {membership.members.map((member, index) => (
                <li key={member.publicId ?? `${member.displayName}-${index}`}>
                  <div><strong>{member.displayName}</strong><small>{member.role === 'owner' ? '负责人' : '成员'} · 活跃 {member.activity}</small></div>
                </li>
              ))}
            </ul>
          </Card>
        </>
      ) : null}

      <Card title="玩家市场">
        <p className={styles.muted}>
          当前处于经济观察期。统一经济至少稳定运行 {overview.rules.market.minimumObservationDays} 天并完成价格与风控检查后，才开放受控市场；不会提供好友直接转账。
        </p>
      </Card>
    </div>
  );
}
