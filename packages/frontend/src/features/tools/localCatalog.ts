import { Profession, type Tool } from '@stealth-reader/shared';

const ALL_PROFESSIONS = Object.values(Profession);

/**
 * 随前端一同发布的本机工具目录。
 *
 * 工具本体均为前端组件，因此目录接口不可用时仍应可以搜索、筛选和打开。
 * 服务端返回的数据只用于补充真实 id 与职业标签，不决定本机工具能否运行。
 */
export const LOCAL_TOOL_CATALOG: readonly Tool[] = [
  {
    id: 'local-off-work-countdown',
    slug: 'off-work-countdown',
    name: '下班倒计时',
    category: '时间',
    description: '设置下班时间，实时查看今天或明天的剩余时长。',
    icon: 'clock',
    enabled: true,
    professions: [...ALL_PROFESSIONS],
  },
  {
    id: 'local-timer',
    slug: 'timer',
    name: '计时器',
    category: '时间',
    description: '正计时、倒计时与番茄钟，管理专注和休息节奏。',
    icon: 'timer',
    enabled: true,
    professions: [...ALL_PROFESSIONS],
  },
  {
    id: 'local-date-calculator',
    slug: 'date-calculator',
    name: '日期计算',
    category: '时间',
    description: '计算日期间隔，或在指定日期上快速加减天数。',
    icon: 'calendar',
    enabled: true,
    professions: [
      Profession.Finance,
      Profession.Ops,
      Profession.Sales,
      Profession.Student,
      Profession.Other,
    ],
  },
  {
    id: 'local-calculator',
    slug: 'calculator',
    name: '计算器',
    category: '计算',
    description: '完成四则运算、百分比和正负数计算。',
    icon: 'calculator',
    enabled: true,
    professions: [
      Profession.Finance,
      Profession.Sales,
      Profession.Student,
      Profession.Other,
    ],
  },
  {
    id: 'local-currency-converter',
    slug: 'currency-converter',
    name: '汇率换算',
    category: '计算',
    description: '按手动输入的离线汇率换算常用货币金额。',
    icon: 'currency',
    enabled: true,
    professions: [Profession.Finance, Profession.Sales, Profession.Other],
  },
  {
    id: 'local-unit-converter',
    slug: 'unit-converter',
    name: '单位换算',
    category: '转换',
    description: '在常用长度、重量与温度单位之间进行换算。',
    icon: 'exchange',
    enabled: true,
    professions: [
      Profession.Dev,
      Profession.Design,
      Profession.Student,
      Profession.Other,
    ],
  },
  {
    id: 'local-text-tools',
    slug: 'text-tools',
    name: '文本处理',
    category: '文本',
    description: '大小写转换、去重、去空行、排序和空格整理。',
    icon: 'text',
    enabled: true,
    professions: [
      Profession.Dev,
      Profession.Ops,
      Profession.Student,
      Profession.Other,
    ],
  },
  {
    id: 'local-word-counter',
    slug: 'word-counter',
    name: '字数统计',
    category: '文本',
    description: '实时统计字符数、词数、行数与 CJK 字符数。',
    icon: 'count',
    enabled: true,
    professions: [
      Profession.Ops,
      Profession.Sales,
      Profession.Student,
      Profession.Other,
    ],
  },
  {
    id: 'local-json-formatter',
    slug: 'json-formatter',
    name: 'JSON 格式化',
    category: '开发者',
    description: '在本机格式化、压缩与校验 JSON 文本。',
    icon: 'json',
    enabled: true,
    professions: [Profession.Dev],
  },
  {
    id: 'local-timestamp-converter',
    slug: 'timestamp-converter',
    name: '时间戳转换',
    category: '开发者',
    description: '在 Unix 时间戳与本地日期时间之间相互转换。',
    icon: 'timestamp',
    enabled: true,
    professions: [Profession.Dev],
  },
  {
    id: 'local-regex-tester',
    slug: 'regex-tester',
    name: '正则测试',
    category: '开发者',
    description: '在本机测试正则表达式并查看匹配与分组。',
    icon: 'regex',
    enabled: true,
    professions: [Profession.Dev],
  },
  {
    id: 'local-color-converter',
    slug: 'color-converter',
    name: '颜色转换',
    category: '设计',
    description: '实时转换 HEX、RGB 与 HSL 颜色格式。',
    icon: 'palette',
    enabled: true,
    professions: [Profession.Design, Profession.Dev, Profession.Other],
  },
];

const FEATURED_SLUGS = [
  'calculator',
  'timer',
  'text-tools',
  'json-formatter',
] as const;

export const FEATURED_TOOL_SLUGS: ReadonlySet<string> = new Set(
  FEATURED_SLUGS,
);

/**
 * 保留本机目录的完整性和真实文案，只从接口目录补充稳定数据库 id 与职业标签。
 */
export function mergeWithRemoteCatalog(remoteTools: Tool[]): Tool[] {
  const remoteBySlug = new Map(remoteTools.map((tool) => [tool.slug, tool]));

  return LOCAL_TOOL_CATALOG.map((localTool) => {
    const remote = remoteBySlug.get(localTool.slug);
    if (!remote) {
      return { ...localTool, professions: [...localTool.professions] };
    }
    return {
      ...localTool,
      id: remote.id,
      professions:
        remote.professions.length > 0
          ? [...remote.professions]
          : [...localTool.professions],
    };
  });
}
