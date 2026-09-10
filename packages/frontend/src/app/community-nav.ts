export type CommunitySystemId =
  | 'home'
  | 'news'
  | 'community'
  | 'messages'
  | 'farm'
  | 'games'
  | 'tools'
  | 'deskPet'
  | 'officeHub'
  | 'towerDefense'
  | 'demonTower'
  | 'leaderboards'
  | 'feed'
  | 'invite'
  | 'profile'
  | 'achievements'
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
  demonTower: envFlag(import.meta.env.VITE_COMMUNITY_DEMON_TOWER_ENABLED, false),
  communityProgressionEnabled: envFlag(import.meta.env.VITE_COMMUNITY_PROGRESSION_ENABLED, false),
  demonTowerAuto: envFlag(import.meta.env.VITE_DEMON_TOWER_AUTO_EXPLORE_ENABLED, false),
  workstationCampaign: envFlag(import.meta.env.VITE_WORKSTATION_CAMPAIGN_ENABLED, false),
  officeHub: envFlag(import.meta.env.VITE_OFFICE_HUB_ENABLED, false),
  demonTowerExpansion: envFlag(import.meta.env.VITE_DEMON_TOWER_EXPANSION_ENABLED, false),
  paperArena: envFlag(import.meta.env.VITE_PAPER_ARENA_ENABLED, false),
  battleServer: envFlag(import.meta.env.VITE_COMMUNITY_BATTLE_SERVER_ENABLED, false),
  feed: envFlag(import.meta.env.VITE_COMMUNITY_FEED_ENABLED, false),
  invite: envFlag(import.meta.env.VITE_COMMUNITY_INVITE_ENABLED, false),
  profile: envFlag(import.meta.env.VITE_COMMUNITY_PROFILE_ENABLED, true),
  publicProfile: envFlag(import.meta.env.VITE_COMMUNITY_PUBLIC_PROFILE_ENABLED, false),
  friends: envFlag(import.meta.env.VITE_COMMUNITY_FRIENDS_ENABLED, false),
});

/**
 * 正式社区系统导航。尚未达到发布闸门的系统保留真实路由，但不会渲染成
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
    description: '分类新闻、官方榜单入口与编辑导读',
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
    id: 'messages',
    label: '私人消息',
    path: '/messages',
    enabled: COMMUNITY_FEATURE_FLAGS.chat && COMMUNITY_FEATURE_FLAGS.friends,
    requiresAccount: true,
    description: '与好友实时私聊',
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
    id: 'games',
    label: '小游戏',
    path: '/games',
    enabled: true,
    requiresAccount: false,
    description: '单机小游戏与玩家房间',
  },
  {
    id: 'tools',
    label: '工具',
    path: '/tools',
    enabled: true,
    requiresAccount: false,
    description: '文本、时间和数据处理工具',
  },
  {
    id: 'deskPet', label: '工位搭子', path: '/desk-pet', enabled: true, requiresAccount: false,
    description: '本机图片自定义桌宠，免费互动与装扮',
  },
  {
    id: 'demonTower',
    label: '九层妖塔',
    path: '/games/demon-tower',
    enabled: COMMUNITY_FEATURE_FLAGS.demonTower,
    requiresAccount: true,
    description: '免费角色养成、文字探索与异步协作攻坚',
  },
  {
    id: 'officeHub', label: '公司协作', path: '/office',
    enabled: COMMUNITY_FEATURE_FLAGS.officeHub, requiresAccount: true,
    description: '部门周常、免费收藏、故事与异步互动',
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
    id: 'leaderboards',
    label: '排行榜',
    path: '/leaderboards',
    enabled: true,
    requiresAccount: true,
    description: '办公币余额榜与六款小游戏每日榜',
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
    label: '我的工作台',
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
  {
    id: 'achievements', label: '成长档案', path: '/achievements',
    enabled: COMMUNITY_FEATURE_FLAGS.communityProgressionEnabled, requiresAccount: true,
    description: '成就称号与赠送 期权持有者 权益',
  },
] as const;

export function communitySystemByPath(pathname: string): CommunitySystemNavItem | undefined {
  // 子系统优先于目录入口，例如九层妖塔不能被 /games 的选中态覆盖。
  return COMMUNITY_SYSTEM_NAV.reduce<CommunitySystemNavItem | undefined>((match, item) => {
    const matches = pathname === item.path ||
      (item.path !== '/' && pathname.startsWith(`${item.path}/`));
    return matches && (!match || item.path.length > match.path.length) ? item : match;
  }, undefined);
}
