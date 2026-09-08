import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type JSX } from 'react';
import { Link } from 'react-router-dom';

import { useCommunityAuthStore } from '../../app/store/community-auth-store';
import {
  COMMUNITY_NEWS_PROFESSIONS,
  CommunityApiError,
  communityNewsApi,
  createCommunityIdempotencyKey,
  type CommunityNewsFeed,
  type CommunityNewsPreferences,
  type CommunityNewsProfession,
  type CommunityNewsPublishedItem,
} from '../../api/community';
import { Button, Card, EmptyState, Input, PageHeader } from '../../components/ui';
import { communityRequestErrorMessage } from '../community/request-error';
import { CommunityNewsCard } from './CommunityNewsCard';
import { CommunityNewsNavigation } from './CommunityNewsNavigation';
import {
  COMMUNITY_NEWS_PROFESSION_LABELS,
  communityNewsTopicsError,
  parseCommunityNewsTopics,
} from './news-utils';
import styles from './CommunityNews.module.css';

export function CommunityNewsEditorialPage(): JSX.Element {
  const phase = useCommunityAuthStore((state) => state.phase);
  const signedIn = phase === 'active';
  const [items, setItems] = useState<CommunityNewsPublishedItem[]>([]);
  const [feed, setFeed] = useState<CommunityNewsFeed>('latest');
  const [profession, setProfession] = useState<CommunityNewsProfession | ''>('');
  const [topicInput, setTopicInput] = useState('');
  const [topic, setTopic] = useState('');
  const [personalized, setPersonalized] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [preferences, setPreferences] = useState<CommunityNewsPreferences | null>(null);
  const [preferenceTopics, setPreferenceTopics] = useState('');
  const [preferenceEnabled, setPreferenceEnabled] = useState(false);
  const [preferenceBusy, setPreferenceBusy] = useState(false);
  const [preferenceError, setPreferenceError] = useState<string>();
  const requestSequence = useRef(0);

  const load = useCallback(async (cursor?: string, append = false): Promise<void> => {
    const sequence = ++requestSequence.current;
    append ? setLoadingMore(true) : setLoading(true);
    setError(undefined);
    try {
      const page = await communityNewsApi.list({
        feed,
        profession: profession || undefined,
        topic: topic || undefined,
        cursor,
      });
      if (sequence !== requestSequence.current) return;
      setItems((current) => append ? [...current, ...page.items] : page.items);
      setPersonalized(page.personalized);
      setNextCursor(page.nextCursor);
    } catch (requestError) {
      if (sequence === requestSequence.current) {
        setError(communityRequestErrorMessage(requestError, '热点资讯加载失败'));
      }
    } finally {
      if (sequence === requestSequence.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [feed, profession, topic]);

  useEffect(() => {
    void load();
    return () => { requestSequence.current += 1; };
  }, [load]);

  useEffect(() => {
    if (!signedIn) {
      setPreferences(null);
      return;
    }
    let active = true;
    communityNewsApi.getPreferences()
      .then((value) => {
        if (!active) return;
        setPreferences(value);
        setPreferenceEnabled(value.personalizationEnabled);
        setPreferenceTopics(value.topicPreferences.join('，'));
      })
      .catch((requestError) => {
        if (active) setPreferenceError(communityRequestErrorMessage(requestError, '偏好设置加载失败'));
      });
    return () => {
      active = false;
    };
  }, [signedIn]);

  const parsedPreferenceTopics = useMemo(
    () => parseCommunityNewsTopics(preferenceTopics),
    [preferenceTopics],
  );

  function applyTopicFilter(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const normalized = parseCommunityNewsTopics(topicInput)[0] ?? '';
    if (normalized && communityNewsTopicsError([normalized], 1)) {
      setError('主题只能包含中英文、数字、下划线或短横线，最多 30 个字符');
      return;
    }
    setTopic(normalized);
  }

  async function savePreferences(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const validationError = communityNewsTopicsError(parsedPreferenceTopics, 12);
    if (validationError) {
      setPreferenceError(validationError);
      return;
    }
    setPreferenceBusy(true);
    setPreferenceError(undefined);
    try {
      const next = await communityNewsApi.updatePreferences({
        personalizationEnabled: preferenceEnabled,
        topicPreferences: parsedPreferenceTopics,
        expectedVersion: preferences?.version ?? null,
      }, createCommunityIdempotencyKey('news-preferences'));
      setPreferences(next);
      setPreferenceEnabled(next.personalizationEnabled);
      setPreferenceTopics(next.topicPreferences.join('，'));
      setNotice('资讯偏好已保存。');
    } catch (requestError) {
      if (requestError instanceof CommunityApiError && requestError.status === 409) {
        setPreferenceError('偏好版本已经变化，本次没有覆盖服务器设置。请刷新后重试。');
      } else {
        setPreferenceError(communityRequestErrorMessage(requestError, '偏好设置保存失败'));
      }
    } finally {
      setPreferenceBusy(false);
    }
  }

  function removeFeedbackItem(articleId: string): void {
    setItems((current) => current.filter((item) => item.id !== articleId));
    setNotice('反馈已记录，这条资讯已从当前页面移除。');
  }

  return (
    <main className={styles.page}>
      <PageHeader
        title="编辑导读"
        subtitle="人工整理的短摘要与来源指引；职业、主题和个人偏好筛选都在这里。"
        actions={signedIn ? undefined : <Link to="/login">登录后设置偏好</Link>}
      />
      <CommunityNewsNavigation />
      <p className={styles.disclosure}>这里只保存必要导读与原文链接，不复制新闻正文；事实细节与完整上下文请以来源网站为准。</p>
      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
      {error ? <div className={styles.error} role="alert"><p>{error}</p><Button size="sm" variant="secondary" onClick={() => void load()}>重试</Button></div> : null}

      <Card>
        <form className={styles.filters} onSubmit={applyTopicFilter}>
          <label>
            信息流
            <select
              value={feed}
              onChange={(event) => setFeed(event.target.value as CommunityNewsFeed)}
            >
              <option value="latest">最新发布</option>
              <option value="for_you" disabled={!signedIn}>为你推荐（需登录并开启偏好）</option>
            </select>
          </label>
          <label>
            职业方向
            <select value={profession} onChange={(event) => setProfession(event.target.value as CommunityNewsProfession | '')}>
              <option value="">全部职业</option>
              {COMMUNITY_NEWS_PROFESSIONS.map((value) => (
                <option key={value} value={value}>{COMMUNITY_NEWS_PROFESSION_LABELS[value]}</option>
              ))}
            </select>
          </label>
          <Input
            label="主题（精确标签）"
            value={topicInput}
            maxLength={30}
            placeholder="例如 TypeScript"
            onChange={(event) => setTopicInput(event.target.value)}
          />
          <Button type="submit" variant="secondary">应用主题</Button>
        </form>
        {feed === 'for_you' ? (
          <p className={styles.filterHint} role="status">
            {personalized ? '当前结果已按你的偏好排序。' : '当前未启用个性化，将按最新内容展示。'}
          </p>
        ) : null}
      </Card>

      {signedIn ? (
        <Card title="我的资讯偏好">
          <form className={styles.preferenceForm} onSubmit={(event) => void savePreferences(event)}>
            <label className={styles.checkboxLabel}>
              <input type="checkbox" checked={preferenceEnabled} onChange={(event) => setPreferenceEnabled(event.target.checked)} />
              启用“为你推荐”排序
            </label>
            <Input
              label="关注主题（逗号或空格分隔，最多 12 个）"
              value={preferenceTopics}
              maxLength={480}
              onChange={(event) => setPreferenceTopics(event.target.value)}
            />
            <p className={styles.filterHint}>
              当前职业：{preferences?.selectedProfession ? COMMUNITY_NEWS_PROFESSION_LABELS[preferences.selectedProfession] : '未设置'}；职业来自你的个人资料，不在这里改动。
            </p>
            {preferenceError ? <p className={styles.error} role="alert">{preferenceError}</p> : null}
            <Button type="submit" loading={preferenceBusy}>保存偏好</Button>
          </form>
        </Card>
      ) : null}

      {loading ? <p role="status">正在加载资讯…</p> : error && items.length === 0 ? null : items.length === 0 ? (
        <EmptyState
          icon="报"
          title="当前没有可展示的资讯"
          message="可以调整筛选条件后再试。"
        />
      ) : (
        <section className={styles.newsList} aria-label="热点资讯列表">
          {items.map((item) => (
            <CommunityNewsCard key={item.id} item={item} signedIn={signedIn} onFeedback={removeFeedbackItem} />
          ))}
        </section>
      )}
      {nextCursor ? (
        <Button fullWidth variant="secondary" loading={loadingMore} onClick={() => void load(nextCursor, true)}>
          加载更多
        </Button>
      ) : null}
    </main>
  );
}
