import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';

import { COMMUNITY_FEATURE_FLAGS } from '../../app/community-nav';
import { useCommunityAuthStore } from '../../app/store/community-auth-store';
import {
  communityFarmApi,
  communityBattleApi,
  communityBattleErrorMessage,
  communityFeedsApi,
  communityProfileApi,
  communityRelationshipsApi,
  createCommunityIdempotencyKey,
  type CommunityFeedType,
  type CommunityBattlePublicRecord,
  type CommunityPublicProfile,
} from '../../api/community';
import { Button, Card, EmptyState, PageHeader, Tag } from '../../components/ui';
import { PROFESSION_DEFINITIONS } from '../office-battle/office-battle-domain';
import { communityAvatarMark } from './profile-options';
import { communityRequestErrorMessage } from './request-error';
import {
  CommunitySocialVerificationPrompt,
  useCommunitySocialWriteBlocked,
} from './SocialVerificationGate';
import styles from './CommunityPages.module.css';

const QUICK_FEEDS: Array<{ id: CommunityFeedType; label: string }> = [
  { id: 'coffee', label: '送咖啡' },
  { id: 'cookie', label: '送小饼干' },
  { id: 'cheer_note', label: '送加油便签' },
];

export function CommunityPublicProfilePage(): JSX.Element {
  const { publicId = '' } = useParams();
  const phase = useCommunityAuthStore((state) => state.phase);
  const authUser = useCommunityAuthStore((state) => state.user);
  const socialWriteBlocked = useCommunitySocialWriteBlocked();
  const [profile, setProfile] = useState<CommunityPublicProfile | null>(null);
  const [battleRecord, setBattleRecord] = useState<CommunityBattlePublicRecord | null>(null);
  const [battleRecordLoading, setBattleRecordLoading] = useState(false);
  const [battleRecordError, setBattleRecordError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string>();
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [encouraged, setEncouraged] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const encouragementTimer = useRef<number>();
  const canLoadServerBattleRecord =
    COMMUNITY_FEATURE_FLAGS.battleServer &&
    phase === 'active' &&
    authUser?.socialVerificationStatus === 'verified';

  const load = useCallback(async (): Promise<void> => {
    if (!publicId) return;
    setLoading(true);
    setError(undefined);
    try {
      setProfile(await communityProfileApi.getPublic(publicId));
    } catch (requestError) {
      setError(communityRequestErrorMessage(requestError, '公开主页加载失败'));
    } finally {
      setLoading(false);
    }
  }, [publicId]);

  useEffect(() => {
    void load();
    return () => {
      if (encouragementTimer.current) window.clearTimeout(encouragementTimer.current);
    };
  }, [load]);

  useEffect(() => {
    if (!publicId || !canLoadServerBattleRecord) return;
    setBattleRecordLoading(true);
    setBattleRecordError(undefined);
    communityBattleApi.getPublicRecord(publicId)
      .then(setBattleRecord)
      .catch((requestError) => setBattleRecordError(communityBattleErrorMessage(requestError)))
      .finally(() => setBattleRecordLoading(false));
  }, [canLoadServerBattleRecord, publicId]);

  const profession = useMemo(
    () => PROFESSION_DEFINITIONS.find((item) => item.id === profile?.battleProfession),
    [profile?.battleProfession],
  );

  if (authUser?.publicId === publicId) return <Navigate to="/me" replace />;

  async function mutate(
    key: string,
    operation: (idempotencyKey: string) => Promise<unknown>,
    successMessage: string,
  ): Promise<void> {
    setBusyKey(key);
    setError(undefined);
    setNotice(undefined);
    try {
      await operation(createCommunityIdempotencyKey(key));
      setNotice(successMessage);
      setConfirmBlock(false);
      await load();
    } catch (requestError) {
      setError(communityRequestErrorMessage(requestError, '操作失败，请重试'));
    } finally {
      setBusyKey(undefined);
    }
  }

  async function sendFeed(type: CommunityFeedType): Promise<void> {
    if (!profile) return;
    if (socialWriteBlocked) {
      setError('完成身份核验后才能投喂好友');
      return;
    }
    const key = `feed:${profile.publicId}:${type}`;
    setBusyKey(key);
    setError(undefined);
    setNotice(undefined);
    try {
      const result = await communityFeedsApi.send(
        { recipientPublicId: profile.publicId, type },
        createCommunityIdempotencyKey(key),
      );
      setNotice(`服务端已确认投喂：${result.event.type}`);
      await load();
    } catch (requestError) {
      setError(communityRequestErrorMessage(requestError, '投喂失败，请重试'));
    } finally {
      setBusyKey(undefined);
    }
  }

  async function encouragePlant(): Promise<void> {
    if (!profile) return;
    if (socialWriteBlocked) {
      setError('完成身份核验后才能鼓励好友绿植');
      return;
    }
    const key = `farm-encourage:${profile.publicId}`;
    setBusyKey(key);
    setError(undefined);
    setNotice(undefined);
    try {
      await communityFarmApi.encourage(
        profile.publicId,
        createCommunityIdempotencyKey(key),
      );
      setEncouraged(true);
      setNotice('服务端已确认鼓励；这只会播放动画，不改变奖励或成长进度');
      encouragementTimer.current = window.setTimeout(() => setEncouraged(false), 1800);
    } catch (requestError) {
      setError(communityRequestErrorMessage(requestError, '鼓励失败，请重试'));
    } finally {
      setBusyKey(undefined);
    }
  }

  return (
    <main className={styles.page}>
      {loading ? <p role="status">正在加载公开主页…</p> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {!loading && !profile ? <Button variant="secondary" onClick={() => void load()}>重新加载</Button> : null}
      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}

      {profile ? (
        <>
          <PageHeader
            title={profile.displayName}
            subtitle={`公开编号 ${profile.publicId}`}
            actions={<Tag>乐斗职业 · {profession?.name ?? profile.battleProfession}</Tag>}
          />
          {socialWriteBlocked ? (
            <CommunitySocialVerificationPrompt action="主动与其他用户互动" className={styles.error} />
          ) : null}
          <Card>
            <div className={styles.publicProfileHero}>
              <span className={styles.avatar} aria-hidden="true">{communityAvatarMark(profile.avatarKey)}</span>
              <div>
                <h2>{profile.displayName}</h2>
                <p>{profile.bio || '这个用户还没有填写简介。'}</p>
                {profile.ipRegion ? <small>IP 归属地：{profile.ipRegion}</small> : null}
              </div>
              <div className={styles.profileActions}>
                {phase === 'guest' ? <Link className={styles.primaryLink} to="/login">登录后互动</Link> : null}
                {profile.relationship.canRequest && COMMUNITY_FEATURE_FLAGS.friends ? (
                  <Button disabled={socialWriteBlocked} loading={busyKey === `friend-request:${profile.publicId}`} onClick={() => void mutate(
                    `friend-request:${profile.publicId}`,
                    (key) => communityRelationshipsApi.sendRequest(profile.publicId, key),
                    '好友申请已由服务端确认发送',
                  )}>发送好友申请</Button>
                ) : null}
                {profile.relationship.status === 'incoming_pending' && COMMUNITY_FEATURE_FLAGS.friends ? <Link to="/friends">处理好友申请</Link> : null}
                {profile.relationship.status === 'outgoing_pending' && profile.relationship.requestId && COMMUNITY_FEATURE_FLAGS.friends ? (
                  <Button variant="secondary" loading={busyKey === `cancel:${profile.relationship.requestId}`} onClick={() => void mutate(
                    `cancel:${profile.relationship.requestId}`,
                    (key) => communityRelationshipsApi.cancelRequest(profile.relationship.requestId!, key),
                    '好友申请已取消',
                  )}>取消申请</Button>
                ) : null}
                {profile.relationship.status === 'blocked_by_me' && COMMUNITY_FEATURE_FLAGS.friends ? (
                  <Button variant="secondary" loading={busyKey === `unblock:${profile.publicId}`} onClick={() => void mutate(
                    `unblock:${profile.publicId}`,
                    (key) => communityRelationshipsApi.unblock(profile.publicId, key),
                    '已解除拉黑',
                  )}>解除拉黑</Button>
                ) : profile.relationship.canBlock && COMMUNITY_FEATURE_FLAGS.friends ? (
                  <Button variant="danger" loading={busyKey === `block:${profile.publicId}`} onClick={() => {
                    if (!confirmBlock) {
                      setConfirmBlock(true);
                      return;
                    }
                    void mutate(
                      `block:${profile.publicId}`,
                      (key) => communityRelationshipsApi.block(profile.publicId, key),
                      '该用户已被拉黑',
                    );
                  }}>{confirmBlock ? '确认拉黑' : '拉黑'}</Button>
                ) : null}
              </div>
            </div>
          </Card>

          {profile.relationship.canFeed && COMMUNITY_FEATURE_FLAGS.feed ? (
            <Card title="投喂好友">
              <div className={styles.inlineActions}>
                {QUICK_FEEDS.map((item) => (
                  <Button key={item.id} variant="secondary" disabled={socialWriteBlocked} loading={busyKey === `feed:${profile.publicId}:${item.id}`} onClick={() => void sendFeed(item.id)}>{item.label}</Button>
                ))}
              </div>
              <p className={styles.muted}>三种表现价值相同；每天同一好友只计一次。</p>
            </Card>
          ) : null}

          {profile.plant && profile.relationship.canEncouragePlant && COMMUNITY_FEATURE_FLAGS.farm ? (
            <Card title="工位绿植">
              <div className={styles.plantProfileRow} data-encouraged={encouraged}>
                <span aria-hidden="true">☘</span>
                <div><strong>{profile.plant.name}</strong><p>连续照料 {profile.plant.careStreak} 天</p></div>
                <Button variant="secondary" disabled={socialWriteBlocked} loading={busyKey === `farm-encourage:${profile.publicId}`} onClick={() => void encouragePlant()}>鼓励一下</Button>
              </div>
              <p className={styles.muted}>好友鼓励只播放动画，不增加奖励、属性、经验或成熟速度。</p>
            </Card>
          ) : null}

          {canLoadServerBattleRecord ? (
            <Card title="办公室乐斗公开战绩">
              {battleRecordLoading ? <p role="status">正在加载经服务端隐私裁剪的战绩…</p> : null}
              {battleRecordError ? <p className={styles.error} role="alert">{battleRecordError}</p> : null}
              {battleRecord ? (
                <div className={styles.grid}>
                  <div>
                    <strong>战绩摘要</strong>
                    {battleRecord.battleLevel == null ? <p>未向当前关系开放</p> : <p>Lv.{battleRecord.battleLevel} · {battleRecord.wins ?? 0} 胜 · {battleRecord.losses ?? 0} 负</p>}
                  </div>
                  <div>
                    <strong>防守装备</strong>
                    {battleRecord.equipment == null ? <p>未向当前关系开放</p> : battleRecord.equipment.length === 0 ? <p>暂无公开装备</p> : <ul className={styles.plainList}>{battleRecord.equipment.map((item) => <li key={item.id}>{item.name} · Lv.{item.requiredLevel}</li>)}</ul>}
                  </div>
                  <div>
                    <strong>最近战斗</strong>
                    {battleRecord.recentBattles == null ? <p>未向当前关系开放</p> : battleRecord.recentBattles.length === 0 ? <p>暂无公开记录</p> : <ul className={styles.plainList}>{battleRecord.recentBattles.map((item) => <li key={item.battleId}>{item.result === 'win' ? '胜出' : '惜败'} · {new Date(item.completedAt).toLocaleDateString('zh-CN')}</li>)}</ul>}
                  </div>
                </div>
              ) : null}
              <p className={styles.muted}>页面只展示服务端按关系与隐私规则返回的字段，不从其他资料推断隐藏战绩或装备。</p>
            </Card>
          ) : (
          <div className={styles.grid}>
            <Card title="乐斗摘要">
              {profile.battleLevel == null ? <EmptyState title="未向你开放" message="该用户的战绩隐私设置不允许当前关系查看。" /> : <p>等级 {profile.battleLevel}</p>}
            </Card>
            <Card title="六件装备">
              {!profile.equipment ? <EmptyState title="未向你开放" message="装备可见范围由该用户控制。" /> : profile.equipment.length === 0 ? <p>尚未装备物品</p> : <ul className={styles.plainList}>{profile.equipment.map((item) => <li key={item.slot}>{item.slot} · {item.name} · Lv.{item.level}</li>)}</ul>}
            </Card>
            <Card title="荣誉">
              {!profile.honors ? <EmptyState title="未向你开放" message="荣誉可见范围由该用户控制。" /> : profile.honors.length === 0 ? <p>尚未获得荣誉</p> : <p>{profile.honors.join('、')}</p>}
            </Card>
          </div>
          )}
        </>
      ) : null}
    </main>
  );
}
