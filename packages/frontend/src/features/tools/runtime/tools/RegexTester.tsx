// packages/frontend/src/features/tools/runtime/tools/RegexTester.tsx
// 正则测试工具：pattern + flags + 测试字符串，展示匹配与分组。纯前端。

import { useMemo, useState, type JSX } from 'react';

import { Input, Textarea } from '../../../../components/ui';

export interface RegexMatch {
  /** 完整匹配文本。 */
  match: string;
  /** 匹配起始下标。 */
  index: number;
  /** 捕获分组（不含整体匹配）。 */
  groups: Array<string | undefined>;
}

export type RegexResult =
  | { ok: true; matches: RegexMatch[] }
  | { ok: false; error: string };

/**
 * 用给定 pattern / flags 在 input 上执行正则匹配。
 * - 非法正则返回错误。
 * - 未含 'g' 标志时也会返回首个匹配。
 * - 对全局匹配做零宽匹配保护，避免死循环。
 */
export function runRegex(pattern: string, flags: string, input: string): RegexResult {
  if (pattern === '') {
    return { ok: false, error: '请输入正则表达式' };
  }
  let re: RegExp;
  try {
    re = new RegExp(pattern, flags);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const matches: RegexMatch[] = [];
  if (re.global) {
    let m: RegExpExecArray | null;
    let guard = 0;
    while ((m = re.exec(input)) !== null) {
      matches.push(toMatch(m));
      // 零宽匹配保护：手动前移 lastIndex，避免无限循环。
      if (m.index === re.lastIndex) {
        re.lastIndex += 1;
      }
      guard += 1;
      if (guard > 100000) {
        break;
      }
    }
  } else {
    const m = re.exec(input);
    if (m !== null) {
      matches.push(toMatch(m));
    }
  }
  return { ok: true, matches };
}

function toMatch(m: RegExpExecArray): RegexMatch {
  return {
    match: m[0],
    index: m.index,
    groups: m.slice(1),
  };
}

/** 正则测试工具组件。 */
export default function RegexTester(): JSX.Element {
  const [pattern, setPattern] = useState('');
  const [flags, setFlags] = useState('g');
  const [text, setText] = useState('');

  const result = useMemo(
    () => runRegex(pattern, flags, text),
    [pattern, flags, text],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', minWidth: 320 }}>
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <Input
          label="正则表达式"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          placeholder="\\d+"
          wrapperClassName={undefined}
          style={{ fontFamily: 'var(--font-mono)' }}
          error={!result.ok ? result.error : undefined}
        />
        <Input
          label="标志"
          value={flags}
          onChange={(e) => setFlags(e.target.value)}
          placeholder="gim"
          style={{ fontFamily: 'var(--font-mono)', maxWidth: 100 }}
        />
      </div>
      <Textarea
        label="测试字符串"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
      />
      {result.ok && (
        <div>
          <p style={{ margin: '0 0 var(--space-2)' }}>
            共 {result.matches.length} 处匹配
          </p>
          {result.matches.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 'var(--space-4)' }}>
              {result.matches.map((m, i) => (
                <li key={i} style={{ fontFamily: 'var(--font-mono)' }}>
                  <span>
                    [{m.index}] <strong>{JSON.stringify(m.match)}</strong>
                  </span>
                  {m.groups.length > 0 && (
                    <span style={{ color: 'var(--color-text-secondary)' }}>
                      {' '}
                      分组：{m.groups.map((g) => JSON.stringify(g ?? null)).join(', ')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
