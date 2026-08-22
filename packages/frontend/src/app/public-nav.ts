export interface PublicSystemNavItem {
  id: string;
  label: string;
  path: string;
  available: boolean;
}

export const PUBLIC_SYSTEM_NAV: readonly PublicSystemNavItem[] = [
  { id: 'home', label: '首页', path: '/', available: true },
  { id: 'news', label: '热点新闻', path: '/#system-news', available: false },
  { id: 'community', label: '经验交流', path: '/#system-community', available: false },
  { id: 'farm', label: '农场', path: '/#system-farm', available: false },
  { id: 'ledou', label: '乐斗', path: '/ledou', available: true },
  { id: 'feed', label: '投喂', path: '/#system-feed', available: false },
  { id: 'invite', label: '邀请', path: '/#system-invite', available: false },
  { id: 'profile', label: '我的主页', path: '/#system-profile', available: false },
  { id: 'friends', label: '好友', path: '/#system-friends', available: false },
] as const;
