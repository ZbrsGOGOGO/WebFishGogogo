// packages/shared/src/constants/index.ts
// 主题枚举、分页默认值等（对齐 design.md：user_preferences.theme、DEFAULT_CHARS_PER_PAGE）

// 阅读主题（对齐 user_preferences.theme: 'light' | 'dark'）
export enum Theme {
  Light = 'light',
  Dark = 'dark',
}

export const DEFAULT_THEME: Theme = Theme.Light;

// 阅读引擎：每页字符数默认值（getPage 的 charsPerPage 默认来源）
export const DEFAULT_CHARS_PER_PAGE = 1000;

// 文档库列表分页默认值
export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// 阅读控制默认值（对齐 user_preferences 默认列）
export const DEFAULT_FONT_SIZE = 16;
export const DEFAULT_LINE_HEIGHT = 1.8;
export const DEFAULT_ACTIVE_SKIN = 'csdn';
export const DEFAULT_BOSS_KEY = 'Escape';

// 受支持文本编码集合（对齐 requirements.md Requirement 4.1）
export const SUPPORTED_ENCODINGS = [
  'utf-8',
  'gbk',
  'gb2312',
  'utf-16le',
] as const;
export type SupportedEncoding = (typeof SUPPORTED_ENCODINGS)[number];
