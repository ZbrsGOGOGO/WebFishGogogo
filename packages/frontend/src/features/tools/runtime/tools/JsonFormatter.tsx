// packages/frontend/src/features/tools/runtime/tools/JsonFormatter.tsx
// JSON 格式化工具：美化（2 空格缩进）、压缩、校验。纯前端，无网络。

import { useState, type JSX } from 'react';

import { Button, Textarea } from '../../../../components/ui';
import styles from './ToolSurface.module.css';

/** 处理结果：成功返回文本，失败返回错误信息。 */
export type JsonResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

/** 美化 JSON：使用 2 空格缩进。输入非法时返回错误。 */
export function formatJson(input: string, indent = 2): JsonResult {
  const trimmed = input.trim();
  if (trimmed === '') {
    return { ok: false, error: '请输入 JSON 内容' };
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return { ok: true, value: JSON.stringify(parsed, null, indent) };
  } catch (err) {
    return { ok: false, error: toErrorMessage(err) };
  }
}

/** 压缩 JSON：移除所有多余空白。输入非法时返回错误。 */
export function minifyJson(input: string): JsonResult {
  const trimmed = input.trim();
  if (trimmed === '') {
    return { ok: false, error: '请输入 JSON 内容' };
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return { ok: true, value: JSON.stringify(parsed) };
  } catch (err) {
    return { ok: false, error: toErrorMessage(err) };
  }
}

/** 校验 JSON 是否合法。 */
export function validateJson(input: string): JsonResult {
  const trimmed = input.trim();
  if (trimmed === '') {
    return { ok: false, error: '请输入 JSON 内容' };
  }
  try {
    JSON.parse(trimmed);
    return { ok: true, value: 'JSON 合法 ✓' };
  } catch (err) {
    return { ok: false, error: toErrorMessage(err) };
  }
}

function toErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const position = /position\s+(\d+)/i.exec(message)?.[1];
  const line = /line\s+(\d+)/i.exec(message)?.[1];
  const column = /column\s+(\d+)/i.exec(message)?.[1];
  if (line && column) {
    return `JSON 格式有误，请检查第 ${line} 行、第 ${column} 列附近。`;
  }
  if (position) {
    return `JSON 格式有误，请检查第 ${Number(position) + 1} 个字符附近。`;
  }
  return 'JSON 格式有误，请检查引号、逗号和括号是否完整。';
}

/** JSON 格式化工具组件。 */
export default function JsonFormatter(): JSX.Element {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState('');

  function apply(result: JsonResult): void {
    setCopyStatus('');
    if (result.ok) {
      setOutput(result.value);
      setError(null);
    } else {
      setOutput('');
      setError(result.error);
    }
  }

  function clearAll(): void {
    setInput('');
    setOutput('');
    setError(null);
    setCopyStatus('');
  }

  async function copyOutput(): Promise<void> {
    try {
      if (!navigator.clipboard) {
        throw new Error('clipboard unavailable');
      }
      await navigator.clipboard.writeText(output);
      setCopyStatus('结果已复制到剪贴板。');
    } catch {
      setCopyStatus('复制失败，请手动选择结果复制。');
    }
  }

  return (
    <div className={styles.surface}>
      <div className={styles.twoColumn}>
        <section className={styles.panel}>
          <h3 className={styles.panelTitle}>输入</h3>
          <Textarea
            label="JSON 文本"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            rows={13}
            placeholder='{"hello": "world"}'
            error={error ?? undefined}
            className={styles.mono}
          />
          <div className={styles.actions}>
            <Button size="sm" onClick={() => apply(formatJson(input))}>
              格式化
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => apply(minifyJson(input))}
            >
              压缩
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => apply(validateJson(input))}
            >
              校验
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={input === '' && output === ''}
              onClick={clearAll}
            >
              清空
            </Button>
          </div>
        </section>

        <section className={styles.panel}>
          <h3 className={styles.panelTitle}>结果</h3>
          <Textarea
            label="处理结果"
            value={output}
            readOnly
            rows={13}
            placeholder="格式化、压缩或校验结果会显示在这里。"
            className={styles.mono}
          />
          <div className={styles.actions}>
            <Button
              size="sm"
              disabled={output === ''}
              onClick={() => void copyOutput()}
            >
              复制结果
            </Button>
          </div>
          <p className={styles.copyStatus} role="status" aria-live="polite">
            {copyStatus}
          </p>
        </section>
      </div>
    </div>
  );
}
