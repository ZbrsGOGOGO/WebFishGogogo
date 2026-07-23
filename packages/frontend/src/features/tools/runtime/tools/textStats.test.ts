// packages/frontend/src/features/tools/runtime/tools/textStats.test.ts
// 字数统计纯逻辑单测，重点覆盖 CJK。

import { describe, it, expect } from 'vitest';

import { computeTextStats, countCjk, countWords } from './textStats';

describe('countCjk', () => {
  it('统计中日韩字符', () => {
    expect(countCjk('你好')).toBe(2);
    expect(countCjk('こんにちは')).toBe(5);
    expect(countCjk('안녕')).toBe(2);
    expect(countCjk('abc123')).toBe(0);
  });
});

describe('countWords', () => {
  it('拉丁按空白分词', () => {
    expect(countWords('hello world foo')).toBe(3);
  });

  it('每个 CJK 字符计为一词', () => {
    expect(countWords('你好世界')).toBe(4);
  });

  it('混合中英文', () => {
    // "hello" = 1 词, 3 个中文字符 = 3 词
    expect(countWords('hello 你好吗')).toBe(4);
  });

  it('空文本为 0', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   ')).toBe(0);
  });
});

describe('computeTextStats', () => {
  it('统计字符数（含/不含空格）', () => {
    const s = computeTextStats('a b\tc');
    expect(s.characters).toBe(5);
    expect(s.charactersNoSpaces).toBe(3);
  });

  it('统计行数', () => {
    expect(computeTextStats('').lines).toBe(0);
    expect(computeTextStats('a').lines).toBe(1);
    expect(computeTextStats('a\nb\nc').lines).toBe(3);
  });

  it('综合含 CJK 的统计', () => {
    const s = computeTextStats('你好 world');
    expect(s.cjkCharacters).toBe(2);
    expect(s.words).toBe(3); // 你 + 好 + world
    expect(s.characters).toBe(8); // 你好 空格 world
    expect(s.charactersNoSpaces).toBe(7);
    expect(s.lines).toBe(1);
  });

  it('正确处理 emoji（代理对按码点计一字符）', () => {
    const s = computeTextStats('😀');
    expect(s.characters).toBe(1);
  });
});
