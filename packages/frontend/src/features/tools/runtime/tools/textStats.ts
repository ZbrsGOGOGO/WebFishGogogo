// packages/frontend/src/features/tools/runtime/tools/textStats.ts
// 字数统计工具（word-counter）的纯逻辑。
// 需正确处理 CJK：中文/日文/韩文按「每字一词」计数，拉丁文按空白分词。

/** 文本统计结果。 */
export interface TextStats {
  /** 字符总数（含空格与换行），按 Unicode 码点计。 */
  characters: number;
  /** 不含空白字符的字符数。 */
  charactersNoSpaces: number;
  /** 词数：CJK 单字各计一词，拉丁词按空白分组计一词。 */
  words: number;
  /** 行数（空文本为 0，否则为换行数 + 1）。 */
  lines: number;
  /** CJK 字符数（中日韩统一表意文字等）。 */
  cjkCharacters: number;
}

/**
 * CJK 字符匹配范围（统一表意文字 + 扩展 A + 兼容 + 假名 + 韩文音节）。
 * 用于区分「按字计词」的东亚文字。
 */
const CJK_REGEX =
  /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f\uac00-\ud7af]/gu;

/** 拉丁/数字等「词」的匹配：连续的非空白、非 CJK 字符。 */
const LATIN_WORD_REGEX =
  /[^\s\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f\uac00-\ud7af]+/gu;

/** 统计 CJK 字符数量。 */
export function countCjk(text: string): number {
  const matches = text.match(CJK_REGEX);
  return matches ? matches.length : 0;
}

/**
 * 统计词数。
 *
 * - 每个 CJK 字符各计为 1 词。
 * - 连续的拉丁/数字/符号（非空白、非 CJK）计为 1 词。
 */
export function countWords(text: string): number {
  const cjk = countCjk(text);
  const latinMatches = text.match(LATIN_WORD_REGEX);
  const latin = latinMatches ? latinMatches.length : 0;
  return cjk + latin;
}

/** 计算完整统计结果。 */
export function computeTextStats(text: string): TextStats {
  // 使用扩展运算符按码点拆分，正确处理代理对（emoji 等）。
  const codePoints = [...text];
  const characters = codePoints.length;
  const charactersNoSpaces = codePoints.filter(
    (ch) => !/\s/u.test(ch),
  ).length;
  const lines = text === '' ? 0 : text.replace(/\r\n?/g, '\n').split('\n').length;

  return {
    characters,
    charactersNoSpaces,
    words: countWords(text),
    lines,
    cjkCharacters: countCjk(text),
  };
}
