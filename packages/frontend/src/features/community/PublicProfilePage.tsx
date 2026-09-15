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
import { Button, EmptyState } from '../../components/ui';
import { COMMUNITY_PROFESSIONS } from './community-professions';
import { communityAvatarMark } from './profile-options';
import { communityRequestErrorMessage } from './request-error';
import {
  CommunitySocialVerificationPrompt,
  useCommunitySocialWriteBlocked,
} from './SocialVerificationGate';
import styles from './PublicProfile.module.css';
import { getCommunitySessionGeneration } from '../../api/community-http';
import { CommunityHonors, CommunityTitleBadge } from '../community-progression/CommunityTitleBadge';

const QUICK_FEEDS: Array<{ id: CommunityFeedType; label: string }> = [
  { id: 'coffee', label: '送咖啡' },
  { id: 'cookie', label: '送小饼干' },
  { id: 'cheer_note', label: '送加油便签' },
];

export function CommunityPublicProfilePage(): JSX.Element {
  const { publicId = '' } = useParams();
  // A fresh login can keep publicId unchanged. Observe the auth transition so
  // the existing generation key also clears a previous session's projection.
  const auth = useCommunityAuthStore();
  const owner = auth.user?.publicId;
  return <PublicProfileWorkspace key={`${publicId}:${owner}:${getCommunitySessionGeneration()}`} />;
}
function PublicProfileWorkspace(): JSX.Element {
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
  const alive = useRef(true);
  const readEpoch = useRef(0);
  const generation = getCommunitySessionGeneration();
  const viewerId = authUser?.publicId;
  const currentWorkspace = useCallback((): boolean => alive.current && getCommunitySessionGeneration() === generation && useCommunityAuthStore.getState().user?.publicId === viewerId, [generation, viewerId]);

  const load = useCallback(async (): Promise<void> => {
    if (!publicId || !currentWorkspace()) return;
    const epoch = ++readEpoch.current;
    const currentRead = (): boolean => currentWorkspace() && readEpoch.current === epoch;
    // Relationship/privacy changes can make this profile unavailable. Do not
    // retain previously visible honors or interaction controls during a reread.
    setProfile(null);
    setLoading(true);
    setError(undefined);
    try {
      const next = await communityProfileApi.getPublic(publicId);
      if (currentRead()) setProfile(next);
    } catch (requestError) {
      if (currentRead()) setError(communityRequestErrorMessage(requestError, '公开主页加载失败'));
    } finally {
      if (currentRead()) setLoading(false);
    }
  }, [publicId, currentWorkspace]);

  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
      readEpoch.current += 1;
      if (encouragementTimer.current) window.clearTimeout(encouragementTimer.current);
    };
  }, [load]);

  const profession = useMemo(
    () => COMMUNITY_PROFESSIONS.find((item) => item.id === profile?.battleProfession),
    [profile?.battleProfession],
  );

  if (authUser?.publicId === publicId) return <Navigate to="/me" replace />;
  // A restricted response never re-exposes cosmetic data. Normal visibility is
  // still entirely the server's projection, not a client guess based on friendship.
  const honorsHidden = profile?.relationship.status === 'blocked_by_me' || profile?.relationship.status === 'unavailable';

  async function mutate(
    key: string,
    operation: (idempotencyKey: string) => Promise<unknown>,
    successMessage: string,
  ): Promise<void> {
    if (!currentWorkspace()) return;
    setBusyKey(key);
    setError(undefined);
    setNotice(undefined);
    try {
      await operation(createCommunityIdempotencyKey(key));
      if (!currentWorkspace()) return;
      setNotice(successMessage);
      setConfirmBlock(false);
      await load();
    } catch (requestError) {
      if (currentWorkspace()) setError(communityRequestErrorMessage(requestError, '操作失败，请重试'));
    } finally {
      if (currentWorkspace()) setBusyKey(undefined);
    }
  }

  async function sendFeed(type: CommunityFeedType): Promise<void> {
    if (!profile || !currentWorkspace()) return;
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
      if (!currentWorkspace()) return;
      setNotice(`投喂成功：${result.event.type}`);
      await load();
    } catch (requestError) {
      if (currentWorkspace()) setError(communityRequestErrorMessage(requestError, '投喂失败，请重试'));
    } finally {
      if (currentWorkspace()) setBusyKey(undefined);
    }
  }

  async function encouragePlant(): Promise<void> {
    if (!profile || !currentWorkspace()) return;
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
      if (!currentWorkspace()) return;
      setEncouraged(true);
      setNotice('鼓励已送达');
      encouragementTimer.current = window.setTimeout(() => setEncouraged(false), 1800);
    } catch (requestError) {
      if (currentWorkspace()) setError(communityRequestErrorMessage(requestError, '鼓励失败，请重试'));
    } finally {
      if (currentWorkspace()) setBusyKey(undefined);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.pageLead}><span>PUBLIC PROFILE</span><p>同事档案 · 只展示对方向你开放的资料</p></div>
      {loading ? <p className={styles.loading} role="status">正在加载公开主页…</p> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {!loading && !profile ? <Button className={styles.retryButton} variant="secondary" onClick={() => void load()}>重新加载</Button> : null}
      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}

      {profile ? (
        <>
          <header className={`${styles.identity} ${styles.publicProfileHero}`} aria-labelledby="public-profile-title">
            <span className={styles.avatar} aria-hidden="true">{communityAvatarMark(profile.avatarKey)}</span>
            <div className={styles.identityDetails}>
              <p className={styles.identityCaption}>同事档案</p>
              <div className={styles.nameRow}>
                <h1 id="public-profile-title">{profile.displayName}</h1>
                <CommunityTitleBadge title={profile.equippedTitle} hidden={honorsHidden} />
              </div>
              <dl className={styles.identityMeta}>
                <div><dt>社区职业</dt><dd>{profession?.name ?? profile.battleProfession}</dd></div>
                <div><dt>公开编号</dt><dd className={styles.publicId}>{profile.publicId}</dd></div>
                {profile.ipRegion ? <div><dt>IP 归属地</dt><dd>{profile.ipRegion}</dd></div> : null}
              </dl>
            </div>
          </header>
          {socialWriteBlocked ? (
            <CommunitySocialVerificationPrompt action="主动与其他用户互动" className={styles.verification} />
          ) : null}
          <div className={styles.contentGrid}>
            <div className={styles.mainColumn}>
              <section className={styles.panel} aria-labelledby="public-profile-about-title">
                <div className={styles.panelHeading}><span aria-hidden="true">01 /</span><h2 id="public-profile-about-title">个人简介</h2></div>
                <p className={styles.bio}>{profile.bio || '这个用户还没有填写简介。'}</p>
              </section>
              <section className={styles.panel} aria-labelledby="public-profile-honors-title">
                <div className={styles.panelHeading}><span aria-hidden="true">02 /</span><h2 id="public-profile-honors-title">公开荣誉</h2></div>
                <p className={styles.muted}>佩戴称号与荣誉收藏是不同的展示范围。</p>
                {honorsHidden || !profile.honors ? <EmptyState className={styles.privateHonors} icon="◇" title="未向你开放" message="荣誉可见范围由该用户控制。" /> : profile.honors.length === 0 ? <p className={styles.emptyHonors}>尚未获得荣誉</p> : <div className={styles.honors}><CommunityHonors honors={profile.honors} /></div>}
              </section>
              <section className={`${styles.panel} ${styles.workspaceNote}`} aria-labelledby="public-profile-workspace-title">
                <div className={styles.panelHeading}><span aria-hidden="true">↗</span><h2 id="public-profile-workspace-title">工位防线</h2></div>
                <p className={styles.muted}>系统头像也会成为工位守卫。正式塔防与本机练习的进度、成绩和奖励分别保存，不根据公开档案推断对方战力。</p>
                <Link className={styles.textLink} to="/tower-defense">进入工位塔防 <span aria-hidden="true">→</span></Link>
              </section>
            </div>
            <div className={styles.sideColumn}>
              <section className={styles.panel} aria-labelledby="public-profile-actions-title">
                <div className={styles.panelHeading}><span aria-hidden="true">↔</span><h2 id="public-profile-actions-title">同事互动</h2></div>
                <p className={styles.muted}>关系变化后，互动入口会同步更新。</p>
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
                  {profile.relationship.status === 'friend' && COMMUNITY_FEATURE_FLAGS.chat && COMMUNITY_FEATURE_FLAGS.friends ? (
                    <Link className={styles.primaryLink} to={`/messages/with/${encodeURIComponent(profile.publicId)}`}>发私聊</Link>
                  ) : null}
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
              </section>

              {profile.relationship.canFeed && COMMUNITY_FEATURE_FLAGS.feed ? (
                <section className={styles.panel} aria-labelledby="public-profile-feed-title">
                  <div className={styles.panelHeading}><span aria-hidden="true">☕</span><h2 id="public-profile-feed-title">投喂好友</h2></div>
                  <div className={styles.inlineActions}>
                    {QUICK_FEEDS.map((item) => (
                      <Button key={item.id} variant="secondary" disabled={socialWriteBlocked} loading={busyKey === `feed:${profile.publicId}:${item.id}`} onClick={() => void sendFeed(item.id)}>{item.label}</Button>
                    ))}
                  </div>
                  <p className={styles.muted}>三种表现价值相同；每天同一好友只计一次。</p>
                </section>
              ) : null}

              {profile.plant && profile.relationship.canEncouragePlant && COMMUNITY_FEATURE_FLAGS.farm ? (
                <section className={`${styles.panel} ${styles.plantPanel}`} aria-labelledby="public-profile-plant-title">
                  <div className={styles.panelHeading}><span aria-hidden="true">☘</span><h2 id="public-profile-plant-title">工位绿植</h2></div>
                  <div className={styles.plantProfileRow} data-encouraged={encouraged}>
                    <span aria-hidden="true">☘</span>
                    <div><strong>{profile.plant.name}</strong><p>连续照料 {profile.plant.careStreak} 天</p></div>
                    <Button variant="secondary" disabled={socialWriteBlocked} loading={busyKey === `farm-encourage:${profile.publicId}`} onClick={() => void encouragePlant()}>鼓励一下</Button>
                  </div>
                  <p className={styles.muted}>好友鼓励只播放动画，不增加奖励、属性、经验或成熟速度。</p>
                </section>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </main>
  );
}
