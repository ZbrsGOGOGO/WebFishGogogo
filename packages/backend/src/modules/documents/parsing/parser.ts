// backend/src/modules/documents/parsing/parser.ts
// 文档解析纯函数：编码探测 + 分章。
// 对齐 design.md 6.3.1 的 pre/postconditions，支撑 Correctness Property 1（分章完整性）。

import type { ChapterIndex, SupportedEncoding } from '@stealth-reader/shared';

/**
 * 章节索引（去除 storageKey，storageKey 在写入对象存储后由上层补全）。
 */
export type ChapterSplit = Omit<ChapterIndex, 'storageKey'>;

/**
 * 常见章节标题匹配规则（按行匹配，multiline）。
 * 覆盖：
 *   - 中文数字/阿拉伯数字 "第X章/节/回/卷/部/篇/集"
 *   - 英文 "Chapter N"
 *   - 序章 / 楔子 / 前言 / 序言 / 后记 / 尾声 等特殊卷首/卷尾
 * ^ 在 multiline 模式下匹配行首（紧跟上一个换行符之后），match.index 即为该行起始偏移。
 */
const CHAPTER_TITLE_REGEX =
  /^[ \t\u3000]*(?:第\s*[0-90-9零〇一二两三四五六七八九十百千万]+\s*[章节節回卷部篇集][^\n]*|(?:chapter|Chapter|CHAPTER)\s+\d+[^\n]*|(?:序章|楔子|前言|序言|引子|后记|後記|尾声|尾聲|番外)[^\n]*)$/gm;

/**
 * 探测缓冲区文本编码。
 *
 * Preconditions:
 *   - buffer 非空 (buffer.length > 0)。空缓冲区亦被容忍，回退 'utf-8'。
 * Postconditions:
 *   - 返回值 ∈ 受支持编码集合 {'utf-8','gbk','gb2312','utf-16le'}
 *   - 不修改入参 buffer（只读，无副作用）
 */
export function detectEncoding(buffer: Buffer): SupportedEncoding {
  const len = buffer.length;

  // 1) BOM 优先判定（最可靠）
  // UTF-16LE BOM: FF FE
  if (len >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return 'utf-16le';
  }
  // UTF-8 BOM: EF BB BF
  if (len >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return 'utf-8';
  }

  // 2) 无 BOM 的 UTF-16LE 启发式：奇数位大量为 0x00（ASCII 主导文本的典型特征）
  if (looksLikeUtf16Le(buffer)) {
    return 'utf-16le';
  }

  // 3) 合法 UTF-8 序列 → utf-8
  if (isValidUtf8(buffer)) {
    return 'utf-8';
  }

  // 4) 回退到 gbk（gb2312 的超集），覆盖中文旧编码
  return 'gbk';
}

/**
 * 将全文文本切分为章节。
 *
 * Preconditions:
 *   - text 为已解码的完整文本（可为空字符串）
 * Postconditions:
 *   - ∀ i: chapters[i].idx === i
 *   - chapters[0].charOffset === 0
 *   - ∀ i>0: chapters[i].charOffset === chapters[i-1].charOffset + chapters[i-1].charLength
 *   - Σ chapters[i].charLength === text.length
 *   - 若未匹配到任何章节标题，则返回整篇作为单一章节
 *   - 无副作用（不修改 text）
 */
export function splitChapters(text: string): ChapterSplit[] {
  // 收集所有章节标题的行起始偏移与标题文本
  const boundaries: Array<{ offset: number; title: string | null }> = [];
  const regex = new RegExp(CHAPTER_TITLE_REGEX.source, CHAPTER_TITLE_REGEX.flags);

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const titleLine = match[0].trim();
    boundaries.push({ offset: match.index, title: titleLine.length > 0 ? titleLine : null });
    // 防御零长度匹配导致的死循环（当前规则不会零长匹配，此处稳妥起见）
    if (match.index === regex.lastIndex) {
      regex.lastIndex++;
    }
  }

  // 未匹配到任何章节标题 → 整篇作为单一章节（含空串场景）
  if (boundaries.length === 0) {
    return [{ idx: 0, title: null, charOffset: 0, charLength: text.length }];
  }

  // 若首个标题不在偏移 0 处，则将其前的正文作为无标题的首章（保证 charOffset[0] === 0）
  const starts: Array<{ offset: number; title: string | null }> = [];
  if (boundaries[0].offset > 0) {
    starts.push({ offset: 0, title: null });
  }
  starts.push(...boundaries);

  // 依相邻边界切分，保证偏移连续、长度之和等于 text.length
  return starts.map((start, i) => {
    const charOffset = start.offset;
    const end = i + 1 < starts.length ? starts[i + 1].offset : text.length;
    return {
      idx: i,
      title: start.title,
      charOffset,
      charLength: end - charOffset,
    };
  });
}

/**
 * 无 BOM 时的 UTF-16LE 启发式探测。
 * ASCII 主导的 UTF-16LE 文本形如 [ch, 0x00, ch, 0x00, ...]，即奇数位大量为 0。
 */
function looksLikeUtf16Le(buffer: Buffer): boolean {
  if (buffer.length < 2) {
    return false;
  }
  const sample = Math.min(buffer.length, 1024);
  let oddZeros = 0;
  let oddCount = 0;
  for (let i = 1; i < sample; i += 2) {
    oddCount++;
    if (buffer[i] === 0x00) {
      oddZeros++;
    }
  }
  return oddCount > 0 && oddZeros / oddCount > 0.6;
}

/**
 * 校验缓冲区是否为合法 UTF-8 字节序列（严格校验）。
 */
function isValidUtf8(buffer: Buffer): boolean {
  const len = buffer.length;
  let i = 0;
  while (i < len) {
    const b = buffer[i];
    if (b <= 0x7f) {
      // ASCII
      i += 1;
      continue;
    }

    let continuationBytes: number;
    if (b >= 0xc2 && b <= 0xdf) {
      continuationBytes = 1; // 2 字节序列
    } else if (b >= 0xe0 && b <= 0xef) {
      continuationBytes = 2; // 3 字节序列
    } else if (b >= 0xf0 && b <= 0xf4) {
      continuationBytes = 3; // 4 字节序列
    } else {
      return false; // 非法起始字节
    }

    if (i + continuationBytes >= len) {
      return false; // 序列被截断
    }

    for (let j = 1; j <= continuationBytes; j++) {
      const cont = buffer[i + j];
      if (cont < 0x80 || cont > 0xbf) {
        return false; // 非法后续字节
      }
    }

    i += continuationBytes + 1;
  }
  return true;
}
