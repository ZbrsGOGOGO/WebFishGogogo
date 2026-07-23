import { Profession } from '@stealth-reader/shared';

/**
 * 工具目录种子数据（人工精选的自有、合规实用小工具）。
 *
 * 合规基线（requirements.md Req 14.8 / 合规基线）：
 *   仅收录用户自有且合规的实用工具；绝不收录任何赌博、博彩、盗版分发或违法玩法工具。
 *
 * 每个条目带稳定 slug（前端据此加载对应工具组件）与职业标签集合
 * （取值属于受支持职业集合 {开发,设计,运营,财务,销售,学生,其他}）。
 *
 * 该常量由 seed 迁移（Seed...）与相关测试共享，作为单一事实来源。
 */
export interface SeedTool {
  slug: string;
  name: string;
  category: string;
  description: string;
  icon: string;
  professions: Profession[];
}

const ALL_PROFESSIONS: Profession[] = [
  Profession.Dev,
  Profession.Design,
  Profession.Ops,
  Profession.Finance,
  Profession.Sales,
  Profession.Student,
  Profession.Other,
];

export const TOOL_CATALOG_SEED: SeedTool[] = [
  {
    slug: 'off-work-countdown',
    name: '下班倒计时',
    category: '时间',
    description: '设置下班时间，实时显示距离下班的剩余时长。',
    icon: 'clock',
    professions: [...ALL_PROFESSIONS],
  },
  {
    slug: 'timer',
    name: '计时器',
    category: '时间',
    description: '正计时/倒计时与番茄钟，帮助专注与休息节奏管理。',
    icon: 'timer',
    professions: [...ALL_PROFESSIONS],
  },
  {
    slug: 'date-calculator',
    name: '日期计算',
    category: '时间',
    description: '计算两个日期的间隔天数，或在某日期上加减天数。',
    icon: 'calendar',
    professions: [
      Profession.Finance,
      Profession.Ops,
      Profession.Sales,
      Profession.Student,
      Profession.Other,
    ],
  },
  {
    slug: 'calculator',
    name: '计算器',
    category: '计算',
    description: '支持四则运算与常用函数的通用计算器。',
    icon: 'calculator',
    professions: [
      Profession.Finance,
      Profession.Sales,
      Profession.Student,
      Profession.Other,
    ],
  },
  {
    slug: 'currency-converter',
    name: '汇率换算',
    category: '计算',
    description: '按输入汇率在不同货币之间进行金额换算。',
    icon: 'currency',
    professions: [Profession.Finance, Profession.Sales, Profession.Other],
  },
  {
    slug: 'unit-converter',
    name: '单位/格式转换',
    category: '转换',
    description: '长度、重量、面积、温度等常用单位之间的换算。',
    icon: 'exchange',
    professions: [
      Profession.Dev,
      Profession.Design,
      Profession.Student,
      Profession.Other,
    ],
  },
  {
    slug: 'text-tools',
    name: '文本处理',
    category: '文本',
    description: '大小写转换、去重、去空行、排序等常用文本处理。',
    icon: 'text',
    professions: [
      Profession.Dev,
      Profession.Ops,
      Profession.Student,
      Profession.Other,
    ],
  },
  {
    slug: 'word-counter',
    name: '字数统计',
    category: '文本',
    description: '统计文本的字符数、词数与行数。',
    icon: 'count',
    professions: [
      Profession.Ops,
      Profession.Sales,
      Profession.Student,
      Profession.Other,
    ],
  },
  {
    slug: 'json-formatter',
    name: 'JSON 格式化',
    category: '开发者',
    description: '格式化、压缩与校验 JSON 文本。',
    icon: 'json',
    professions: [Profession.Dev],
  },
  {
    slug: 'timestamp-converter',
    name: '时间戳转换',
    category: '开发者',
    description: 'Unix 时间戳与可读日期时间之间的相互转换。',
    icon: 'timestamp',
    professions: [Profession.Dev],
  },
  {
    slug: 'regex-tester',
    name: '正则测试',
    category: '开发者',
    description: '在线测试正则表达式的匹配与分组结果。',
    icon: 'regex',
    professions: [Profession.Dev],
  },
  {
    slug: 'color-converter',
    name: '颜色转换',
    category: '设计',
    description: 'HEX/RGB/HSL 颜色格式互转与取色。',
    icon: 'palette',
    professions: [Profession.Design, Profession.Dev, Profession.Other],
  },
];
