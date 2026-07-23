// backend/src/modules/skin/csdn.template.ts
import { ArticleViewModel, FakeMeta } from '@stealth-reader/shared';

import { SkinRenderInput, SkinTemplate } from './skin.template';

/**
 * 对 HTML 特殊字符进行转义，避免正文中的字符被解释为标签。
 * 纯函数，无副作用。
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 将纯文本正文渲染为"博客正文" HTML：
 * - 以空行分段，每段包裹为 <p>；
 * - 段内换行转为 <br/>；
 * - 全篇 HTML 转义，防止注入。
 *
 * 纯函数，无副作用。
 */
function renderBodyHtml(body: string): string {
  const normalized = body.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((para) => para.trim())
    .filter((para) => para.length > 0);

  if (paragraphs.length === 0) {
    return '<p></p>';
  }

  return paragraphs
    .map((para) => {
      const withBreaks = escapeHtml(para).replace(/\n/g, '<br/>');
      return `<p>${withBreaks}</p>`;
    })
    .join('\n');
}

/**
 * CSDN 风格技术博客皮肤模板。
 *
 * 承载 Requirement 5：将标准化 ArticleViewModel 渲染为 CSDN 风格博客视图。
 * 该模板仅消费 {@link SkinRenderInput} 与 {@link FakeMeta}，不触碰真实存储（Req 5.4）。
 */
export const csdnTemplate: SkinTemplate = {
  id: 'csdn',
  displayName: 'CSDN 技术博客',

  render(input: SkinRenderInput, fakeMeta: FakeMeta): ArticleViewModel {
    return {
      articleTitle: input.title,
      htmlBody: renderBodyHtml(input.body),
      fakeMeta,
      progress: input.progress,
      skinId: this.id,
    };
  },
};
