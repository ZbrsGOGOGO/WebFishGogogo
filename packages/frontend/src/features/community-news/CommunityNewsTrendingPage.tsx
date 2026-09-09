import type {
  TrendingNewsBoard,
  TrendingNewsBoardStatus,
} from '@stealth-reader/shared';
import type { JSX } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { communityNewsApi, type CommunityTrendingNewsSnapshot } from '../../api/community';
import { PageHeader } from '../../components/ui';
import { CommunityNewsNavigation } from './CommunityNewsNavigation';
import styles from './CommunityNews.module.css';

const PLATFORM_GROUPS = [
  { id: 'social', label: '综合社交' },
  { id: 'entertainment', label: '视频文娱' },
  { id: 'technology', label: '科技知识' },
] as const;

type PlatformGroupId = (typeof PLATFORM_GROUPS)[number]['id'];

// Read-only fallback links shown only if the snapshot API itself is unavailable.
// They are never presented as synchronized rankings.
export const COMMUNITY_NEWS_PLATFORM_LINKS = [
  { id: 'weibo', label: '微博热搜', mark: '微', group: 'social', url: 'https://s.weibo.com/top/summary?cate=realtimehot' },
  { id: 'zhihu', label: '知乎热榜', mark: '知', group: 'social', url: 'https://www.zhihu.com/hot' },
  { id: 'baidu', label: '百度热搜', mark: '百', group: 'social', url: 'https://top.baidu.com/board?tab=realtime' },
  { id: 'bilibili', label: '哔哩哔哩排行榜', mark: '哔', group: 'entertainment', url: 'https://www.bilibili.com/v/popular/rank/all' },
  { id: 'douyin', label: '抖音热点', mark: '抖', group: 'entertainment', url: 'https://www.douyin.com/hot' },
  { id: 'douban', label: '豆瓣电影排行榜', mark: '豆', group: 'entertainment', url: 'https://movie.douban.com/chart' },
  { id: 'github_rising', label: 'GitHub 本周新星项目', mark: 'G', group: 'technology', url: 'https://github.com/search?type=repositories' },
  { id: 'hacker_news', label: 'Hacker News 热门', mark: 'Y', group: 'technology', url: 'https://news.ycombinator.com/' },
  { id: 'stackoverflow', label: 'Stack Overflow 热门问题', mark: 'S', group: 'technology', url: 'https://stackoverflow.com/questions?tab=Hot' },
] as const;

const BOARD_MARKS: Record<string, string> = Object.fromEntries(
  COMMUNITY_NEWS_PLATFORM_LINKS.map((platform) => [platform.id, platform.mark]),
);

const STATUS_LABELS: Record<TrendingNewsBoardStatus, string> = {
  fresh: '今日已更新',
  stale: '上次快照',
  unavailable: '暂未取得',
  external_only: '官方入口',
};

