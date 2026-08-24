import { useCallback, useEffect, useMemo, useState, type JSX, type KeyboardEvent } from 'react';

import {
  CommunityApiError,
  communityBattleApi,
  communityBattleErrorMessage,
  createCommunityIdempotencyKey,
  type CommunityBattleBootstrap,
  type CommunityBattleEquipment,
  type CommunityBattleFriendCandidate,
  type CommunityBattleInventoryPage,
  type CommunityBattleLeaderboard,
  type CommunityBattleMode,
  type CommunityBattleProfession,
  type CommunityBattleRequest,
  type CommunityBattleSettlement,
} from '../../api/community';
import { Button, Card, EmptyState, PageHeader, Tag } from '../../components/ui';
import {
  EQUIPMENT_SLOTS,
  PROFESSION_DEFINITIONS,
  RARITY_DEFINITIONS,
} from './office-battle-domain';
import { submitBattleWithRecovery } from './battle-request-recovery';
import { ServerBattleReplay } from './ServerBattleReplay';
import { CommunityGuildPanel } from './CommunityGuildPanel';
import { CommunityBattleCampaignPanel } from './CommunityBattleCampaign';
import {
  CommunityBattleGrowthPanel,
  CommunityBattleModeGuide,
  CommunityBattleSkillCodex,
} from './CommunityBattleProgression';
import styles from './CommunityBattlePage.module.css';

type BattleTab = 'overview' | 'campaign' | 'growth' | 'skills' | 'equipment' | 'ranking' | 'guild' | 'history' | 'defense';

const TABS: ReadonlyArray<{ id: BattleTab; label: string }> = [
  { id: 'overview', label: '战斗' },
  { id: 'campaign', label: 'PVE 副本' },
  { id: 'growth', label: '成长' },
  { id: 'equipment', label: '装备' },
  { id: 'skills', label: '技能图鉴' },
  { id: 'ranking', label: '排行' },
  { id: 'guild', label: '帮派' },
  { id: 'history', label: '记录' },
  { id: 'defense', label: '设置' },
];

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '待更新';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
}

function professionName(profession: CommunityBattleProfession): string {
  return PROFESSION_DEFINITIONS.find((item) => item.id === profession)?.name ?? profession;
}

function slotName(slot: CommunityBattleEquipment['slot']): string {
  return EQUIPMENT_SLOTS.find((item) => item.id === slot)?.name ?? slot;
}

function rarityName(rarity: CommunityBattleEquipment['rarity']): string {
  return RARITY_DEFINITIONS[rarity]?.label ?? rarity;
}

function isRestricted(bootstrap: CommunityBattleBootstrap): boolean {
  return bootstrap.profile?.accountState !== 'active';
}

