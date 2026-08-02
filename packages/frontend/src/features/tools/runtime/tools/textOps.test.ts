// packages/frontend/src/features/tools/runtime/tools/textOps.test.ts
// 文本操作纯逻辑单测。

import { describe, it, expect } from 'vitest';

import { applyTextOp } from './textOps';

describe('applyTextOp', () => {
  it('uppercase / lowercase 转换大小写', () => {
    expect(applyTextOp('Hello 世界', 'uppercase')).toBe('HELLO 世界');
    expect(applyTextOp('Hello World', 'lowercase')).toBe('hello world');
  });

  it('trimLines 逐行去除首尾空白', () => {
    expect(applyTextOp('  a \n\tb\t\n c ', 'trimLines')).toBe('a\nb\nc');
  });

  it('dedupe 去重并保留首次出现顺序', () => {
    expect(applyTextOp('a\nb\na\nc\nb', 'dedupe')).toBe('a\nb\nc');
  });

  it('removeBlank 删除空白行', () => {
    expect(applyTextOp('a\n\n  \nb\n', 'removeBlank')).toBe('a\nb');
  });

  it('sortAsc / sortDesc 排序行', () => {
    expect(applyTextOp('c\na\nb', 'sortAsc')).toBe('a\nb\nc');
    expect(applyTextOp('a\nc\nb', 'sortDesc')).toBe('c\nb\na');
  });

  it('统一处理 CRLF 换行', () => {
    expect(applyTextOp('a\r\n\r\nb', 'removeBlank')).toBe('a\nb');
  });

  it('空文本各操作安全返回', () => {
    expect(applyTextOp('', 'dedupe')).toBe('');
    expect(applyTextOp('', 'uppercase')).toBe('');
  });
});
