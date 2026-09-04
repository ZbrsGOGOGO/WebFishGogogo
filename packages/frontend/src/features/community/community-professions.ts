export type CommunityProfessionId =
  | 'developer'
  | 'product'
  | 'qa'
  | 'sales'
  | 'hr';

export interface CommunityProfession {
  id: CommunityProfessionId;
  name: string;
  shortName: string;
  mark: string;
  slogan: string;
}

/**
 * 社区身份标签。后端暂时沿用历史字段名 `battleProfession`，但这些标签不再
 * 携带对战属性，也不代表平台对现实职业或能力的评价。
 */
export const COMMUNITY_PROFESSIONS: readonly CommunityProfession[] = [
  {
    id: 'developer',
    name: '程序员',
    shortName: '研发',
    mark: '</>',
    slogan: '把复杂问题拆成可以提交的下一步。',
  },
  {
    id: 'product',
    name: '产品经理',
    shortName: '产品',
    mark: 'PRD',
    slogan: '定义问题，也重新定义解决路径。',
  },
  {
    id: 'qa',
    name: '测试',
    shortName: '测试',
    mark: 'BUG',
    slogan: '任何侥幸，最终都会被稳定复现。',
  },
  {
    id: 'sales',
    name: '销售员',
    shortName: '销售',
    mark: 'TOP',
    slogan: '机会出现时，就要一口气拿下。',
  },
  {
    id: 'hr',
    name: '人力资源管理',
    shortName: '人力',
    mark: 'HR',
    slogan: '让团队状态，永远比问题多一点余量。',
  },
] as const;
