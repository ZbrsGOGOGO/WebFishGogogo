// packages/frontend/src/features/tools/runtime/tools/CurrencyConverter.tsx
// 汇率换算（slug: currency-converter）。
// 纯前端、无网络：汇率由用户手动输入（1 单位 from = rate 单位 to）。

import { useMemo, useState, type JSX } from 'react';

import { Button, Input } from '../../../../components/ui';
import { convertCurrency, trimNumber } from './logic';
import styles from './ToolSurface.module.css';

const CURRENCIES = ['CNY', 'USD', 'EUR', 'JPY', 'GBP', 'HKD', 'KRW', 'AUD'];

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
    <div className={styles.surface}>
      <p className={styles.hint}>
        汇率需手动输入（无网络）。汇率含义：1 {from} = 汇率 × {to}。
      </p>

      <div className={styles.panel}>
        <div className={styles.row}>
          <Input
            label="金额"
            type="number"
            value={amount}
            wrapperClassName={styles.grow}
            onChange={(event) => setAmount(event.target.value)}
            error={Number.isFinite(amountNum) ? undefined : '请输入有效金额'}
          />
          <label className={`${styles.selectField} ${styles.grow}`}>
            从
            <select
              className={styles.select}
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              aria-label="源货币"
            >
              {CURRENCIES.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="secondary"
            onClick={swap}
            aria-label="交换源货币和目标货币"
          >
            ⇄ 交换
          </Button>
          <label className={`${styles.selectField} ${styles.grow}`}>
            到
            <select
              className={styles.select}
              value={to}
              onChange={(event) => setTo(event.target.value)}
              aria-label="目标货币"
            >
              {CURRENCIES.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </label>
          <Input
            label={`汇率（1 ${from} = ? ${to}）`}
            type="number"
            min={0}
            step="any"
            value={rate}
            wrapperClassName={styles.grow}
            onChange={(event) => setRate(event.target.value)}
            error={
              Number.isFinite(rateNum) && rateNum > 0
                ? undefined
                : '汇率必须大于 0'
            }
          />
        </div>
      </div>

      <div className={styles.output} data-testid="currency-result">
        <span className={styles.outputText}>
          <span className={styles.outputLabel}>换算结果</span>
          <strong className={styles.outputValue}>
            {converted === null || rateNum <= 0
              ? '—'
              : `${trimNumber(amountNum)} ${from} = ${trimNumber(converted)} ${to}`}
          </strong>
        </span>
      </div>
    </div>
  );
}
