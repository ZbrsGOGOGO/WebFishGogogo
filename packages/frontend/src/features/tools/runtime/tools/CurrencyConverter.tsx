// packages/frontend/src/features/tools/runtime/tools/CurrencyConverter.tsx
// 汇率换算（slug: currency-converter）。
// 纯前端、无网络：汇率由用户手动输入（1 单位 from = rate 单位 to）。

import { useMemo, useState, type CSSProperties, type JSX } from 'react';

import { Button, Card, Input } from '../../../../components/ui';
import { convertCurrency, trimNumber } from './logic';

const CURRENCIES = ['CNY', 'USD', 'EUR', 'JPY', 'GBP', 'HKD', 'KRW', 'AUD'];

const resultStyle: CSSProperties = {
  fontSize: '24px',
  fontWeight: 700,
  color: 'var(--color-brand)',
  marginTop: 'var(--space-4)',
  textAlign: 'center',
};

const selectStyle: CSSProperties = {
  height: 38,
  padding: '0 var(--space-2)',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  fontFamily: 'inherit',
  fontSize: 14,
};

/**
 * 汇率换算工具。汇率为手动输入，无任何网络请求。
 */
export default function CurrencyConverter(): JSX.Element {
  const [amount, setAmount] = useState('100');
  const [from, setFrom] = useState('CNY');
  const [to, setTo] = useState('USD');
  const [rate, setRate] = useState('0.14');

  const amountNum = Number(amount);
  const rateNum = Number(rate);

  const converted = useMemo(
    () => convertCurrency(amountNum, rateNum),
    [amountNum, rateNum],
  );

  function swap(): void {
    setFrom(to);
    setTo(from);
    // 反向汇率。
    if (Number.isFinite(rateNum) && rateNum > 0) {
      setRate(trimNumber(1 / rateNum));
    }
  }

  return (
    <Card title="汇率换算">
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>
        汇率需手动输入（无网络）。汇率含义：1 {from} = 汇率 × {to}。
      </p>

      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Input
          label="金额"
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={Number.isFinite(amountNum) ? undefined : '请输入有效金额'}
        />
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
          从
          <select
            style={selectStyle}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            aria-label="源货币"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <Button variant="ghost" size="sm" onClick={swap} aria-label="交换货币">
          ⇄
        </Button>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
          到
          <select
            style={selectStyle}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            aria-label="目标货币"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ maxWidth: 240, marginTop: 'var(--space-3)' }}>
        <Input
          label={`汇率（1 ${from} = ? ${to}）`}
          type="number"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          error={Number.isFinite(rateNum) && rateNum >= 0 ? undefined : '请输入有效汇率'}
        />
      </div>

      <div style={resultStyle} data-testid="currency-result">
        {converted === null
          ? '—'
          : `${trimNumber(amountNum)} ${from} = ${trimNumber(converted)} ${to}`}
      </div>
    </Card>
  );
}
