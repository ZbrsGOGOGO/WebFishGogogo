// packages/frontend/src/features/tools/runtime/tools/RegexTester.tsx
// 正则测试工具：pattern + flags + 测试字符串，展示匹配与分组。纯前端。

import { useMemo, useState, type JSX } from 'react';

import { Input, Textarea } from '../../../../components/ui';
import styles from './ToolSurface.module.css';

export interface RegexMatch {
  /** 完整匹配文本。 */
  match: string;
  /** 匹配起始下标。 */
  index: number;
  /** 捕获分组（不含整体匹配）。 */
  groups: Array<string | undefined>;
}

export type RegexResult =
  | { ok: true; matches: RegexMatch[]; truncated: boolean }
  | { ok: false; error: string };

export const MAX_REGEX_PATTERN_LENGTH = 300;
export const MAX_REGEX_INPUT_LENGTH = 10_000;
export const MAX_REGEX_RESULTS = 200;

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
  if (pattern.length > MAX_REGEX_PATTERN_LENGTH) {
    return {
      ok: false,
      error: `正则表达式不能超过 ${MAX_REGEX_PATTERN_LENGTH} 个字符`,
    };
  }
  if (input.length > MAX_REGEX_INPUT_LENGTH) {
    return {
      ok: false,
      error: `测试文本不能超过 ${MAX_REGEX_INPUT_LENGTH.toLocaleString()} 个字符`,
    };
  }
  if (!/^[dgimsuvy]*$/.test(flags)) {
    return { ok: false, error: '标志仅支持 d、g、i、m、s、u、v、y' };
  }
  let re: RegExp;
  try {
    re = new RegExp(pattern, flags);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const matches: RegexMatch[] = [];
  let truncated = false;
  if (re.global) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(input)) !== null) {
      matches.push(toMatch(m));
      // 零宽匹配保护：手动前移 lastIndex，避免无限循环。
      if (m.index === re.lastIndex) {
        re.lastIndex += 1;
      }
      if (matches.length >= MAX_REGEX_RESULTS) {
        truncated = true;
        break;
      }
    }
  } else {
    const m = re.exec(input);
    if (m !== null) {
      matches.push(toMatch(m));
    }
  }
  return { ok: true, matches, truncated };
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
    <div className={styles.surface}>
      <section className={styles.panel}>
        <div className={styles.formGrid}>
          <Input
            label={`正则表达式（最多 ${MAX_REGEX_PATTERN_LENGTH} 字符）`}
            value={pattern}
            maxLength={MAX_REGEX_PATTERN_LENGTH}
            onChange={(event) => setPattern(event.target.value)}
            placeholder="\\d+"
            className={styles.mono}
          />
          <Input
            label="标志"
            value={flags}
            maxLength={8}
            onChange={(event) => setFlags(event.target.value)}
            placeholder="gim"
            className={styles.mono}
          />
        </div>
        <Textarea
          label={`测试文本（最多 ${MAX_REGEX_INPUT_LENGTH.toLocaleString()} 字符）`}
          value={text}
          maxLength={MAX_REGEX_INPUT_LENGTH}
          onChange={(event) => setText(event.target.value)}
          rows={8}
          className={styles.mono}
        />
      </section>

      {!result.ok ? (
        <p className={styles.error} role="alert">
          {result.error}
        </p>
      ) : (
        <section className={styles.surface} aria-live="polite">
          <div className={styles.output}>
            <span className={styles.outputText}>
              <span className={styles.outputLabel}>匹配结果</span>
              <strong className={styles.outputValue}>
                {result.matches.length} 处
              </strong>
            </span>
            {result.truncated && (
              <span className={styles.secondaryText}>
                结果较多，仅展示前 {MAX_REGEX_RESULTS} 处
              </span>
            )}
          </div>
          {result.matches.length > 0 ? (
            <ul className={styles.resultList}>
              {result.matches.map((match, index) => (
                <li key={`${match.index}-${index}`}>
                  <span>
                    [{match.index}] <strong>{JSON.stringify(match.match)}</strong>
                  </span>
                  {match.groups.length > 0 && (
                    <span className={styles.secondaryText}>
                      分组：
                      {match.groups
                        .map((group) => JSON.stringify(group ?? null))
                        .join(', ')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.hint}>当前文本中没有匹配项。</p>
          )}
        </section>
      )}
    </div>
  );
}
