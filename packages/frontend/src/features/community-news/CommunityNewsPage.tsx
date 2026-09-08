import { useCallback, useEffect, useRef, useState, type JSX } from 'react';
import { useSearchParams } from 'react-router-dom';

import { communityNewsApi, type CommunityDailyHotNews, type CommunityNewsCategory } from '../../api/community';
import { Button, EmptyState, PageHeader } from '../../components/ui';
import { communityRequestErrorMessage } from '../community/request-error';
import { CommunityNewsNavigation } from './CommunityNewsNavigation';
import { communityNewsHttpsUrl } from './news-utils';
import styles from './CommunityNews.module.css';

const CATEGORY_LABELS: Record<CommunityNewsCategory, string> = {
  general: '综合', domestic: '国内', world: '国际', society: '社会', finance: '财经', culture: '文娱', sports: '体育',
};

function headlineCategory(category: string | undefined): CommunityNewsCategory {
  return category && Object.prototype.hasOwnProperty.call(CATEGORY_LABELS, category)
    ? category as CommunityNewsCategory : 'general';
}

function displayDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : null;
}

export function CommunityNewsPage(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const [headlines, setHeadlines] = useState<CommunityDailyHotNews | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const requestSequence = useRef(0);
  const load = useCallback(async (): Promise<void> => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError(undefined);
    try {
      const result = await communityNewsApi.getDailyHeadlines();
      if (sequence === requestSequence.current) setHeadlines(result);
    } catch (requestError) {
      if (sequence === requestSequence.current) {
        setError(communityRequestErrorMessage(requestError, '分类新闻加载失败'));
      }
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => { requestSequence.current += 1; };
  }, [load]);

  const items = headlines?.items ?? [];
  const categories = headlines?.categories?.length ? headlines.categories : [
    { id: 'general' as const, label: '综合', count: items.length },
  ];
  const requestedCategory = searchParams.get('category');
  const selectedCategory = categories.some((category) => category.id === requestedCategory) ? requestedCategory : 'all';
  const selectedLabel = categories.find((category) => category.id === selectedCategory)?.label ?? '全部';
  const visibleItems = selectedCategory === 'all' ? items : items.filter((item) => headlineCategory(item.category) === selectedCategory);
  const updatedAt = displayDate(headlines?.updatedAt ?? null);

  function selectCategory(category: string): void {
    const next = new URLSearchParams(searchParams);
    if (category === 'all') next.delete('category');
    else next.set('category', category);
    setSearchParams(next);
  }

  return (
    <main className={styles.page}>
      <PageHeader title="热点新闻" subtitle="按兴趣看新闻，去来源网站读原文。平台热搜与人工导读也各有专门入口。" />
      <CommunityNewsNavigation />
      <section className={styles.newsIntro} aria-labelledby="daily-news-title">
        <div>
          <span className={styles.eyebrow}>NEWS / 分类阅读</span>
          <h2 id="daily-news-title">今天，世界在发生什么</h2>
          <p>来自公开 RSS 的新闻标题与来源链接；分类不是热度排名，站内不转载新闻正文。</p>
        </div>
        <span className={styles.schedule}>{headlines?.schedule ?? '每天 08:00（北京时间）'}</span>
      </section>
      <section className={styles.headlinesPanel} aria-label="分类新闻">
        <div className={styles.categoryFilters} role="group" aria-label="新闻分类">
          <button type="button" aria-pressed={selectedCategory === 'all'} onClick={() => selectCategory('all')}>
            全部 <span>{items.length}</span>
          </button>
          {categories.map((category) => (
            <button type="button" key={category.id} aria-pressed={selectedCategory === category.id}
              disabled={category.count === 0 && selectedCategory !== category.id}
              onClick={() => selectCategory(category.id)}>
              {category.label} <span>{category.count}</span>
            </button>
          ))}
        </div>
        <div className={styles.listHeading}>
          <h2>{selectedLabel}新闻 <span>{visibleItems.length} 条</span></h2>
          <Button size="sm" variant="secondary" disabled={loading} onClick={() => void load()}>重新读取</Button>
        </div>
        {loading ? <p className={styles.listState} role="status">正在读取分类新闻…</p> : null}
        {error ? (
          <div className={styles.error} role="alert">
            <p>{error}</p><p>本次没有取得新闻数据，请重试；这不代表今天没有新闻。</p>
            <Button size="sm" variant="secondary" onClick={() => void load()}>重试</Button>
          </div>
        ) : null}
        {!loading && !error && visibleItems.length === 0 ? (
          <EmptyState icon="报" title={items.length ? '这个分类暂无新闻' : '暂无已同步的新闻'}
            message={items.length ? '可以切换其他分类，或稍后重新读取。' : '当前没有已同步的标题，稍后可以重新读取；也可以前往平台榜单查看。'} />
        ) : null}
        {!loading && !error && visibleItems.length > 0 ? (
          <ul className={styles.dailyNewsList} aria-label={`${selectedLabel}新闻列表`}>
            {visibleItems.map((item) => {
              const originalUrl = communityNewsHttpsUrl(item.originalUrl);
              const publishedAt = displayDate(item.originalPublishedAt);
              return (
                <li key={item.id}>
                  <div className={styles.headlineMeta}>
                    <span className={styles.categoryBadge}>{CATEGORY_LABELS[headlineCategory(item.category)]}</span>
                    <span>{item.source}</span>
                    {publishedAt ? <time dateTime={item.originalPublishedAt ?? undefined}>{publishedAt}</time> : null}
                  </div>
                  {originalUrl ? (
                    <a href={originalUrl} target="_blank" rel="noopener noreferrer nofollow">{item.headline}<span aria-hidden="true"> ↗</span></a>
                  ) : <span className={styles.unlinkedHeadline}>{item.headline}</span>}
                  {!originalUrl ? <p className={styles.linkUnavailable}>原文链接暂不可用</p> : null}
                </li>
              );
            })}
          </ul>
        ) : null}
        {updatedAt ? <p className={styles.snapshotNote}>新闻快照更新：{updatedAt}（北京时间）{error ? '；本次重新读取失败，上次快照未更新。' : ''}</p> : null}
      </section>
      <p className={styles.disclosure}>点击新闻标题会在新窗口打开来源网站。事实细节与完整上下文请以原文为准；各平台实时热榜请在“平台榜单”查看官方入口。</p>
    </main>
  );
}
