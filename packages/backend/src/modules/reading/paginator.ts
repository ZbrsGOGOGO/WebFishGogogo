/**
 * 阅读引擎：分页器（纯函数）
 *
 * 见 design.md 6.3.2 与 requirements.md Requirement 6。
 * 支撑 Correctness Property 2（分页边界）与 Property 3（分页可遍历性）。
 */

export interface PageRequest {
  /** 章节完整文本 */
  chapterText: string;
  /** 从章节内该偏移开始（0 <= charOffset <= chapterText.length） */
  charOffset: number;
  /** 视口每页字符数（前端传入，charsPerPage > 0） */
  charsPerPage: number;
}

export interface Page {
  content: string;
  startOffset: number;
  endOffset: number;
  hasNext: boolean;
}

/**
 * 从章节文本中截取一页。
 *
 * Preconditions:
 *   - 0 <= charOffset <= chapterText.length
 *   - charsPerPage > 0
 *
 * Postconditions:
 *   - page.startOffset === charOffset
 *   - page.endOffset === min(charOffset + charsPerPage, chapterText.length)
 *   - page.content === chapterText.slice(startOffset, endOffset)
 *   - page.hasNext === (endOffset < chapterText.length)
 *   - 无副作用（不修改 chapterText）
 */
export function getPage(req: PageRequest): Page {
  const { chapterText, charOffset, charsPerPage } = req;
  const length = chapterText.length;

  const startOffset = charOffset;
  const endOffset = Math.min(charOffset + charsPerPage, length);
  const content = chapterText.slice(startOffset, endOffset);
  const hasNext = endOffset < length;

  return { content, startOffset, endOffset, hasNext };
}
