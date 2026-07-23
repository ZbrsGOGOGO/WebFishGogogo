// packages/frontend/src/features/skins/tab-title.ts
// 浏览器标签页标题伪装（Req 5.3）：将阅读页标签页标题设置为技术博客风格文本。

/**
 * 由文章标题构造技术博客风格的浏览器标签页标题。
 *
 * 形如："<articleTitle>_CSDN博客"，与真实 CSDN 文章页标签页命名习惯一致，
 * 以便阅读页在标签栏中不引人注意（Req 5.3）。
 *
 * @param articleTitle 文章（伪装）标题；为空时回退到通用技术博客标题。
 */
export function buildBlogTabTitle(articleTitle: string): string {
  const trimmed = articleTitle.trim();
  if (trimmed.length === 0) {
    return '技术博客_CSDN博客';
  }
  return `${trimmed}_CSDN博客`;
}
