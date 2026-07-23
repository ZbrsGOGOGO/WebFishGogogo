// packages/frontend/src/features/tools/runtime/tools/JsonFormatter.tsx
// JSON 格式化工具：美化（2 空格缩进）、压缩、校验。纯前端，无网络。

import { useState, type JSX } from 'react';

import { Button, Textarea } from '../../../../components/ui';

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
  return err instanceof Error ? err.message : String(err);
}

/** JSON 格式化工具组件。 */
export default function JsonFormatter(): JSX.Element {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState<string | null>(null);

  function apply(result: JsonResult): void {
    if (result.ok) {
      setOutput(result.value);
      setError(null);
    } else {
      setOutput('');
      setError(result.error);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', minWidth: 320 }}>
      <Textarea
        label="输入 JSON"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={8}
        placeholder='{"hello": "world"}'
        style={{ fontFamily: 'var(--font-mono)' }}
      />
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <Button size="sm" onClick={() => apply(formatJson(input))}>
          格式化
        </Button>
        <Button size="sm" variant="secondary" onClick={() => apply(minifyJson(input))}>
          压缩
        </Button>
        <Button size="sm" variant="ghost" onClick={() => apply(validateJson(input))}>
          校验
        </Button>
      </div>
      {error !== null && (
        <p role="alert" style={{ color: 'var(--color-danger)', margin: 0 }}>
          {error}
        </p>
      )}
      {output !== '' && (
        <Textarea
          label="结果"
          value={output}
          readOnly
          rows={8}
          style={{ fontFamily: 'var(--font-mono)' }}
        />
      )}
    </div>
  );
}
