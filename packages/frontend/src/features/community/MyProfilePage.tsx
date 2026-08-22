import { useEffect, useMemo, useState, type FormEvent, type JSX } from 'react';
import { Link } from 'react-router-dom';

import { COMMUNITY_FEATURE_FLAGS } from '../../app/community-nav';
import { useCommunityAuthStore } from '../../app/store/community-auth-store';
import {
  communityFarmApi,
  communityProfileApi,
  type CommunityFarmOverview,
  type CommunityProfile,
} from '../../api/community';
import { Button, Card, Input, PageHeader, Tag, Textarea } from '../../components/ui';
import { PROFESSION_DEFINITIONS } from '../office-battle/office-battle-domain';
import { validateCommunityDisplayName } from '../community-auth/validation';
import styles from './CommunityPages.module.css';
import { COMMUNITY_AVATARS, communityAvatarMark } from './profile-options';
import { communityRequestErrorMessage } from './request-error';

export function CommunityMyProfilePage(): JSX.Element {
  const authUser = useCommunityAuthStore((state) => state.user);
  const updateUser = useCommunityAuthStore((state) => state.updateUser);
  const [profile, setProfile] = useState<CommunityProfile | null>(authUser);
  const [farmOverview, setFarmOverview] = useState<CommunityFarmOverview>();
  const [farmUnavailable, setFarmUnavailable] = useState(false);
  const [displayName, setDisplayName] = useState(authUser?.displayName ?? '');
  const [bio, setBio] = useState('');
  const [avatarKey, setAvatarKey] = useState(authUser?.avatarKey ?? COMMUNITY_AVATARS[0].id);
  const [battleProfession, setBattleProfession] = useState(
    authUser?.battleProfession ?? PROFESSION_DEFINITIONS[0].id,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  useEffect(() => {
    let active = true;
    communityFarmApi
      .getOverview()
      .then((next) => {
        if (active) setFarmOverview(next);
      })
      .catch(() => {
        if (active) setFarmUnavailable(true);
      });
    communityProfileApi
      .getMe()
      .then((next) => {
        if (!active) return;
        setProfile(next);
        setDisplayName(next.displayName ?? '');
        setBio(next.bio ?? '');
        setAvatarKey(next.avatarKey ?? COMMUNITY_AVATARS[0].id);
        setBattleProfession(next.battleProfession ?? PROFESSION_DEFINITIONS[0].id);
      })
      .catch((requestError) => {
        if (active) setError(communityRequestErrorMessage(requestError, '主页加载失败'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const profession = useMemo(
    () => PROFESSION_DEFINITIONS.find((item) => item.id === profile?.battleProfession),
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
    const displayNameError = validateCommunityDisplayName(displayName);
    if (displayNameError) {
      setError(displayNameError);
      return;
    }
    if (Array.from(bio).length > 80) {
      setError('简介最多允许 80 个字');
      return;
    }
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
      setProfile(next);
      updateUser(next);
      setNotice('主页资料已保存');
    } catch (requestError) {
      setError(communityRequestErrorMessage(requestError, '保存失败'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className={styles.page}>
      <PageHeader
        title="我的主页"
        subtitle="邮箱、身份核验信息和登录设备始终不会出现在公开主页。"
        actions={(
          <div className={styles.inlineActions}>
            <Link to="/settings/privacy">隐私设置</Link>
            <Link to="/account/security">账号安全</Link>
            {COMMUNITY_FEATURE_FLAGS.socialVerification ? <Link to="/settings/verification">身份核验</Link> : null}
          </div>
        )}
      />
      {loading ? <p role="status">正在加载主页…</p> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}

      <div className={styles.twoColumn}>
        <Card>
          <div className={styles.profileSummary}>
            <span className={styles.avatar} aria-hidden="true">{communityAvatarMark(avatarKey)}</span>
            <div>
              <h2>{profile?.displayName ?? '未设置昵称'}</h2>
              <p>公开编号：{profile?.publicId ?? '—'}</p>
              <Tag>{profession ? `乐斗职业 · ${profession.name}` : '尚未选择乐斗职业'}</Tag>
              {COMMUNITY_FEATURE_FLAGS.publicProfile && profile?.publicId ? <p><Link to={`/users/${encodeURIComponent(profile.publicId)}`}>预览公开主页</Link></p> : null}
            </div>
          </div>
        </Card>

        <Card title="编辑资料">
          <form className={styles.form} noValidate onSubmit={save}>
            <Input label="昵称" value={displayName} required onChange={(event) => setDisplayName(event.target.value)} />
            <Textarea label="简介" value={bio} maxLength={80} onChange={(event) => setBio(event.target.value)} />
            <fieldset className="community-consents">
              <legend>系统头像</legend>
              <div className={styles.choiceGrid}>
                {COMMUNITY_AVATARS.map((avatar) => (
                  <button key={avatar.id} type="button" className={styles.choiceButton} data-selected={avatarKey === avatar.id} aria-pressed={avatarKey === avatar.id} onClick={() => setAvatarKey(avatar.id)}>
                    <strong>{avatar.mark}</strong><small>{avatar.label}</small>
                  </button>
                ))}
              </div>
            </fieldset>
            <label className={styles.fieldLabel}>
              乐斗职业
              <select className={styles.select} value={battleProfession} onChange={(event) => setBattleProfession(event.target.value)}>
                {PROFESSION_DEFINITIONS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <small className={styles.muted}>昵称默认每 7 天可修改一次；服务端规则为最终判断。</small>
            <Button type="submit" loading={saving}>保存资料</Button>
          </form>
        </Card>
      </div>

      <div className={styles.grid}>
        <Card title="办公室乐斗">
          <p>
            等级 {profile?.battleLevel ?? 1} · {COMMUNITY_FEATURE_FLAGS.battleServer
              ? '六件装备、仓库与战绩由服务端正式档案管理。'
              : '六件装备将在服务端乐斗接入后展示。'}
          </p>
          <Link to="/ledou">
            {COMMUNITY_FEATURE_FLAGS.battleServer ? '进入正式乐斗' : '进入本机试玩'}
          </Link>
        </Card>
        <Card title="工位绿植"><p>{plantSummary}</p></Card>
        <Card title="荣誉"><p>{profile?.honors?.length ? profile.honors.join('、') : '还没有获得荣誉'}</p></Card>
      </div>
    </main>
  );
}
