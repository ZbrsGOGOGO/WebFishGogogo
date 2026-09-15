import { useEffect, useMemo, useRef, useState, type FormEvent, type JSX } from 'react';
import { Link } from 'react-router-dom';

import { COMMUNITY_FEATURE_FLAGS } from '../../app/community-nav';
import { useCommunityAuthStore } from '../../app/store/community-auth-store';
import {
  communityFarmApi,
  communityProfileApi,
  type CommunityFarmOverview,
  type CommunityProfile,
} from '../../api/community';
import { Button, Card, Input, Tag, Textarea } from '../../components/ui';
import { COMMUNITY_PROFESSIONS } from './community-professions';
import { validateCommunityDisplayName } from '../community-auth/validation';
import styles from './CommunityPages.module.css';
import { COMMUNITY_AVATARS, communityAvatarMark } from './profile-options';
import { communityRequestErrorMessage } from './request-error';
import { getCommunitySessionGeneration } from '../../api/community-http';
import { CommunityHonors, CommunityTitleBadge } from '../community-progression/CommunityTitleBadge';
import { CommunityProgressionCard } from '../community-progression/CommunityProgressionCard';
import { WorkspaceOverview } from './WorkspaceOverview';
import profileStyles from './MyProfile.module.css';

export function CommunityMyProfilePage(): JSX.Element {
  const auth = useCommunityAuthStore();
  return <MyProfileWorkspace key={`${auth.user?.publicId}:${getCommunitySessionGeneration()}`} />;
}
function MyProfileWorkspace(): JSX.Element {
  const authUser = useCommunityAuthStore((state) => state.user);
  const generation = getCommunitySessionGeneration();
  const updateUser = useCommunityAuthStore((state) => state.updateUser);
  const [profile, setProfile] = useState<CommunityProfile | null>(authUser);
  const [farmOverview, setFarmOverview] = useState<CommunityFarmOverview>();
  const [farmUnavailable, setFarmUnavailable] = useState(false);
  const [displayName, setDisplayName] = useState(authUser?.displayName ?? '');
  const [bio, setBio] = useState('');
  const [avatarKey, setAvatarKey] = useState(authUser?.avatarKey ?? COMMUNITY_AVATARS[0].id);
  const [battleProfession, setBattleProfession] = useState(
    authUser?.battleProfession ?? COMMUNITY_PROFESSIONS[0].id,
  );
  const [loading, setLoading] = useState(true);
  const [profileReady, setProfileReady] = useState(false);
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const editor = useRef<HTMLDetailsElement>(null);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  useEffect(() => {
    let active = true;
    const current = (): boolean => active && getCommunitySessionGeneration() === generation && useCommunityAuthStore.getState().phase === 'active' && useCommunityAuthStore.getState().user?.publicId === authUser?.publicId;
    setLoading(true);
    setError(undefined);
    communityFarmApi
      .getOverview()
      .then((next) => {
        if (current()) { setFarmOverview(next); setFarmUnavailable(false); }
      })
      .catch(() => {
        if (current()) setFarmUnavailable(true);
      });
    communityProfileApi
      .getMe()
      .then((next) => {
        if (!current()) return;
        setProfile(next);
        setDisplayName(next.displayName ?? '');
        setBio(next.bio ?? '');
        setAvatarKey(next.avatarKey ?? COMMUNITY_AVATARS[0].id);
        setBattleProfession(next.battleProfession ?? COMMUNITY_PROFESSIONS[0].id);
        setProfileReady(true);
      })
      .catch((requestError) => {
        if (current()) setError(communityRequestErrorMessage(requestError, '主页加载失败'));
      })
      .finally(() => {
        if (current()) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [revision]);

  const profession = useMemo(
    () => COMMUNITY_PROFESSIONS.find((item) => item.id === profile?.battleProfession),
    [profile?.battleProfession],
  );

  const plantSummary = farmOverview
    ? farmOverview.state === 'idle'
      ? '尚未领养工位绿植'
      : `${farmOverview.plant.name} · Lv.${farmOverview.plant.level} · 连续照料 ${farmOverview.plant.careStreak} 天`
    : farmUnavailable
      ? '绿植状态暂时无法读取'
      : '正在读取绿植状态…';

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (saveLock.current || !profileReady || loading || getCommunitySessionGeneration() !== generation || useCommunityAuthStore.getState().phase !== 'active' || useCommunityAuthStore.getState().user?.publicId !== authUser?.publicId) return;
    const displayNameError = validateCommunityDisplayName(displayName);
    if (displayNameError) {
      setError(displayNameError);
      return;
    }
    if (Array.from(bio).length > 80) {
      setError('简介最多允许 80 个字');
      return;
    }
    saveLock.current = true;
    setSaving(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const next = await communityProfileApi.updateProfile({
        displayName: displayName.trim(),
        bio: bio.trim(),
        avatarKey,
        battleProfession,
      });
      if (getCommunitySessionGeneration() !== generation || useCommunityAuthStore.getState().phase !== 'active' || useCommunityAuthStore.getState().user?.publicId !== authUser?.publicId) return;
      setProfile(next);
      updateUser(next);
      setNotice('主页资料已保存');
    } catch (requestError) {
      if (getCommunitySessionGeneration() === generation && useCommunityAuthStore.getState().phase === 'active' && useCommunityAuthStore.getState().user?.publicId === authUser?.publicId) {
        setError(communityRequestErrorMessage(requestError, '保存失败'));
      }
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  return (
    <main className={profileStyles.page}>
      <header className={profileStyles.header}>
        <div><span className={profileStyles.eyebrow}>PERSONAL WORKSPACE</span><h1>我的工作台</h1><p>账户、成长与常用入口，一处查看。此工作台仅自己可见。</p></div>
        <nav className={profileStyles.accountLinks} aria-label="账号设置">
            <button type="button" onClick={() => { if (editor.current) { editor.current.open = true; editor.current.querySelector('input')?.focus(); } }}>编辑公开资料</button>
            <Link to="/settings/privacy">隐私设置</Link>
            <Link to="/account/security">账号安全</Link>
            {COMMUNITY_FEATURE_FLAGS.socialVerification ? <Link to="/settings/verification">身份核验</Link> : null}
        </nav>
      </header>
      {loading ? <p role="status">正在加载主页…</p> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
      {!loading && !profileReady ? <div className={profileStyles.loadError}><p>完整资料尚未读取，编辑暂不可用，避免覆盖原简介。账户概览仍可单独查看。</p><Button variant="secondary" onClick={() => setRevision(value => value + 1)}>重新读取资料</Button></div> : null}

      <section className={profileStyles.identity} aria-label="个人名片">
          <div className={`${styles.profileSummary} ${profileStyles.identityBody}`}>
            <span className={profileStyles.avatar} aria-hidden="true">{communityAvatarMark(profile?.avatarKey ?? undefined)}</span>
            <div>
              <span className={profileStyles.eyebrow}>你的社区名片</span>
              <h2>{profile?.displayName ?? '未设置昵称'}<CommunityTitleBadge title={profile?.equippedTitle} /></h2>
              <p className={profileStyles.bio}>{profile?.bio || '写一句简介，让同事更了解你。'}</p>
              <p className={profileStyles.publicId}>公开编号：{profile?.publicId ?? '—'}</p>
              <Tag>{profession ? `社区职业 · ${profession.name}` : '尚未选择社区职业'}</Tag>
            </div>
            {COMMUNITY_FEATURE_FLAGS.publicProfile && profile?.publicId ? <Link className={profileStyles.previewLink} to="/settings/privacy">管理公开展示 →</Link> : null}
          </div>
          <p className={profileStyles.identityNote}>昵称、简介和佩戴称号用于社区展示；账户余额、支持累计与下方工作台不会公开。</p>
      </section>

      {authUser?.publicId ? <WorkspaceOverview owner={authUser.publicId} /> : null}
      {COMMUNITY_FEATURE_FLAGS.communityProgressionEnabled ? <CommunityProgressionCard /> : null}

      <section className={profileStyles.activity} aria-label="工位事项">
        <Card title="工位塔防"><p>你的系统头像会成为场上唯一的工位守卫；战役进度由服务器保存，本地练习记录仅保存在这台设备。</p><Link to="/tower-defense">带角色守工位</Link></Card>
        <Card title="工位绿植"><p>{plantSummary}</p>{COMMUNITY_FEATURE_FLAGS.farm ? <Link to="/farm">查看绿植与收益</Link> : null}</Card>
        <Card title="荣誉"><p>{profile?.honors?.length ? <CommunityHonors honors={profile.honors} /> : '还没有获得荣誉'}</p>{COMMUNITY_FEATURE_FLAGS.communityProgressionEnabled ? <Link to="/achievements">管理成就与称号</Link> : null}</Card>
      </section>

      <details ref={editor} className={profileStyles.editor}>
        <summary><span><strong>编辑公开资料</strong><small>昵称、简介、系统头像与社区职业</small></span><span aria-hidden="true">＋</span></summary>
        <div className={profileStyles.editorBody}>
          <p className={profileStyles.editorNote}>修改后需要保存才会生效。称号在成长档案内单独管理。</p>
          <form className={styles.form} noValidate onSubmit={save}>
            <fieldset disabled={saving || loading || !profileReady} className={profileStyles.formFields}>
            <legend className={profileStyles.srOnly}>公开资料</legend>
            <Input label="昵称" value={displayName} required onChange={(event) => setDisplayName(event.target.value)} />
            <Textarea label="简介" value={bio} maxLength={80} onChange={(event) => setBio(event.target.value)} />
            <fieldset className={profileStyles.avatarChoices}>
              <legend>系统头像</legend>
              <div className={profileStyles.choiceGrid}>
                {COMMUNITY_AVATARS.map((avatar) => (
                  <button key={avatar.id} type="button" className={styles.choiceButton} data-selected={avatarKey === avatar.id} aria-pressed={avatarKey === avatar.id} onClick={() => setAvatarKey(avatar.id)}>
                    <strong>{avatar.mark}</strong><small>{avatar.label}</small>
                  </button>
                ))}
              </div>
            </fieldset>
            <label className={styles.fieldLabel}>
              社区职业
              <select className={styles.select} value={battleProfession} onChange={(event) => setBattleProfession(event.target.value)}>
                {COMMUNITY_PROFESSIONS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <small className={styles.muted}>昵称用于聊天、好友列表和公开主页，不会改变登录账号。</small>
            <Button type="submit" loading={saving}>保存资料</Button>
            </fieldset>
          </form>
        </div>
      </details>
    </main>
  );
}
