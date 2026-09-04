import { useRef, useState, type FormEvent, type JSX } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { useCommunityAuthStore } from '../../app/store/community-auth-store';
import { communityProfileApi } from '../../api/community';
import { Button, Card, Input, PageHeader } from '../../components/ui';
import { COMMUNITY_PROFESSIONS } from './community-professions';
import { validateCommunityDisplayName } from '../community-auth/validation';
import styles from './CommunityPages.module.css';
import { COMMUNITY_AVATARS } from './profile-options';

export function CommunityOnboardingPage(): JSX.Element {
  const navigate = useNavigate();
  const user = useCommunityAuthStore((state) => state.user);
  const updateUser = useCommunityAuthStore((state) => state.updateUser);
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [avatarKey, setAvatarKey] = useState(user?.avatarKey ?? COMMUNITY_AVATARS[0].id);
  const [profession, setProfession] = useState(
    user?.battleProfession ?? COMMUNITY_PROFESSIONS[0].id,
  );
  const [fieldError, setFieldError] = useState<string>();
  const [requestError, setRequestError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const completingHere = useRef(false);

  if (user?.onboardingCompleted && !completingHere.current) {
    return <Navigate to="/me" replace />;
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const nextError = validateCommunityDisplayName(displayName);
    setFieldError(nextError);
    if (nextError) return;
    setSaving(true);
    setRequestError(undefined);
    try {
      const profile = await communityProfileApi.updateProfile({
        displayName: displayName.trim(),
        avatarKey,
        battleProfession: profession,
        onboardingCompleted: true,
      });
      completingHere.current = true;
      updateUser({ ...profile, onboardingCompleted: true });
      navigate('/', { replace: true });
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : '保存失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className={styles.page}>
      <PageHeader title="设置你的办公室身份" subtitle="系统头像会成为塔防中的工位守卫；社区职业只是展示标签，不代表现实职业评价。" />
      <Card>
        <form className={styles.form} noValidate onSubmit={submit}>
          <Input label="社区昵称" value={displayName} required error={fieldError} onChange={(event) => setDisplayName(event.target.value)} />

          <fieldset className="community-consents">
            <legend>选择一个系统头像</legend>
            <div className={styles.choiceGrid}>
              {COMMUNITY_AVATARS.map((avatar) => (
                <button
                  key={avatar.id}
                  type="button"
                  className={styles.choiceButton}
                  data-selected={avatarKey === avatar.id}
                  aria-pressed={avatarKey === avatar.id}
                  onClick={() => setAvatarKey(avatar.id)}
                >
                  <strong>{avatar.mark}</strong>
                  <small>{avatar.label}</small>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="community-consents">
            <legend>选择社区职业</legend>
            <div className={styles.choiceGrid}>
              {COMMUNITY_PROFESSIONS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={styles.choiceButton}
                  data-selected={profession === item.id}
                  aria-pressed={profession === item.id}
                  onClick={() => setProfession(item.id)}
                >
                  <strong>{item.name}</strong>
                  <small>{item.slogan}</small>
                </button>
              ))}
            </div>
          </fieldset>

          {requestError ? <p className={styles.error} role="alert">{requestError}</p> : null}
          <Button type="submit" loading={saving}>保存并进入社区</Button>
        </form>
      </Card>
    </main>
  );
}
