import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';

import { COMMUNITY_FEATURE_FLAGS } from '../../app/community-nav';
import { useCommunityAuthStore } from '../../app/store/community-auth-store';
import {
  communityFarmApi,
  communityFeedsApi,
  communityProfileApi,
  communityRelationshipsApi,
  createCommunityIdempotencyKey,
  type CommunityFeedType,
  type CommunityPublicProfile,
} from '../../api/community';
import { Button, Card, EmptyState, PageHeader, Tag } from '../../components/ui';
import { COMMUNITY_PROFESSIONS } from './community-professions';
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
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string>();
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [encouraged, setEncouraged] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const encouragementTimer = useRef<number>();

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

  const profession = useMemo(
    () => COMMUNITY_PROFESSIONS.find((item) => item.id === profile?.battleProfession),
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
      setNotice(`投喂成功：${result.event.type}`);
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
      setNotice('鼓励已送达');
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
            actions={<Tag>社区职业 · {profession?.name ?? profile.battleProfession}</Tag>}
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
                    '好友申请已发送',
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

          <div className={styles.grid}>
            <Card title="摸鱼升职记 · 工位塔防">
              <p>{profile.displayName}的系统头像就是工位守卫。当前版本每局只有一个角色，塔防成绩仅保存在玩家自己的浏览器中。</p>
              <Link to="/tower-defense">进入工位塔防</Link>
            </Card>
            <Card title="荣誉">
              {!profile.honors ? <EmptyState title="未向你开放" message="荣誉可见范围由该用户控制。" /> : profile.honors.length === 0 ? <p>尚未获得荣誉</p> : <p>{profile.honors.join('、')}</p>}
            </Card>
          </div>
        </>
      ) : null}
    </main>
  );
}
