/** Cosmetic achievements and ordinary member benefits; neither grants management rights. */
export interface TitleBadge { key: string; label: string }
export type CommunityAchievementMetric = 'farmHarvests' | 'platformLevel' | 'railCompleted' | 'towerLevel' | 'towerCollection' | 'towerContribution' | 'dailyChampionships' | 'developmentCompleted'
  | 'workstationFirstThree' | 'workstationPerfect' | 'workstationSpeed' | 'workstationOvertime' | 'workstationTenThousand' | 'workstationTier'
  | 'demonFirstBoss' | 'demonBossFloors' | 'demonHonorSkin' | 'demonFiveStar'
  | 'officeCollection' | 'officeStories' | 'officeDrawings' | 'officeDepartmentWins' | 'officeBossDays' | 'officeWeeklyWins';
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
  { key: 'daily_champion', title: { key: 'daily_champion', label: '今日有名' }, label: '留下冠军记录', description: '至少获得一次计奖小游戏、轨道、妖塔或正式工位塔防已结算日榜冠军；不是当前临时排名。', category: 'games', metric: 'dailyChampionships', target: 1 },
  { key: 'development_done', title: { key: 'development_done', label: '共创同事' }, label: '意见落地', description: '至少有一条自己提交的开发协作意见被标记为已完成；不展示意见内容。', category: 'development', metric: 'developmentCompleted', target: 1 },
  { key: 'workstation_three', title: { key: 'workstation_three', label: '三星装配师' }, label: '第一次三星合成', description: '正式工位塔防赛局完成首次三星合成并由服务器保存；本地练习不回传。', category: 'games', metric: 'workstationFirstThree', target: 1 },
  { key: 'workstation_perfect', title: { key: 'workstation_perfect', label: '工位守护者' }, label: '完美防线', description: '正式工位塔防达成无漏怪结算。', category: 'games', metric: 'workstationPerfect', target: 1 },
  { key: 'workstation_speed', title: { key: 'workstation_speed', label: '效率先锋' }, label: '速战速决', description: '正式塔防完成一次二十秒内清波。', category: 'games', metric: 'workstationSpeed', target: 1 },
  { key: 'workstation_overtime', title: { key: 'workstation_overtime', label: '夜班守望者' }, label: '加班也有陪伴', description: '正式塔防达成持续守关成就。', category: 'games', metric: 'workstationOvertime', target: 1 },
  { key: 'workstation_ten_thousand', title: { key: 'workstation_ten_thousand', label: '万分摸鱼王' }, label: '万分记录', description: '正式塔防累计获得一万摸鱼值；不是办公币。', category: 'games', metric: 'workstationTenThousand', target: 1 },
  ...(['实习生', '专员', '资深专员', '组长', '经理', '总监', '副总', '大老板'] as const).map((label, index): CommunityAchievementDefinition => ({
    key: `career_${index + 1}`, title: { key: `career_${index + 1}`, label }, label: `职业晋升 · ${label}`,
    description: `正式工位档案达到第 ${index + 1} 阶职业；称号不授予站点管理权限。`, category: 'community', metric: 'workstationTier', target: index + 1,
  })),
  { key: 'demon_first_boss', title: { key: 'demon_first_boss', label: '平原先锋' }, label: '首层纪念', description: '领取第一层首领的个人首次击破纪念。', category: 'tower', metric: 'demonFirstBoss', target: 1 },
  { key: 'demon_nine_bosses', title: { key: 'demon_nine_bosses', label: '九层引路人' }, label: '九层纪念', description: '领取九个不同楼层的个人首领纪念。', category: 'tower', metric: 'demonBossFloors', target: 9 },
  { key: 'demon_honor_skin', title: { key: 'demon_honor_skin', label: '论道雅士' }, label: '以武会友', description: '通过自愿论道解锁荣誉外观；不影响其他玩家资产。', category: 'tower', metric: 'demonHonorSkin', target: 1 },
  { key: 'demon_five_star', title: { key: 'demon_five_star', label: '器道宗师' }, label: '五星成器', description: '至少持有一件五星武器。', category: 'tower', metric: 'demonFiveStar', target: 1 },
  { key: 'office_collector', title: { key: 'office_collector', label: '工位收藏家' }, label: '收藏角', description: '免费收藏持有至少八种不同物品；重复不重复计数。', category: 'community', metric: 'officeCollection', target: 8 },
  { key: 'office_storyteller', title: { key: 'office_storyteller', label: '接力执笔人' }, label: '故事共创', description: '公司故事完成至少三次有效创作。', category: 'community', metric: 'officeStories', target: 3 },
  { key: 'office_artist', title: { key: 'office_artist', label: '便签画师' }, label: '落笔有形', description: '完成并发布至少三张有效猜词画稿。', category: 'community', metric: 'officeDrawings', target: 3 },
  { key: 'office_detective', title: { key: 'office_detective', label: '部门观察家' }, label: '默契观察', description: '完成至少三次符合部门协作条件的卧底胜利并领取记录。', category: 'community', metric: 'officeDepartmentWins', target: 3 },
  { key: 'office_relief', title: { key: 'office_relief', label: '从容应对' }, label: '七日轻松工单', description: '在七个不同服务日完成小老板挑战结算。', category: 'games', metric: 'officeBossDays', target: 7 },
  { key: 'office_guard', title: { key: 'office_guard', label: '部门守望者' }, label: '并肩三周', description: '完成并领取三次不同周的公司协作奖励。', category: 'community', metric: 'officeWeeklyWins', target: 3 },
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
