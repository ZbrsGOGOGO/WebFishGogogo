/** Cosmetic achievements and ordinary member benefits; neither grants management rights. */
export interface TitleBadge { key: string; label: string }
export type CommunityAchievementMetric = 'farmHarvests' | 'platformLevel' | 'railCompleted' | 'towerLevel' | 'towerCollection' | 'towerContribution' | 'dailyChampionships' | 'developmentCompleted';
export interface CommunityAchievementDefinition {
  key: string; title: TitleBadge; label: string; description: string;
  category: 'farm' | 'community' | 'games' | 'tower' | 'development';
  metric: CommunityAchievementMetric; target: number;
}
export const COMMUNITY_ACHIEVEMENTS: readonly CommunityAchievementDefinition[] = [
  { key: 'farm_first', title: { key: 'farm_first', label: '工位园丁' }, label: '第一批收获', description: '成功收获 1 批作物；多地块同时收获计为 1 批。', category: 'farm', metric: 'farmHarvests', target: 1 },
  { key: 'farm_25', title: { key: 'farm_25', label: '绿意常驻' }, label: '二十五批绿意', description: '累计成功收获 25 批作物。', category: 'farm', metric: 'farmHarvests', target: 25 },
  { key: 'farm_100', title: { key: 'farm_100', label: '百收园艺师' }, label: '百批丰收', description: '累计成功收获 100 批作物。', category: 'farm', metric: 'farmHarvests', target: 100 },
  { key: 'community_10', title: { key: 'community_10', label: '工位熟面孔' }, label: '社区成长', description: '全站共享玩家等级达到 10 级；不使用妖塔独立等级。', category: 'community', metric: 'platformLevel', target: 10 },
  { key: 'rail_first', title: { key: 'rail_first', label: '轨道见习生' }, label: '完整参与', description: '轨道难题完整有效参与 1 局；包括合法练习，不含退出或缺少必要操作的局。', category: 'games', metric: 'railCompleted', target: 1 },
  { key: 'rail_10', title: { key: 'rail_10', label: '轨道观察家' }, label: '十局推演', description: '轨道难题完整有效参与 10 局。', category: 'games', metric: 'railCompleted', target: 10 },
  { key: 'tower_5', title: { key: 'tower_5', label: '入塔行者' }, label: '妖塔启程', description: '妖塔独立等级达到 5 级。', category: 'tower', metric: 'towerLevel', target: 5 },
  { key: 'tower_20', title: { key: 'tower_20', label: '登楼客' }, label: '历练有成', description: '妖塔独立等级达到 20 级。', category: 'tower', metric: 'towerLevel', target: 20 },
  { key: 'tower_collection', title: { key: 'tower_collection', label: '百宝行囊' }, label: '拓展收藏', description: '妖塔持有 12 种不同武器或技能，包含新手赠品，重复副本不重复计数。', category: 'tower', metric: 'towerCollection', target: 12 },
  { key: 'tower_contributor', title: { key: 'tower_contributor', label: '同路筑塔人' }, label: '共同开路', description: '妖塔累计有效首领伤害与通道建设进度合计达到 1000；不是排行榜分数。', category: 'tower', metric: 'towerContribution', target: 1000 },
  { key: 'daily_champion', title: { key: 'daily_champion', label: '今日有名' }, label: '留下冠军记录', description: '至少获得一次玩家建房、轨道或妖塔已结算日榜冠军；不是当前临时排名。', category: 'games', metric: 'dailyChampionships', target: 1 },
  { key: 'development_done', title: { key: 'development_done', label: '共创同事' }, label: '意见落地', description: '至少有一条自己提交的开发协作意见被标记为已完成；不展示意见内容。', category: 'development', metric: 'developmentCompleted', target: 1 },
];
export interface CommunityMembershipView {
  active: boolean; startsAt: string | null; expiresAt: string | null;
  source: 'launch_gift' | null; benefits: ('demon_tower_auto_explore')[];
}
export interface CommunityProgressionCatalog {
  enabled: boolean; achievements: readonly CommunityAchievementDefinition[];
  membership: { giftDays: 30; automaticRenewal: false; paid: false; benefit: 'demon_tower_auto_explore'; existingAccountsOnly: true };
  historicalDataNotice: string;
}
export interface CommunityAchievementView {
  key: string; progress: number; target: number; eligible: boolean;
  unlockedAt: string | null;
}
export interface CommunityProgressionView {
  serverNow: string; enabled: boolean; writesEnabled: boolean;
  vip: CommunityMembershipView;
  presentation: { version: number; equippedTitle: TitleBadge | null };
  achievements: CommunityAchievementView[];
}
export interface CommunityTitleInput { requestId: string; expectedVersion: number; titleKey: string | null }
export interface CommunityTitleReceipt { requestId: string; replayed: boolean; overview: CommunityProgressionView }
export interface CommunityAchievementRefreshReceipt { newlyUnlocked: string[]; overview: CommunityProgressionView }
