// packages/frontend/src/features/tools/runtime/tools/TimestampConverter.tsx
// 时间戳转换工具：Unix 时间戳（秒 / 毫秒）<-> 人类可读日期时间，双向。纯前端。

import { useState, type JSX } from 'react';

import { Button, Input } from '../../../../components/ui';

export type ParseResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

/** 将 Unix 时间戳转为本地日期时间字符串。unit 决定输入是秒还是毫秒。 */
export function timestampToDate(
  raw: string,
  unit: 'seconds' | 'milliseconds',
): ParseResult {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { ok: false, error: '请输入时间戳' };
  }
  if (!/^-?\d+$/.test(trimmed)) {
    return { ok: false, error: '时间戳必须为整数' };
  }
  const num = Number(trimmed);
  const ms = unit === 'seconds' ? num * 1000 : num;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) {
    return { ok: false, error: '无效的时间戳' };
  }
  return { ok: true, value: formatLocal(date) };
}

/** 将日期时间字符串转为 Unix 时间戳。返回秒与毫秒两种。 */
export function dateToTimestamp(raw: string): ParseResult {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { ok: false, error: '请输入日期时间' };
  }
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) {
    return { ok: false, error: '无法解析日期时间，示例：2024-01-01 12:00:00' };
  }
  const seconds = Math.floor(ms / 1000);
  return { ok: true, value: `秒：${seconds}\n毫秒：${ms}` };
}

/** 格式化为 YYYY-MM-DD HH:mm:ss（本地时区）。 */
export function formatLocal(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

/** 时间戳转换工具组件。 */
export default function TimestampConverter(): JSX.Element {
  const [tsInput, setTsInput] = useState('');
  const [unit, setUnit] = useState<'seconds' | 'milliseconds'>('seconds');
  const [tsResult, setTsResult] = useState<ParseResult | null>(null);

  const [dateInput, setDateInput] = useState('');
  const [dateResult, setDateResult] = useState<ParseResult | null>(null);

  function setNow(): void {
    const now = Date.now();
    setTsInput(String(unit === 'seconds' ? Math.floor(now / 1000) : now));
  }

  const boxStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
    padding: 'var(--space-3)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', minWidth: 320 }}>
      <div style={boxStyle}>
        <strong>时间戳 → 日期</strong>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              type="radio"
              name="ts-unit"
              checked={unit === 'seconds'}
              onChange={() => setUnit('seconds')}
            />
            秒
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              type="radio"
              name="ts-unit"
              checked={unit === 'milliseconds'}
              onChange={() => setUnit('milliseconds')}
            />
            毫秒
          </label>
        </div>
        <Input
          value={tsInput}
          onChange={(e) => setTsInput(e.target.value)}
          placeholder={unit === 'seconds' ? '1700000000' : '1700000000000'}
          error={tsResult && !tsResult.ok ? tsResult.error : undefined}
        />
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Button size="sm" onClick={() => setTsResult(timestampToDate(tsInput, unit))}>
            转换
          </Button>
          <Button size="sm" variant="secondary" onClick={setNow}>
            现在
          </Button>
        </div>
        {tsResult?.ok && (
          <p style={{ margin: 0, fontFamily: 'var(--font-mono)' }}>{tsResult.value}</p>
        )}
      </div>

      <div style={boxStyle}>
        <strong>日期 → 时间戳</strong>
        <Input
          value={dateInput}
          onChange={(e) => setDateInput(e.target.value)}
          placeholder="2024-01-01 12:00:00"
          error={dateResult && !dateResult.ok ? dateResult.error : undefined}
        />
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Button size="sm" onClick={() => setDateResult(dateToTimestamp(dateInput))}>
            转换
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setDateInput(formatLocal(new Date()))}
          >
            现在
          </Button>
        </div>
        {dateResult?.ok && (
          <pre style={{ margin: 0, fontFamily: 'var(--font-mono)' }}>{dateResult.value}</pre>
        )}
      </div>
    </div>
  );
}
