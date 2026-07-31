// packages/frontend/src/features/tools/runtime/tools/DateCalculator.tsx
// 日期计算（slug: date-calculator）。
// 功能一：计算两个日期之间的天数差。
// 功能二：在某个日期上加/减 N 天。

import { useMemo, useState, type JSX } from 'react';

import { Button, Input } from '../../../../components/ui';
import { addDays, daysBetween, toIsoDate } from './logic';
import styles from './ToolSurface.module.css';

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
    <div className={`${styles.surface} ${styles.twoColumn}`}>
      <section className={styles.panel}>
        <h3 className={styles.panelTitle}>两个日期相差天数</h3>
        <div className={styles.formGrid}>
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
        <div className={styles.output} data-testid="date-diff">
          <span className={styles.outputText}>
            <span className={styles.outputLabel}>日期间隔</span>
            <strong className={styles.outputValue}>
              {diff === null
                ? '请输入有效日期'
                : `相差 ${diff} 天${diff !== 0 ? `（${Math.abs(diff)} 天${diff > 0 ? '之后' : '之前'}）` : ''}`}
            </strong>
          </span>
        </div>
      </section>

      <section className={styles.panel}>
        <h3 className={styles.panelTitle}>日期加减</h3>
        <div className={styles.formGrid}>
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
          />
          <div className={styles.actions}>
            <Button size="sm" variant="secondary" onClick={() => setDeltaText(String((Number(deltaText) || 0) - 1))}>
              −1
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setDeltaText(String((Number(deltaText) || 0) + 1))}>
              +1
            </Button>
          </div>
        </div>
        <div className={styles.output} data-testid="date-shift">
          <span className={styles.outputText}>
            <span className={styles.outputLabel}>结果日期</span>
            <strong className={styles.outputValue}>
              {shifted === null ? '请输入有效日期与天数' : shifted}
            </strong>
          </span>
        </div>
      </section>
    </div>
  );
}
