import { useEffect, useState, type FormEvent, type JSX } from 'react';

import {
  DEFAULT_COMMUNITY_PRIVACY,
  communityProfileApi,
  type CommunityPrivacyLevel,
  type CommunityPrivacySettings,
} from '../../api/community';
import { Button, Card, PageHeader } from '../../components/ui';
import styles from './CommunityPages.module.css';

const FIELDS: Array<{
  key: keyof CommunityPrivacySettings;
  label: string;
  description: string;
}> = [
  { key: 'equipment', label: '装备', description: '六件乐斗装备和稀有度' },
  { key: 'battleRecord', label: '战绩摘要', description: '胜场、负场和等级' },
  { key: 'plant', label: '工位绿植', description: '植物外观与连续照料' },
  { key: 'honors', label: '荣誉', description: '徽章和赛季荣誉' },
  { key: 'friendCount', label: '好友数量', description: '仅显示数量，不公开好友名单' },
  { key: 'recentActivity', label: '最近活动', description: '经过隐私过滤的社区动态' },
];

const OPTIONS: Array<{ value: CommunityPrivacyLevel; label: string }> = [
  { value: 'everyone', label: '所有人' },
  { value: 'friends', label: '好友' },
  { value: 'self', label: '仅自己' },
];

export function CommunityPrivacySettingsPage(): JSX.Element {
  const [settings, setSettings] = useState<CommunityPrivacySettings>(DEFAULT_COMMUNITY_PRIVACY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  useEffect(() => {
    let active = true;
    communityProfileApi
      .getMe()
      .then((profile) => {
        if (active) setSettings({ ...DEFAULT_COMMUNITY_PRIVACY, ...profile.privacy });
      })
      .catch((requestError) => {
        if (active) setError(requestError instanceof Error ? requestError.message : '隐私设置加载失败');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    setNotice(undefined);
    try {
      await communityProfileApi.updatePrivacy(settings);
      setNotice('隐私设置已保存');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className={styles.page}>
      <PageHeader title="主页隐私设置" subtitle="邮箱、手机号、身份信息和登录设备始终仅自己可见，不能在这里改为公开。" />
      {loading ? <p role="status">正在加载隐私设置…</p> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
      <Card>
        <form className={styles.form} onSubmit={save}>
          {FIELDS.map((field) => (
            <label className={styles.privacyRow} key={field.key}>
              <div>
                <strong>{field.label}</strong>
                <small>{field.description}</small>
              </div>
              <select
                className={styles.select}
                aria-label={`${field.label}可见范围`}
                value={settings[field.key]}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    [field.key]: event.target.value as CommunityPrivacyLevel,
                  }))
                }
              >
                {OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          ))}
          <Button type="submit" loading={saving}>保存隐私设置</Button>
        </form>
      </Card>
    </main>
  );
}
