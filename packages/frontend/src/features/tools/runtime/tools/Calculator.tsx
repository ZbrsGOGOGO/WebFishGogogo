// packages/frontend/src/features/tools/runtime/tools/Calculator.tsx
// 计算器（slug: calculator）。基础四则运算，含键盘布局。

import { useState, type CSSProperties, type JSX } from 'react';

import { Button, Card } from '../../../../components/ui';
import { applyOperator, trimNumber, type Operator } from './logic';

interface CalcState {
  /** 当前正在输入 / 显示的字符串。 */
  display: string;
  /** 已确定的累计值。 */
  accumulator: number | null;
  /** 待执行的运算符。 */
  pendingOp: Operator | null;
  /** 下一次数字输入是否应覆盖 display（刚完成运算或选择运算符后）。 */
  overwrite: boolean;
}

const initialState: CalcState = {
  display: '0',
  accumulator: null,
  pendingOp: null,
  overwrite: true,
};

const displayStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '32px',
  fontWeight: 700,
  textAlign: 'right',
  padding: 'var(--space-3)',
  background: 'var(--color-surface-2)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  marginBottom: 'var(--space-3)',
  minHeight: 48,
  overflow: 'hidden',
  wordBreak: 'break-all',
};

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: 'var(--space-2)',
};

/** 基础四则计算器。 */
export default function Calculator(): JSX.Element {
  const [state, setState] = useState<CalcState>(initialState);

  function inputDigit(digit: string): void {
    setState((s) => {
      if (s.overwrite) {
        return { ...s, display: digit === '.' ? '0.' : digit, overwrite: false };
      }
      if (digit === '.' && s.display.includes('.')) {
        return s;
      }
      const next = s.display === '0' && digit !== '.' ? digit : s.display + digit;
      return { ...s, display: next };
    });
  }

  function chooseOperator(op: Operator): void {
    setState((s) => {
      const current = Number(s.display);
      // 有待执行运算符且用户已输入新操作数 -> 先计算。
      if (s.pendingOp !== null && s.accumulator !== null && !s.overwrite) {
        const result = applyOperator(s.accumulator, current, s.pendingOp);
        if (result === null) {
          return { ...initialState, display: 'Error' };
        }
        return {
          display: trimNumber(result),
          accumulator: result,
          pendingOp: op,
          overwrite: true,
        };
      }
      return {
        display: s.display,
        accumulator: current,
        pendingOp: op,
        overwrite: true,
      };
    });
  }

  function equals(): void {
    setState((s) => {
      if (s.pendingOp === null || s.accumulator === null) {
        return { ...s, overwrite: true };
      }
      const current = Number(s.display);
      const result = applyOperator(s.accumulator, current, s.pendingOp);
      if (result === null) {
        return { ...initialState, display: 'Error' };
      }
      return {
        display: trimNumber(result),
        accumulator: null,
        pendingOp: null,
        overwrite: true,
      };
    });
  }

  function clearAll(): void {
    setState(initialState);
  }

  function toggleSign(): void {
    setState((s) => {
      if (s.display === '0' || s.display === 'Error') {
        return s;
      }
      const next = s.display.startsWith('-') ? s.display.slice(1) : `-${s.display}`;
      return { ...s, display: next };
    });
  }

  function percent(): void {
    setState((s) => {
      const value = Number(s.display);
      if (!Number.isFinite(value)) {
        return s;
      }
      return { ...s, display: trimNumber(value / 100), overwrite: true };
    });
  }

  const opButton = (op: Operator): JSX.Element => (
    <Button
      variant={state.pendingOp === op && state.overwrite ? 'primary' : 'secondary'}
      onClick={() => chooseOperator(op)}
      fullWidth
    >
      {op}
    </Button>
  );

  const digitButton = (d: string): JSX.Element => (
    <Button variant="ghost" onClick={() => inputDigit(d)} fullWidth>
      {d}
    </Button>
  );

  return (
    <Card title="计算器">
      <div style={{ maxWidth: 280 }}>
        <div style={displayStyle} data-testid="calc-display">
          {state.display}
        </div>
        <div style={gridStyle}>
          <Button variant="danger" onClick={clearAll} fullWidth>
            C
          </Button>
          <Button variant="secondary" onClick={toggleSign} fullWidth>
            ±
          </Button>
          <Button variant="secondary" onClick={percent} fullWidth>
            %
          </Button>
          {opButton('÷')}

          {digitButton('7')}
          {digitButton('8')}
          {digitButton('9')}
          {opButton('×')}

          {digitButton('4')}
          {digitButton('5')}
          {digitButton('6')}
          {opButton('-')}

          {digitButton('1')}
          {digitButton('2')}
          {digitButton('3')}
          {opButton('+')}

          {digitButton('0')}
          {digitButton('.')}
          <Button variant="primary" onClick={equals} fullWidth style={{ gridColumn: 'span 2' }}>
            =
          </Button>
        </div>
      </div>
    </Card>
  );
}