export function CommunityBattlePage(): JSX.Element {
  const [bootstrap, setBootstrap] = useState<CommunityBattleBootstrap | null>(null);
  const [inventory, setInventory] = useState<CommunityBattleInventoryPage | null>(null);
  const [history, setHistory] = useState<Awaited<ReturnType<typeof communityBattleApi.getHistory>> | null>(null);
  const [ranking, setRanking] = useState<CommunityBattleLeaderboard | null>(null);
  const [rankingMode, setRankingMode] = useState<'pve' | 'pvp'>('pve');
  const [skillMode, setSkillMode] = useState<CommunityBattleMode>('pve');
  const [rankingProfession, setRankingProfession] = useState<CommunityBattleProfession | 'all'>('all');
  const [settlement, setSettlement] = useState<CommunityBattleSettlement | null>(null);
  const [tab, setTab] = useState<BattleTab>('overview');
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [challengeVisibility, setChallengeVisibility] = useState<'friends' | 'none'>('friends');
  const [equipmentVisibility, setEquipmentVisibility] = useState<'public' | 'friends' | 'private'>('friends');

  const loadBootstrap = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await communityBattleApi.getBootstrap();
      setBootstrap(result);
      setChallengeVisibility(result.defense?.challengeVisibility ?? 'friends');
      setEquipmentVisibility(result.defense?.equipmentVisibility ?? 'friends');
    } catch (requestError) {
      setError(communityBattleErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap]);

  useEffect(() => {
    if (tab !== 'equipment' || inventory || !bootstrap?.profile) return;
    setBusyKey('inventory:load');
    communityBattleApi.getInventory()
      .then(setInventory)
      .catch((requestError) => setError(communityBattleErrorMessage(requestError)))
      .finally(() => setBusyKey(null));
  }, [bootstrap?.profile, inventory, tab]);

  useEffect(() => {
    if (tab !== 'history' || history || !bootstrap?.profile) return;
    setBusyKey('history:load');
    communityBattleApi.getHistory()
      .then(setHistory)
      .catch((requestError) => setError(communityBattleErrorMessage(requestError)))
      .finally(() => setBusyKey(null));
  }, [bootstrap?.profile, history, tab]);

  useEffect(() => {
    if (tab !== 'ranking' || !bootstrap?.profile) return;
    setBusyKey('ranking:load');
    communityBattleApi.getLeaderboard(rankingMode, rankingProfession)
      .then(setRanking)
      .catch((requestError) => setError(communityBattleErrorMessage(requestError)))
      .finally(() => setBusyKey(null));
  }, [bootstrap?.profile, rankingMode, rankingProfession, tab]);

  const canMutate = Boolean(
    bootstrap?.profile &&
    !isRestricted(bootstrap) &&
    bootstrap.clientCompatibility.status === 'current',
  );

  const refreshAssets = useCallback(async () => {
    const [nextBootstrap, nextInventory] = await Promise.all([
      communityBattleApi.getBootstrap(),
      communityBattleApi.getInventory(),
    ]);
    setBootstrap(nextBootstrap);
    setInventory(nextInventory);
  }, []);

  async function chooseProfession(profession: CommunityBattleProfession): Promise<void> {
    setBusyKey(`profession:${profession}`);
    setError(null);
    try {
      const result = await communityBattleApi.chooseProfession(
        profession,
        bootstrap?.profile?.profileVersion ?? null,
        createCommunityIdempotencyKey('battle-class'),
      );
      setBootstrap(result);
      setNotice(`已选择职业：${professionName(profession)}`);
    } catch (requestError) {
      setError(communityBattleErrorMessage(requestError));
    } finally {
      setBusyKey(null);
    }
  }

  async function startBattle(
    opponent: CommunityBattleRequest['opponent'],
    mode: CommunityBattleRequest['mode'],
  ): Promise<void> {
    if (!bootstrap?.profile || !canMutate) return;
    const request: CommunityBattleRequest = Object.freeze({
      battleRequestId: createCommunityIdempotencyKey('battle'),
      opponent,
      mode,
      loadoutVersion: bootstrap.profile.loadoutVersion,
    });
    const key = opponent.kind === 'npc' ? `battle:${opponent.offerId}` : `friend:${opponent.publicId}`;
    setBusyKey(key);
    setError(null);
    setNotice('战斗开始，正在生成战报…');
    try {
      const result = await submitBattleWithRecovery(
        request,
        (exactRequest) => exactRequest.opponent.kind === 'friend'
          ? communityBattleApi.createFriendBattle(
              exactRequest as CommunityBattleRequest & {
                opponent: { kind: 'friend'; publicId: string };
              },
            )
          : communityBattleApi.createBattle(exactRequest),
        communityBattleApi.getBattleByRequest,
      );
      setSettlement(result);
      setNotice('战斗结束，完整战报已生成。');
      setBootstrap(await communityBattleApi.getBootstrap());
      setHistory(null);
      setInventory(null);
    } catch (requestError) {
      setError(communityBattleErrorMessage(requestError));
    } finally {
      setBusyKey(null);
    }
  }

  function challengeFriend(friend: CommunityBattleFriendCandidate): void {
    const mode = friend.eligibleForReward ? 'reward' : 'practice';
    const key = `practice-confirm:${friend.publicId}`;
    if (friend.requiresPracticeConfirmation && confirmKey !== key) {
      setConfirmKey(key);
      setNotice('本次好友挑战不计奖励。再次点击确认进行零消耗、零奖励练习赛。');
      return;
    }
    setConfirmKey(null);
    void startBattle({ kind: 'friend', publicId: friend.publicId }, mode);
  }

  async function replaceEquipment(item: CommunityBattleEquipment): Promise<void> {
    if (!inventory || !bootstrap?.profile || !canMutate) return;
    if (item.profession !== bootstrap.profile.profession || item.requiredLevel > bootstrap.profile.battleLevel) {
      setError('这件装备的职业或等级要求与当前角色不匹配');
      return;
    }
    const equipmentIds = inventory.loadout.equipment
      .filter((equipped) => equipped.slot !== item.slot)
      .map((equipped) => equipped.id)
      .concat(item.id);
    setBusyKey(`equip:${item.id}`);
    setError(null);
    try {
      await communityBattleApi.updateLoadout(
        equipmentIds,
        inventory.loadout.version,
        createCommunityIdempotencyKey('battle-loadout'),
      );
      await refreshAssets();
      setNotice(`已换上 ${slotName(item.slot)}：${item.name}`);
    } catch (requestError) {
      setError(communityBattleErrorMessage(requestError));
    } finally {
      setBusyKey(null);
    }
  }

  async function toggleEquipmentLock(item: CommunityBattleEquipment): Promise<void> {
    if (!inventory || !canMutate) return;
    setBusyKey(`lock:${item.id}`);
    setError(null);
    try {
      await communityBattleApi.setEquipmentLock(
        item.id,
        !item.locked,
        inventory.inventoryVersion,
        createCommunityIdempotencyKey('battle-lock'),
      );
      await refreshAssets();
      setNotice(item.locked ? '已解除装备锁定' : '已锁定装备');
    } catch (requestError) {
      setError(communityBattleErrorMessage(requestError));
    } finally {
      setBusyKey(null);
    }
  }

  async function salvageEquipment(item: CommunityBattleEquipment): Promise<void> {
    if (!inventory || !canMutate) return;
    const key = `salvage:${item.id}`;
    if (confirmKey !== key) {
      setConfirmKey(key);
      setNotice(`再次点击确认分解“${item.name}”。分解后的装备不可恢复。`);
      return;
    }
    setConfirmKey(null);
    setBusyKey(key);
    setError(null);
    try {
      const result = await communityBattleApi.salvageEquipment(
        [item.id],
        inventory.inventoryVersion,
        createCommunityIdempotencyKey('battle-salvage'),
      );
      await refreshAssets();
      setNotice(`分解完成，获得 ${result.partsGranted} 个零件`);
    } catch (requestError) {
      setError(communityBattleErrorMessage(requestError));
    } finally {
      setBusyKey(null);
    }
  }

  async function enhanceEquipment(item: CommunityBattleEquipment): Promise<void> {
    if (!inventory || !canMutate || !bootstrap?.catalog.capabilities.enhancementEnabled) return;
    setBusyKey(`enhance:${item.id}`);
    setError(null);
    try {
      const result = await communityBattleApi.enhanceEquipment(
        item.id,
        inventory.inventoryVersion,
        createCommunityIdempotencyKey('battle-enhance'),
      );
      await refreshAssets();
      setNotice(`强化成功：${result.changedEquipment?.name ?? item.name} +${result.changedEquipment?.enhancementLevel ?? item.enhancementLevel + 1}，消耗 ${result.partsSpent} 个零件`);
    } catch (requestError) {
      setError(communityBattleErrorMessage(requestError));
    } finally {
      setBusyKey(null);
    }
  }

  async function upgradeSkill(skillId: string, skillName: string): Promise<void> {
    if (!bootstrap?.profile || !canMutate) return;
    setBusyKey(`skill:${skillId}`);
    setError(null);
    try {
      const result = await communityBattleApi.upgradeSkill(
        skillId,
        bootstrap.profile.profileVersion,
        createCommunityIdempotencyKey('battle-skill'),
      );
      setBootstrap({ ...bootstrap, profile: result.profile });
      setNotice(`${skillName}已升到 Lv.${result.profile.skillLevels[skillId] ?? 0}，战力已更新`);
    } catch (requestError) {
      setError(communityBattleErrorMessage(requestError));
    } finally {
      setBusyKey(null);
    }
  }

  async function resolvePendingReward(
    rewardId: string,
    action: 'claim' | 'salvage',
  ): Promise<void> {
    if (!bootstrap?.profile || !canMutate) return;
    setBusyKey(`reward:${rewardId}:${action}`);
    setError(null);
    try {
      const key = createCommunityIdempotencyKey(`battle-reward-${action}`);
      if (action === 'claim') {
        await communityBattleApi.claimReward(rewardId, bootstrap.profile.inventoryVersion, key);
      } else {
        await communityBattleApi.salvageReward(rewardId, bootstrap.profile.inventoryVersion, key);
      }
      await loadBootstrap();
      setInventory(null);
      setNotice(action === 'claim' ? '装备已领取到仓库' : '装备已分解');
    } catch (requestError) {
      setError(communityBattleErrorMessage(requestError));
    } finally {
      setBusyKey(null);
    }
  }

  async function saveDefense(): Promise<void> {
    if (!bootstrap?.profile || !bootstrap.loadout || !canMutate) return;
    setBusyKey('defense:save');
    setError(null);
    try {
      const result = await communityBattleApi.updateDefense(
        {
          equipmentIds: bootstrap.loadout.equipment.map((item) => item.id),
          challengeVisibility,
          equipmentVisibility,
        },
        bootstrap.defense?.version ?? bootstrap.profile.defenseVersion,
        createCommunityIdempotencyKey('battle-defense'),
      );
      setBootstrap({ ...bootstrap, defense: result, profile: { ...bootstrap.profile, defenseVersion: result.version } });
      setNotice('防守阵容和可见范围已保存');
    } catch (requestError) {
      setError(communityBattleErrorMessage(requestError));
    } finally {
      setBusyKey(null);
    }
  }

  async function openHistoryBattle(battleId: string): Promise<void> {
    setBusyKey(`history:${battleId}`);
    setError(null);
    try {
      setSettlement(await communityBattleApi.getBattle(battleId));
      setNotice('完整战斗记录已打开');
    } catch (requestError) {
      setError(communityBattleErrorMessage(requestError));
    } finally {
      setBusyKey(null);
    }
  }

  function handleTabKeys(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    let next = index;
    if (event.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length;
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = TABS.length - 1;
    setTab(TABS[next].id);
    const tabButtons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    tabButtons?.[next]?.focus();
  }

  const levelProgress = useMemo(() => {
    if (!bootstrap?.profile || !bootstrap.profile.experienceToNextLevel) return 100;
    return Math.min(100, Math.round(
      bootstrap.profile.experienceInLevel /
      bootstrap.profile.experienceToNextLevel * 100,
    ));
  }, [bootstrap?.profile]);

  if (loading && !bootstrap) {
    return <main className={styles.page}><p role="status">正在加载办公室乐斗…</p></main>;
  }

  if (!bootstrap) {
    return (
      <main className={styles.page}>
        <PageHeader title="办公室乐斗" subtitle="角色资料暂时无法加载" />
        <p className={styles.error} role="alert">{error}</p>
        <Button variant="secondary" onClick={() => void loadBootstrap()}>重新加载</Button>
      </main>
    );
  }

  if (!bootstrap.profile) {
    return (
      <main className={styles.page}>
        <PageHeader
          title="创建乐斗角色"
          subtitle="先选择一个职业方向，职业会影响基础属性、技能和专属装备。"
          actions={<Tag color="success">在线角色</Tag>}
        />
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        <Card title="选择一个游戏职业">
          <div className={styles.professionGrid}>
            {PROFESSION_DEFINITIONS.map((profession) => (
              <button
                key={profession.id}
                type="button"
                className={styles.professionChoice}
                onClick={() => void chooseProfession(profession.id)}
                disabled={busyKey !== null}
                aria-describedby={`profession-${profession.id}`}
              >
                <span aria-hidden="true">{profession.mark}</span>
                <strong>{profession.name}</strong>
                <small id={`profession-${profession.id}`}>{profession.slogan}</small>
              </button>
            ))}
          </div>
          <p className={styles.safetyNote}>职业可以在冷却期结束后更换；不同职业拥有独立的装备名称与战斗路线。</p>
        </Card>
      </main>
    );
  }

  const profile = bootstrap.profile;

  return (
    <main className={styles.page}>
      <PageHeader
        title="办公室乐斗"
        subtitle={`${professionName(profile.profession)} · 选对手、开打、拿奖励`}
        actions={<Tag color="success">在线档案</Tag>}
      />
      {bootstrap.clientCompatibility.status === 'upgrade_required' ? (
        <p className={styles.error} role="alert">
          {bootstrap.clientCompatibility.message || '当前网页版本过旧，不能发起对战或变更资产；历史记录仍可查看。'}
        </p>
      ) : null}
      {profile.accountState !== 'active' ? (
        <p className={styles.error} role="alert">
          {profile.accountState === 'banned' ? '当前角色已被封禁' : '当前角色受到限制'}
          {profile.restrictionReason ? `：${profile.restrictionReason}` : '，资产操作和对战已停止。'}
        </p>
      ) : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}

      <section className={styles.summaryGrid} aria-label="角色摘要">
        <div><span>等级</span><strong>Lv.{profile.battleLevel}</strong><small>{profile.wins} 胜 {profile.losses} 负</small></div>
        <div><span>体力</span><strong>{profile.energy.current}/{profile.energy.max}</strong><small>{profile.energy.nextRecoveryAt ? `${formatDateTime(profile.energy.nextRecoveryAt)} +1` : '已满'}</small></div>
        <div data-mode="pve"><span>PVE 项目战力</span><strong>{profile.modeSnapshots?.pve.power ?? profile.pvePower ?? profile.power}</strong><small>全强化 · PVE 技能</small></div>
        <div data-mode="pvp"><span>PVP 好友战力</span><strong>{profile.modeSnapshots?.pvp.power ?? profile.pvpPower ?? profile.power}</strong><small>强化增量 60% · PVP 技能</small></div>
        <div><span>办公币</span><strong>{profile.workspaceCoins}</strong><small>技能点 PVE {profile.skillPoints.pve.available} · PVP {profile.skillPoints.pvp.available}</small></div>
      </section>
      <div className={styles.levelProgress}>
        <div><span>当前等级进度</span><strong>{levelProgress}%</strong></div>
        <progress max={100} value={levelProgress}>{levelProgress}%</progress>
      </div>

      <div className={styles.tabs} role="tablist" aria-label="办公室乐斗功能">
        {TABS.map((item, index) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            tabIndex={tab === item.id ? 0 : -1}
            data-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            onKeyDown={(event) => handleTabKeys(event, index)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <div role="tabpanel" className={styles.stack}>
          <CommunityBattleModeGuide bootstrap={bootstrap} profile={profile} />
          <Card title="PVE · 项目主线">
            <div className={styles.pveEntry}>
              <div>
                <strong>{bootstrap.catalog.pveCampaign?.chapters.find((chapter) => chapter.id === bootstrap.pveCampaign?.activeChapterId)?.name ?? '项目挑战'}</strong>
                <small>{bootstrap.pveCampaign ? `已通关 ${bootstrap.pveCampaign.clearedStages}/${bootstrap.pveCampaign.totalStages} 关` : '普通关、精英关与 Boss 关'}</small>
              </div>
              <Button onClick={() => setTab('campaign')}>进入 PVE 副本</Button>
            </div>
          </Card>

          <Card title="PVP · 好友对战">
            {!bootstrap.catalog.capabilities.friendChallengesEnabled ? (
              <EmptyState title="好友挑战暂不可用" message="稍后再来看看。" />
            ) : bootstrap.friendCandidates.length === 0 ? (
              <EmptyState title="暂无可挑战好友" message="成为好友满 24 小时且双方允许挑战后，即可在这里发起切磋。" />
            ) : (
              <ul className={styles.friendList}>
                {bootstrap.friendCandidates.map((friend) => (
                  <li key={friend.publicId}>
                    <div>
                      <strong>{friend.displayName}</strong>
                      <small>{friend.publicId} · {professionName(friend.profession)} · Lv.{friend.battleLevel}</small>
                      {friend.reason ? <p>{friend.reason}</p> : null}
                    </div>
                    <Button
                      variant={friend.eligibleForReward ? 'primary' : 'secondary'}
                      loading={busyKey === `friend:${friend.publicId}`}
                      disabled={!canMutate}
                      onClick={() => challengeFriend(friend)}
                    >
                      {confirmKey === `practice-confirm:${friend.publicId}`
                        ? '确认练习赛'
                        : friend.eligibleForReward ? 'PVP 好友挑战' : 'PVP 练习挑战'}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {bootstrap.pendingRewards.length > 0 ? (
            <Card title="待领取装备">
              <p className={styles.muted}>仓库满时，掉落不会丢失，也不会由前端直接塞入仓库。</p>
              <ul className={styles.friendList}>
                {bootstrap.pendingRewards.map((reward) => (
                  <li key={reward.id}>
                    <div><strong>{reward.equipment.name}</strong><small>{slotName(reward.equipment.slot)} · {rarityName(reward.equipment.rarity)}</small></div>
                    <div className={styles.inlineActions}>
                      <Button loading={busyKey === `reward:${reward.id}:claim`} onClick={() => void resolvePendingReward(reward.id, 'claim')} disabled={!canMutate}>领取</Button>
                      <Button variant="danger" loading={busyKey === `reward:${reward.id}:salvage`} onClick={() => void resolvePendingReward(reward.id, 'salvage')} disabled={!canMutate}>直接分解</Button>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === 'campaign' ? (
        <CommunityBattleCampaignPanel
          bootstrap={bootstrap}
          profile={profile}
          busyKey={busyKey}
          canMutate={canMutate}
          onBattle={(offerId, mode) => void startBattle({ kind: 'npc', offerId }, mode)}
        />
      ) : null}

      {tab === 'growth' ? (
        <CommunityBattleGrowthPanel
          bootstrap={bootstrap}
          profile={profile}
          levelProgress={levelProgress}
        />
      ) : null}

      {tab === 'skills' ? (
        <CommunityBattleSkillCodex
          bootstrap={bootstrap}
          profile={profile}
          mode={skillMode}
          onModeChange={setSkillMode}
          busyKey={busyKey}
          canMutate={canMutate}
          onUpgrade={(skill) => void upgradeSkill(skill.id, skill.name)}
        />
      ) : null}

      {tab === 'ranking' ? (
        <Card title="战力排行榜">
          <div className={styles.rankingFilters}>
            <label>
              对战类型
              <select value={rankingMode} onChange={(event) => setRankingMode(event.target.value as 'pve' | 'pvp')}>
                <option value="pve">PVE 战力</option>
                <option value="pvp">PVP 战力</option>
              </select>
            </label>
            <label>
              职业分榜
              <select value={rankingProfession} onChange={(event) => setRankingProfession(event.target.value as CommunityBattleProfession | 'all')}>
                <option value="all">全职业</option>
                {PROFESSION_DEFINITIONS.map((profession) => (
                  <option key={profession.id} value={profession.id}>{profession.name}</option>
                ))}
              </select>
            </label>
          </div>
          <p className={styles.muted}>
            PVE 计入装备全部强化和 PVE 技能；PVP 使用 PVP 技能，并按强化增量的 60% 计入。战力相同时依次比较等级与胜场。
          </p>
          {busyKey === 'ranking:load' ? <p role="status">排行榜加载中…</p> : null}
          {ranking && ranking.items.length === 0 ? <EmptyState title="暂无排名" message="完成职业选择和装备配置后即可参与排名。" /> : null}
          {ranking && ranking.items.length > 0 ? (
            <div className={styles.rankingScroller}>
              <div className={styles.rankingTable} role="table" aria-label="办公室乐斗战力排行榜">
                <div role="row" className={styles.rankingHeader}>
                  <span role="columnheader">排名</span><span role="columnheader">玩家</span><span role="columnheader">职业</span><span role="columnheader">等级</span><span role="columnheader">战力</span><span role="columnheader">战绩</span>
                </div>
                {ranking.items.map((item) => (
                  <div role="row" key={item.publicId}>
                    <strong role="cell">#{item.rank}</strong>
                    <span role="cell">{item.displayName}</span>
                    <span role="cell">{professionName(item.profession)}</span>
                    <span role="cell">Lv.{item.battleLevel}</span>
                    <b role="cell">{item.power}</b>
                    <span role="cell">{item.wins} 胜 {item.losses} 负</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}

      {tab === 'equipment' ? (
        <div role="tabpanel" className={styles.stack}>
          <Card title="当前六件装备" headerActions={<Tag color="neutral">版本 {inventory?.loadout.version ?? profile.loadoutVersion}</Tag>}>
            {busyKey === 'inventory:load' ? <p role="status">正在加载装备仓库…</p> : null}
            {inventory ? (
              <div className={styles.loadoutGrid}>
                {EQUIPMENT_SLOTS.map((slot) => {
                  const item = inventory.loadout.equipment.find((entry) => entry.slot === slot.id);
                  return <div key={slot.id}><span>{slot.name}</span><strong>{item?.name ?? '基础装备'}</strong><small>{item ? `${rarityName(item.rarity)} · Lv.${item.requiredLevel} · +${item.enhancementLevel}` : '不可为空'}</small></div>;
                })}
              </div>
            ) : null}
          </Card>

          <Card
            title="装备仓库"
            headerActions={inventory ? <Tag color={inventory.total >= inventory.limit ? 'danger' : 'neutral'}>{inventory.total}/{inventory.limit}</Tag> : null}
          >
            {inventory && inventory.items.length === 0 ? <EmptyState title="仓库为空" message="完成有奖励的战斗后，掉落装备会显示在这里。" /> : null}
            {inventory ? (
              <ul className={styles.inventoryList}>
                {inventory.items.map((item) => {
                  const enhancementCoins = bootstrap.catalog.enhancement.coinCosts[item.enhancementLevel] ?? 0;
                  const enhancementParts = bootstrap.catalog.enhancement.partCosts[item.enhancementLevel] ?? 0;
                  const maxEnhanced = item.enhancementLevel >= bootstrap.catalog.enhancement.maxLevel;
                  const cannotAffordEnhancement = profile.parts < enhancementParts || profile.workspaceCoins < enhancementCoins;
                  return (
                  <li key={item.id} data-equipped={item.equipped}>
                    <div>
                      <span>{slotName(item.slot)} · {rarityName(item.rarity)}</span>
                      <strong>{item.name}</strong>
                      <small>
                        {professionName(item.profession)}限定 · 装备 Lv.{item.equipmentLevel} · 门槛 Lv.{item.requiredLevel}
                        {' · '}评分 {item.score} · 熟练 +{item.enhancementLevel}
                      </small>
                    </div>
                    <div className={styles.inlineActions}>
                      <Button variant="secondary" loading={busyKey === `equip:${item.id}`} disabled={!canMutate || item.equipped} onClick={() => void replaceEquipment(item)}>{item.equipped ? '已装备' : '替换到槽位'}</Button>
                      <Button variant="secondary" loading={busyKey === `lock:${item.id}`} disabled={!canMutate} onClick={() => void toggleEquipmentLock(item)}>{item.locked ? '解除锁定' : '锁定'}</Button>
                      <Button
                        variant="secondary"
                        loading={busyKey === `enhance:${item.id}`}
                        disabled={!canMutate || !bootstrap.catalog.capabilities.enhancementEnabled || maxEnhanced || cannotAffordEnhancement}
                        title={maxEnhanced ? `已达到 +${bootstrap.catalog.enhancement.maxLevel}` : cannotAffordEnhancement ? `需要 ${enhancementCoins} 办公币与 ${enhancementParts} 个零件` : `强化成功率 ${bootstrap.catalog.enhancement.successRate}%`}
                        onClick={() => void enhanceEquipment(item)}
                      >
                        {!bootstrap.catalog.capabilities.enhancementEnabled ? '强化未开放' : maxEnhanced ? '强化已满' : `${enhancementCoins} 币 + ${enhancementParts} 零件`}
                      </Button>
                      <Button variant="danger" loading={busyKey === `salvage:${item.id}`} disabled={!canMutate || item.equipped || item.locked || !item.canSalvage} onClick={() => void salvageEquipment(item)}>{confirmKey === `salvage:${item.id}` ? '确认分解' : '分解'}</Button>
                    </div>
                  </li>
                  );
                })}
              </ul>
            ) : null}
          </Card>
        </div>
      ) : null}

      {tab === 'history' ? (
        <Card title="战斗记录" headerActions={<Button variant="secondary" onClick={() => { setHistory(null); setSettlement(null); }}>刷新记录</Button>}>
          {busyKey === 'history:load' ? <p role="status">正在加载战斗记录…</p> : null}
          {history && history.items.length === 0 ? <EmptyState title="还没有战斗记录" message="完成第一场战斗后，战报会保存在这里。" /> : null}
          {history ? (
            <ul className={styles.historyList}>
              {history.items.map((item) => (
                <li key={item.battleId}>
                  <div>
                    <strong>{item.opponentKind === 'npc' ? 'PVE' : 'PVP'} · {item.winner === 'player' ? '胜出' : '惜败'} · {item.pveStage?.name ?? item.opponent.displayName}</strong>
                    <small>{formatDateTime(item.completedAt)} · {item.mode === 'practice' ? '练习赛' : '奖励战'} · {item.rewardSummary}</small>
                  </div>
                  <Button variant="secondary" loading={busyKey === `history:${item.battleId}`} onClick={() => void openHistoryBattle(item.battleId)}>查看完整回放</Button>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      ) : null}

      {tab === 'guild' ? <CommunityGuildPanel onAssetsChanged={loadBootstrap} /> : null}

      {tab === 'defense' ? (
        <div role="tabpanel" className={styles.stack}>
          <Card title="好友挑战与装备可见范围">
            <div className={styles.settingsGrid}>
              <label>
                谁可以挑战
                <select value={challengeVisibility} onChange={(event) => setChallengeVisibility(event.target.value as 'friends' | 'none')} disabled={!canMutate}>
                  <option value="friends">成为好友满 24 小时</option>
                  <option value="none">关闭好友挑战</option>
                </select>
              </label>
              <label>
                谁可以看防守装备
                <select value={equipmentVisibility} onChange={(event) => setEquipmentVisibility(event.target.value as 'public' | 'friends' | 'private')} disabled={!canMutate}>
                  <option value="public">所有人</option>
                  <option value="friends">仅好友</option>
                  <option value="private">仅自己</option>
                </select>
              </label>
            </div>
            <p className={styles.muted}>挑战权限与装备展示可以分别设置。被挑战者不扣体力，也不会损失装备或其他资产。</p>
            <Button loading={busyKey === 'defense:save'} disabled={!canMutate} onClick={() => void saveDefense()}>保存设置</Button>
          </Card>

          <Card title="公开规则与概率">
            <dl className={styles.rulesList}>
              <div><dt>体力恢复</dt><dd>上限 {bootstrap.catalog.energy.max}，每 {bootstrap.catalog.energy.recoveryMinutes} 分钟恢复 1 点</dd></div>
              <div><dt>仓库上限</dt><dd>{bootstrap.catalog.inventoryLimit} 件，满仓掉落进入待领取区</dd></div>
              <div><dt>练习赛</dt><dd>不限次数，消耗 0，奖励 0</dd></div>
              <div><dt>PVP 奖励</dt><dd>每天最多 {bootstrap.dailyActions?.rewardedFriendBattlesLimit ?? 5} 场，同一好友每天最多 1 场；超出可确认转为练习赛</dd></div>
              <div><dt>回合上限</dt><dd>最多 10 回合，战斗结束后可查看完整战报</dd></div>
            </dl>
            <div className={styles.rarityGrid}>
              {bootstrap.catalog.rarityRates.map((item) => (
                <div key={item.rarity}><strong>{item.label}</strong><span>{item.rate}%</span></div>
              ))}
            </div>
            <p className={styles.safetyNote}>掉落概率会随对手难度变化，稀有度越高的装备越难获得。</p>
          </Card>
        </div>
      ) : null}

      {settlement ? <ServerBattleReplay settlement={settlement} /> : null}
    </main>
  );
}
