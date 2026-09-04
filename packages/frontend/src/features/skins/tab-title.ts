// packages/frontend/src/features/skins/tab-title.ts
// 浏览器标签页标题：统一使用摸摸公司阅读工作台品牌。

/**
 * 由当前章节标题构造阅读工作台的浏览器标签标题。
 */
export function buildBlogTabTitle(articleTitle: string): string {
  const trimmed = articleTitle.trim();
  if (trimmed.length === 0) {
    return '摸摸公司阅读工作台';
  }
  return `${trimmed} - 摸摸公司阅读工作台`;
}