export function CommunityNewsTrendingPage(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const [snapshot, setSnapshot] = useState<CommunityTrendingNewsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadRevision, setReloadRevision] = useState(0);
  const requestedGroup = searchParams.get('group');
  const selectedGroup: PlatformGroupId | 'all' = PLATFORM_GROUPS.some(
    (group) => group.id === requestedGroup,
  ) ? requestedGroup as PlatformGroupId : 'all';

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    communityNewsApi.getTrendingNews()
      .then((result) => {
        if (active) setSnapshot(result);
      })
      .catch(() => {
        if (active) setError('本次没有取得热榜快照，已保留官方入口。');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [reloadRevision]);

  const visibleBoards = useMemo(() =>
    (snapshot?.boards ?? []).filter(
      (board) => selectedGroup === 'all' || board.group === selectedGroup,
    ), [selectedGroup, snapshot]);
  const synchronizedBoards = visibleBoards.filter((board) => board.status !== 'external_only');
  const externalBoards = visibleBoards.filter((board) => board.status === 'external_only');

  function selectGroup(group: PlatformGroupId | 'all'): void {
    const next = new URLSearchParams(searchParams);
    if (group === 'all') next.delete('group');
    else next.set('group', group);
    setSearchParams(next);
  }

  return (
    <main className={styles.page}>
      <PageHeader title="每日热榜" subtitle="在本站看标题与排名，不用先跳到各平台翻榜单。" />
      <CommunityNewsNavigation />
      <section className={styles.platformNotice} aria-labelledby="platform-notice-title">
        <div>
          <span className={styles.eyebrow}>DAILY SNAPSHOT / 每日快照</span>
          <h2 id="platform-notice-title">真实公开榜单，每天更新一次</h2>
          <p>本站只保存公开榜单与官方 API 的标题、排名和来源信息，不复制新闻正文。单个数据源同步失败时，会明确显示上次快照；需登录授权的平台仍标为官方入口。</p>
        </div>
        <div className={styles.snapshotSummary} aria-label="热榜更新信息">
          <span>{snapshot?.schedule ?? '每天 08:10（北京时间）'}</span>
          <small>{snapshot?.updatedAt ? `最近成功更新 ${formatDateTime(snapshot.updatedAt)}` : '等待可用快照'}</small>
        </div>
      </section>

      {error ? (
        <div className={styles.trendingError} role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setReloadRevision((value) => value + 1)}>重试</button>
        </div>
      ) : null}

      <div className={styles.categoryFilters} role="group" aria-label="热榜分类">
        <button type="button" aria-pressed={selectedGroup === 'all'} onClick={() => selectGroup('all')}>全部热榜</button>
        {PLATFORM_GROUPS.map((group) => (
          <button type="button" key={group.id} aria-pressed={selectedGroup === group.id}
            onClick={() => selectGroup(group.id)}>{group.label}</button>
        ))}
      </div>

      {loading && !snapshot ? <p className={styles.listState} role="status">正在读取每日热榜……</p> : null}

      {synchronizedBoards.length > 0 ? (
        <section className={styles.trendingSection} aria-labelledby="synced-board-title">
          <div className={styles.groupHeading}>
            <h2 id="synced-board-title">站内榜单</h2>
            <p>各榜会注明公开数据来源；热度只在同一榜内理解，不能跨平台比较。</p>
          </div>
          <div className={styles.trendingBoardGrid}>
            {synchronizedBoards.map((board) => <SynchronizedBoard key={board.id} board={board} />)}
          </div>
        </section>
      ) : null}

      {externalBoards.length > 0 ? (
        <section className={styles.trendingSection} aria-labelledby="external-board-title">
          <div className={styles.groupHeading}>
            <h2 id="external-board-title">待安全接入</h2>
            <p>这些平台尚未接入经过验证的公开数据源，暂不冒充站内热榜。</p>
          </div>
          <div className={styles.externalBoardGrid}>
            {externalBoards.map((board) => <ExternalBoard key={board.id} board={board} />)}
          </div>
        </section>
      ) : null}

      {!loading && !snapshot ? (
        <section className={styles.trendingSection} aria-labelledby="fallback-board-title">
          <div className={styles.groupHeading}>
            <h2 id="fallback-board-title">官方入口</h2>
            <p>快照接口不可用时，仅展示可核对的官方页面，不显示任何假排名。</p>
          </div>
          <div className={styles.externalBoardGrid}>
            {COMMUNITY_NEWS_PLATFORM_LINKS
              .filter((platform) => selectedGroup === 'all' || platform.group === selectedGroup)
              .map((platform) => (
                <a className={styles.externalBoardCard} key={platform.id} data-platform={platform.id}
                  href={platform.url} target="_blank" rel="noopener noreferrer nofollow">
                  <span className={styles.platformMark} aria-hidden="true">{platform.mark}</span>
                  <span><strong>{platform.label}</strong><small>前往官方页面</small></span>
                  <span aria-hidden="true">↗</span>
                </a>
              ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function SynchronizedBoard({ board }: { board: TrendingNewsBoard }): JSX.Element {
  return (
    <article className={styles.trendingBoard} data-platform={board.id} data-status={board.status}>
      <header className={styles.trendingBoardHeader}>
        <span className={styles.platformMark} aria-hidden="true">{BOARD_MARKS[board.id] ?? '榜'}</span>
        <div>
          <h3>{board.label}</h3>
          <span className={styles.boardStatus}>{STATUS_LABELS[board.status]}</span>
        </div>
        {safeHttpsUrl(board.sourceUrl) ? (
          <a href={board.sourceUrl} target="_blank" rel="noopener noreferrer nofollow"
            aria-label={`${board.label}官方页面（新窗口）`}>官方页 ↗</a>
        ) : null}
      </header>
      <p className={styles.boardNote}>{board.note}</p>
      {board.items.length > 0 ? (
        <ol className={styles.trendingItems} aria-label={`${board.label}每日排名`}>
          {board.items.map((item) => (
            <li key={item.id}>
              <span className={styles.trendingRank} aria-label={`第 ${item.rank} 名`}>{item.rank}</span>
              <div>
                <strong>{item.title}</strong>
                <small>
                  {item.heatText ? <span>{item.heatText}</span> : null}
                  {item.publishedAt && validDate(item.publishedAt) ? <span>{formatDate(item.publishedAt)}</span> : null}
                  {item.url && safeHttpsUrl(item.url) ? (
                    <a href={item.url} target="_blank" rel="noopener noreferrer nofollow"
                      aria-label={`${item.title}，查看来源（新窗口）`}>查看来源 ↗</a>
                  ) : null}
                </small>
              </div>
            </li>
          ))}
        </ol>
      ) : <p className={styles.boardEmpty}>该榜暂无可验证条目。</p>}
    </article>
  );
}

function ExternalBoard({ board }: { board: TrendingNewsBoard }): JSX.Element {
  const sourceUrl = safeHttpsUrl(board.sourceUrl);
  return (
    <article className={styles.externalBoardInfo} data-platform={board.id}>
      <span className={styles.platformMark} aria-hidden="true">{BOARD_MARKS[board.id] ?? '榜'}</span>
      <div><h3>{board.label}</h3><p>{board.note}</p></div>
      {sourceUrl ? (
        <a href={sourceUrl} target="_blank" rel="noopener noreferrer nofollow"
          aria-label={`${board.label}，前往官方榜单（新窗口）`}>官方入口 ↗</a>
      ) : null}
    </article>
  );
}

function safeHttpsUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function validDate(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime());
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric', day: 'numeric', timeZone: 'Asia/Shanghai',
  }).format(new Date(value));
}

function formatDateTime(value: string): string {
  if (!validDate(value)) return '时间待核对';
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
    hour12: false, timeZone: 'Asia/Shanghai',
  }).format(new Date(value));
}
