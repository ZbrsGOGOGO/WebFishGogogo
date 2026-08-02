// packages/frontend/src/features/tools/runtime/registry.tsx
// 工具运行时注册表：slug -> 懒加载工具组件 + 展示元数据。
//
// 12 个 slug 均已接入真实工具组件（T2 时间/计算类、T3 开发者类、T4 文本类）。
// 每个工具组件为对应文件的 default 导出，用 React.lazy 按需加载。

import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/** 单个工具的运行时注册项。 */
export interface ToolRuntimeEntry {
  /** 后端目录中的稳定 slug。 */
  slug: string;
  /** 展示名（Modal 标题回退用；实际优先使用后端 Tool.name）。 */
  displayName: string;
  /** 懒加载的工具组件。 */
  component: LazyExoticComponent<ComponentType>;
}

/** slug -> 运行时注册项。真实工具组件（default 导出）懒加载。 */
export const toolRuntimeRegistry: Record<string, ToolRuntimeEntry> = {
  // —— T2 时间 / 计算类 ——
  'off-work-countdown': {
    slug: 'off-work-countdown',
    displayName: '下班倒计时',
    component: lazy(() => import('./tools/OffWorkCountdown')),
  },
  timer: {
    slug: 'timer',
    displayName: '计时器',
    component: lazy(() => import('./tools/Timer')),
  },
  'date-calculator': {
    slug: 'date-calculator',
    displayName: '日期计算',
    component: lazy(() => import('./tools/DateCalculator')),
  },
  calculator: {
    slug: 'calculator',
    displayName: '计算器',
    component: lazy(() => import('./tools/Calculator')),
  },
  'currency-converter': {
    slug: 'currency-converter',
    displayName: '汇率换算',
    component: lazy(() => import('./tools/CurrencyConverter')),
  },
  // —— T3 开发者类 ——
  'json-formatter': {
    slug: 'json-formatter',
    displayName: 'JSON 格式化',
    component: lazy(() => import('./tools/JsonFormatter')),
  },
  'timestamp-converter': {
    slug: 'timestamp-converter',
    displayName: '时间戳转换',
    component: lazy(() => import('./tools/TimestampConverter')),
  },
  'regex-tester': {
    slug: 'regex-tester',
    displayName: '正则测试',
    component: lazy(() => import('./tools/RegexTester')),
  },
  'unit-converter': {
    slug: 'unit-converter',
    displayName: '单位换算',
    component: lazy(() => import('./tools/UnitConverter')),
  },
  'color-converter': {
    slug: 'color-converter',
    displayName: '颜色转换',
    component: lazy(() => import('./tools/ColorConverter')),
  },
  // —— T4 文本类 ——
  'text-tools': {
    slug: 'text-tools',
    displayName: '文本处理',
    component: lazy(() => import('./tools/TextTools')),
  },
  'word-counter': {
    slug: 'word-counter',
    displayName: '字数统计',
    component: lazy(() => import('./tools/WordCounter')),
  },
};

/** 按 slug 查询注册项；未注册返回 undefined。 */
export function getToolRuntimeEntry(
  slug: string,
): ToolRuntimeEntry | undefined {
  return toolRuntimeRegistry[slug];
}

/** 该 slug 是否已在运行时注册（即前端有可渲染组件）。 */
export function isToolRegistered(slug: string): boolean {
  return Object.prototype.hasOwnProperty.call(toolRuntimeRegistry, slug);
}
