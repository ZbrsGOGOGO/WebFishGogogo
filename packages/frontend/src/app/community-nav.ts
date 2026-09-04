export type CommunitySystemId =
  | 'home'
  | 'news'
  | 'community'
  | 'farm'
  | 'towerDefense'
  | 'feed'
  | 'invite'
  | 'profile'
  | 'friends';

export interface CommunitySystemNavItem {
  id: CommunitySystemId;
  label: string;
  path: string;
  enabled: boolean;
  requiresAccount: boolean;
  description: string;
}

function envFlag(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === '') return fallback;
  return value.trim().toLowerCase() === 'true';
}

export const COMMUNITY_FEATURE_FLAGS = Object.freeze({
  home: true,
  registration: envFlag(import.meta.env.VITE_COMMUNITY_REGISTRATION_ENABLED, true),
  passwordReset: envFlag(import.meta.env.VITE_COMMUNITY_PASSWORD_RESET_ENABLED, false),
  socialVerification: envFlag(
    import.meta.env.VITE_COMMUNITY_SOCIAL_VERIFICATION_ENABLED,
    false,
  ),
  accountDeletion: envFlag(
    import.meta.env.VITE_COMMUNITY_ACCOUNT_DELETION_ENABLED,
    false,
  ),
  news: envFlag(import.meta.env.VITE_COMMUNITY_NEWS_ENABLED, false),
  newsAdmin: envFlag(import.meta.env.VITE_COMMUNITY_NEWS_ADMIN_ENABLED, false),
  community: envFlag(import.meta.env.VITE_COMMUNITY_CONTENT_ENABLED, false),
  moderation: envFlag(import.meta.env.VITE_COMMUNITY_MODERATION_ENABLED, false),
  chat: envFlag(import.meta.env.VITE_COMMUNITY_CHAT_ENABLED, false),
  farm: envFlag(import.meta.env.VITE_COMMUNITY_FARM_ENABLED, false),
  towerDefense: envFlag(import.meta.env.VITE_COMMUNITY_TOWER_DEFENSE_ENABLED, true),
  battleServer: envFlag(import.meta.env.VITE_COMMUNITY_BATTLE_SERVER_ENABLED, false),
  feed: envFlag(import.meta.env.VITE_COMMUNITY_FEED_ENABLED, false),
  invite: envFlag(import.meta.env.VITE_COMMUNITY_INVITE_ENABLED, false),
  profile: envFlag(import.meta.env.VITE_COMMUNITY_PROFILE_ENABLED, true),
  publicProfile: envFlag(import.meta.env.VITE_COMMUNITY_PUBLIC_PROFILE_ENABLED, false),
  friends: envFlag(import.meta.env.VITE_COMMUNITY_FRIENDS_ENABLED, false),
});

/**
 * 正式社区九系统导航。尚未达到发布闸门的系统保留真实路由，但不会渲染成
 * 可点击链接，避免把路线图误呈现为已上线功能。
 */
export const COMMUNITY_SYSTEM_NAV: readonly CommunitySystemNavItem[] = [
  {
    id: 'home',
    label: '首页',
    path: '/',
    enabled: COMMUNITY_FEATURE_FLAGS.home,
    requiresAccount: false,
    description: '今日总览与一个主行动',
  },
  {
    id: 'news',
    label: '热点新闻',
    path: '/news',
    enabled: COMMUNITY_FEATURE_FLAGS.news,
    requiresAccount: false,
    description: '可靠来源的行业速览',
  },
  {
    id: 'community',
    label: '经验交流',
    path: '/community',
    enabled: COMMUNITY_FEATURE_FLAGS.community || COMMUNITY_FEATURE_FLAGS.chat,
    requiresAccount: false,
    description: '帖子、问答和固定聊天室',
  },
  {
    id: 'farm',
    label: '农场',
    path: '/farm',
    enabled: COMMUNITY_FEATURE_FLAGS.farm,
    requiresAccount: true,
    description: '一键照料工位绿植',
  },
  {
    id: 'towerDefense',
    label: '工位塔防',
    path: '/tower-defense',
    enabled: COMMUNITY_FEATURE_FLAGS.towerDefense,
    requiresAccount: true,
    description: '移动角色，布置防线守住核心工位',
  },
  {
    id: 'feed',
    label: '投喂',
    path: '/feed',
    enabled: COMMUNITY_FEATURE_FLAGS.feed,
    requiresAccount: true,
    description: '给好友送一份轻量鼓励',
  },
  {
    id: 'invite',
    label: '邀请',
    path: '/invite',
    enabled: COMMUNITY_FEATURE_FLAGS.invite,
    requiresAccount: true,
    description: 'Beta 准入与封顶奖励',
  },
  {
    id: 'profile',
    label: '我的主页',
    path: '/me',
    enabled: COMMUNITY_FEATURE_FLAGS.profile,
    requiresAccount: true,
    description: '资料、职业和隐私设置',
  },
  {
    id: 'friends',
    label: '好友',
    path: '/friends',
    enabled: COMMUNITY_FEATURE_FLAGS.friends,
    requiresAccount: true,
    description: '好友申请、拉黑与互动',
  },
] as const;

export function communitySystemByPath(pathname: string): CommunitySystemNavItem | undefined {
  return COMMUNITY_SYSTEM_NAV.find((item) =>
    item.path === '/' ? pathname === '/' : pathname.startsWith(item.path),
  );
}
