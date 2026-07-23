// packages/frontend/src/features/tools/runtime/tools/DateCalculator.tsx
// 日期计算（slug: date-calculator）。
// 功能一：计算两个日期之间的天数差。
// 功能二：在某个日期上加/减 N 天。

import { useMemo, useState, type CSSProperties, type JSX } from 'react';

import { Button, Card, Input } from '../../../../components/ui';
import { addDays, daysBetween, toIsoDate } from './logic';

const resultStyle: CSSProperties = {
  fontSize: '18px',
  fontWeight: 600,
  color: 'var(--color-brand)',
  marginTop: 'var(--space-3)',
};

const sectionStyle: CSSProperties = {
  marginBottom: 'var(--space-5)',
};

function today(): string {
  return toIsoDate(new Date());
}

/**
 * 日期计算工具：天数差 + 日期偏移。
 */
export default function DateCalculator(): JSX.Element {
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);

  const [baseDate, setBaseDate] = useState(today);
  const [deltaText, setDeltaText] = useState('7');

  const diff = useMemo(() => daysBetween(start, end), [start, end]);

  const delta = Number(deltaText);
  const shifted = useMemo(
    () => (Number.isFinite(delta) ? addDays(baseDate, delta) : null),
    [baseDate, delta],
  );

  return (
    <Card title="日期计算">
      <section style={sectionStyle}>
        <h4>两个日期相差天数</h4>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <Input
            label="开始日期"
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
          <Input
            label="结束日期"
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
        <div style={resultStyle} data-testid="date-diff">
          {diff === null
            ? '请输入有效日期'
            : `相差 ${diff} 天${diff !== 0 ? `（${Math.abs(diff)} 天${diff > 0 ? '之后' : '之前'}）` : ''}`}
        </div>
      </section>

      <section style={sectionStyle}>
        <h4>日期加减</h4>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Input
            label="基准日期"
            type="date"
            value={baseDate}
            onChange={(e) => setBaseDate(e.target.value)}
          />
          <Input
            label="天数（可为负）"
            type="number"
            value={deltaText}
            onChange={(e) => setDeltaText(e.target.value)}
            wrapperClassName=""
          />
          <div style={{ display: 'flex', gap: 'var(--space-2)', paddingBottom: 2 }}>
            <Button size="sm" variant="secondary" onClick={() => setDeltaText(String((Number(deltaText) || 0) - 1))}>
              −1
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setDeltaText(String((Number(deltaText) || 0) + 1))}>
              +1
            </Button>
          </div>
        </div>
        <div style={resultStyle} data-testid="date-shift">
          {shifted === null ? '请输入有效日期与天数' : `结果日期：${shifted}`}
        </div>
      </section>
    </Card>
  );
}
