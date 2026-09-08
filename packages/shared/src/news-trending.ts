export const TRENDING_NEWS_BOARD_IDS = [
  'hacker_news',
  'stackoverflow',
  'github_rising',
  'weibo',
  'zhihu',
  'baidu',
  'bilibili',
  'douyin',
  'douban',
] as const;

export type TrendingNewsBoardId = (typeof TRENDING_NEWS_BOARD_IDS)[number];
export type TrendingNewsBoardGroup = 'social' | 'entertainment' | 'technology';
export type TrendingNewsBoardStatus =
  | 'fresh'
  | 'stale'
  | 'unavailable'
  | 'external_only';

/**
 * A title-only daily snapshot. It deliberately contains no publisher body,
 * excerpt, image, credential, or embedded third-party page.
 */
export interface TrendingNewsItem {
  id: string;
  rank: number;
  title: string;
  url: string | null;
  heatText: string | null;
  publishedAt: string | null;
}

export interface TrendingNewsBoard {
  id: TrendingNewsBoardId;
  label: string;
  group: TrendingNewsBoardGroup;
  status: TrendingNewsBoardStatus;
  sourceUrl: string;
  snapshotDate: string | null;
  updatedAt: string | null;
  note: string;
  items: TrendingNewsItem[];
}

export interface TrendingNewsSnapshot {
  serviceDate: string | null;
  updatedAt: string | null;
  nextUpdateAt: string;
  schedule: string;
  boards: TrendingNewsBoard[];
}
