// packages/frontend/src/features/tools/runtime/tools/UnitConverter.tsx
// 单位换算工具：长度（m/km/cm）、重量（kg/g）、温度（C/F）。纯前端。

import { useState, type JSX } from 'react';

import { Input } from '../../../../components/ui';
import styles from './ToolSurface.module.css';

export type Category = 'length' | 'weight' | 'temperature';

/** 各分类可选单位。 */
export const UNITS: Record<Category, string[]> = {
  length: ['m', 'km', 'cm'],
  weight: ['kg', 'g'],
  temperature: ['C', 'F'],
};

export const CATEGORY_LABELS: Record<Category, string> = {
  length: '长度',
  weight: '重量',
  temperature: '温度',
};

// 线性单位以「基准单位」的换算系数表示（值 = 数量 * factor 得到基准量）。
const LINEAR_FACTORS: Record<string, number> = {
  m: 1,
  km: 1000,
  cm: 0.01,
  kg: 1,
  g: 0.001,
};

/**
 * 单位换算。返回 null 表示无法换算（单位不匹配）。
 * 长度 / 重量为线性换算；温度使用 C<->F 公式。
 */
export function convert(
  value: number,
  from: string,
  to: string,
  category: Category,
): number | null {
  if (!Number.isFinite(value)) {
    return null;
  }
  if (category === 'temperature') {
    return convertTemperature(value, from, to);
  }
  const fromFactor = LINEAR_FACTORS[from];
  const toFactor = LINEAR_FACTORS[to];
  if (fromFactor === undefined || toFactor === undefined) {
    return null;
  }
  return (value * fromFactor) / toFactor;
}

/** 摄氏度 <-> 华氏度换算。 */
export function convertTemperature(value: number, from: string, to: string): number | null {
  if (from === to) {
    return value;
  }
  if (from === 'C' && to === 'F') {
    return (value * 9) / 5 + 32;
  }
  if (from === 'F' && to === 'C') {
    return ((value - 32) * 5) / 9;
  }
  return null;
}

/** 去除浮点尾差并保留至多 6 位小数。 */
export function roundResult(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/** 单位换算工具组件。 */
export default function UnitConverter(): JSX.Element {
  const [category, setCategory] = useState<Category>('length');
  const [from, setFrom] = useState('m');
  const [to, setTo] = useState('km');
  const [raw, setRaw] = useState('1');

  function onCategoryChange(next: Category): void {
    setCategory(next);
    const units = UNITS[next];
    setFrom(units[0]);
    setTo(units[1] ?? units[0]);
  }

  const value = Number(raw.trim());
  const valid = raw.trim() !== '' && Number.isFinite(value);
  const converted = valid ? convert(value, from, to, category) : null;

  return (
    <div className={`${styles.surface} ${styles.compact}`}>
      <section className={styles.panel}>
        <div className={styles.formGrid}>
          <label className={styles.selectField}>
            分类
            <select
              value={category}
              onChange={(event) =>
                onCategoryChange(event.target.value as Category)
              }
              className={styles.select}
              aria-label="分类"
            >
              {(Object.keys(UNITS) as Category[]).map((value) => (
                <option key={value} value={value}>
                  {CATEGORY_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <Input
            label="数值"
            type="number"
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            error={raw.trim() !== '' && !valid ? '请输入有效数字' : undefined}
          />
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.formGrid}>
          <label className={styles.selectField}>
            从
            <select
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className={styles.select}
              aria-label="源单位"
            >
              {UNITS[category].map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.selectField}>
            到
            <select
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className={styles.select}
              aria-label="目标单位"
            >
              {UNITS[category].map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <div className={styles.output}>
        <span className={styles.outputText}>
          <span className={styles.outputLabel}>换算结果</span>
          <strong className={styles.outputValue}>
            {converted !== null ? `${roundResult(converted)} ${to}` : '—'}
          </strong>
        </span>
      </div>
    </div>
  );
}
