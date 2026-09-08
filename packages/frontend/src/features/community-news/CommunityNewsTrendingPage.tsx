import type { JSX } from 'react';
import { useSearchParams } from 'react-router-dom';

import { PageHeader } from '../../components/ui';
import { CommunityNewsNavigation } from './CommunityNewsNavigation';
import styles from './CommunityNews.module.css';

const PLATFORM_GROUPS = [
  { id: 'social', label: '综合社交', description: '看看大家正在关注的公共话题。' },
  { id: 'entertainment', label: '视频文娱', description: '视频、电影与文娱内容的官方榜单。' },
  { id: 'technology', label: '科技知识', description: '开发项目与技术社区的热门讨论。' },
] as const;

// Official destinations only. No leaderboard entries are collected or simulated here.
export const COMMUNITY_NEWS_PLATFORM_LINKS = [
  { id: 'weibo', label: '微博热搜', mark: '微', group: 'social', url: 'https://s.weibo.com/top/summary?cate=realtimehot', description: '微博官方热搜榜', note: '可能需要登录或完成安全验证' },
  { id: 'zhihu', label: '知乎热榜', mark: '知', group: 'social', url: 'https://www.zhihu.com/hot', description: '知乎正在热议的问题', note: '可能需要登录或完成安全验证' },
  { id: 'baidu', label: '百度热搜', mark: '百', group: 'social', url: 'https://top.baidu.com/board?tab=realtime', description: '百度官方实时热搜榜', note: '在来源网站查看当前榜单' },
  { id: 'bilibili', label: '哔哩哔哩排行榜', mark: '哔', group: 'entertainment', url: 'https://www.bilibili.com/v/popular/rank/all', description: '哔哩哔哩全站视频排行榜', note: '页面需要启用 JavaScript' },
  { id: 'douyin', label: '抖音热点', mark: '抖', group: 'entertainment', url: 'https://www.douyin.com/hot', description: '抖音官方热点入口', note: '页面可能要求登录或启用 JavaScript' },
  { id: 'douban', label: '豆瓣电影排行榜', mark: '豆', group: 'entertainment', url: 'https://movie.douban.com/chart', description: '豆瓣电影官方榜单', note: '在来源网站查看当前榜单' },
  { id: 'github', label: 'GitHub Trending', mark: 'G', group: 'technology', url: 'https://github.com/trending', description: 'GitHub 热门开源仓库', note: '英文页面，可在官网切换语言与周期' },
  { id: 'hacker_news', label: 'Hacker News 热门', mark: 'Y', group: 'technology', url: 'https://news.ycombinator.com/', description: '技术社区热门链接与讨论', note: '英文页面，在官网查看讨论' },
] as const;

export function CommunityNewsTrendingPage(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedGroup = searchParams.get('group');
  const selectedGroup = PLATFORM_GROUPS.some((group) => group.id === requestedGroup) ? requestedGroup : 'all';

  function selectGroup(group: string): void {
    const next = new URLSearchParams(searchParams);
    if (group === 'all') next.delete('group');
    else next.set('group', group);
    setSearchParams(next);
  }

  return (
    <main className={styles.page}>
      <PageHeader title="平台榜单" subtitle="微博、知乎、视频和科技社区，各平台的官方入口收在这里。" />
      <CommunityNewsNavigation />
      <section className={styles.platformNotice} aria-labelledby="platform-notice-title">
        <span className={styles.eyebrow}>OFFICIAL LINKS / 官方入口</span>
        <h2 id="platform-notice-title">前往官方榜单，站内未同步榜单条目</h2>
        <p>这里是入口导航，不是实时热搜聚合。点击会在新窗口打开对应平台，排名与热度以官网为准；部分平台需要登录或安全验证。</p>
      </section>
      <div className={styles.categoryFilters} role="group" aria-label="榜单入口分类">
        <button type="button" aria-pressed={selectedGroup === 'all'} onClick={() => selectGroup('all')}>全部入口</button>
        {PLATFORM_GROUPS.map((group) => <button type="button" key={group.id} aria-pressed={selectedGroup === group.id}
          onClick={() => selectGroup(group.id)}>{group.label}</button>)}
      </div>
      {PLATFORM_GROUPS.filter((group) => selectedGroup === 'all' || group.id === selectedGroup).map((group) => (
        <section className={styles.platformGroup} key={group.id} aria-labelledby={`platform-group-${group.id}`}>
          <div className={styles.groupHeading}><h2 id={`platform-group-${group.id}`}>{group.label}</h2><p>{group.description}</p></div>
          <div className={styles.platformGrid}>
            {COMMUNITY_NEWS_PLATFORM_LINKS.filter((platform) => platform.group === group.id).map((platform) => (
              <a className={styles.platformCard} key={platform.id} data-platform={platform.id} href={platform.url}
                target="_blank" rel="noopener noreferrer nofollow" aria-label={`${platform.label}，前往官方榜单（新窗口）`}>
                <span className={styles.platformMark} aria-hidden="true">{platform.mark}</span>
                <div><h3>{platform.label}</h3><p>{platform.description}</p></div>
                <span className={styles.externalMark} aria-hidden="true">↗</span>
                <small>{platform.note}</small>
                <span className={styles.platformAction}>前往官方榜单 <span aria-hidden="true">→</span></span>
              </a>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
