// packages/frontend/src/features/tools/runtime/tools/Timer.tsx
// 计时器（slug: timer）。
// 支持正计时（count-up）与倒计时（count-down），含番茄钟预设（25/5）。
// 提供 开始 / 暂停 / 重置。

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
} from 'react';

import { Button, Card, Input } from '../../../../components/ui';
import { formatDuration } from './logic';

type Mode = 'up' | 'down';

const displayStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '44px',
  fontWeight: 700,
  color: 'var(--color-text)',
  textAlign: 'center',
  margin: 'var(--space-4) 0',
};

const rowStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-2)',
  justifyContent: 'center',
  flexWrap: 'wrap',
};

/**
 * 计时器工具。
 * - 正计时从 0 递增；倒计时从设定分钟数递减，归零自动停止。
 * - 番茄钟预设：25 分钟专注 / 5 分钟休息（切换为倒计时模式）。
 */
export default function Timer(): JSX.Element {
  const [mode, setMode] = useState<Mode>('up');
  const [minutesInput, setMinutesInput] = useState('25');
  // 当前显示的毫秒数。
  const [elapsedMs, setElapsedMs] = useState(0);
  const [running, setRunning] = useState(false);
  // 倒计时的总时长（毫秒）。
  const [durationMs, setDurationMs] = useState(25 * 60 * 1000);

  const lastTickRef = useRef<number | null>(null);

  useEffect(() => {
    if (!running) {
      lastTickRef.current = null;
      return;
    }
    const id = window.setInterval(() => {
      const now = Date.now();
      const prev = lastTickRef.current ?? now;
      lastTickRef.current = now;
      const delta = now - prev;
      setElapsedMs((current) => current + delta);
    }, 250);
    return () => window.clearInterval(id);
  }, [running]);

  // 倒计时归零则停止。
  const remainingMs = mode === 'down' ? Math.max(0, durationMs - elapsedMs) : elapsedMs;
  useEffect(() => {
    if (mode === 'down' && running && durationMs - elapsedMs <= 0) {
      setRunning(false);
    }
  }, [mode, running, durationMs, elapsedMs]);

  function handleStartPause(): void {
    setRunning((r) => !r);
  }

  function handleReset(): void {
    setRunning(false);
    setElapsedMs(0);
    lastTickRef.current = null;
  }

  function applyCountdown(minutes: number): void {
    setMode('down');
    setDurationMs(Math.max(0, minutes) * 60 * 1000);
    setElapsedMs(0);
    setRunning(false);
    lastTickRef.current = null;
  }

  function handleModeChange(next: Mode): void {
    setMode(next);
    setElapsedMs(0);
    setRunning(false);
    lastTickRef.current = null;
    if (next === 'down') {
      const mins = Number(minutesInput);
      setDurationMs((Number.isFinite(mins) ? Math.max(0, mins) : 0) * 60 * 1000);
    }
  }

  return (
    <Card title="计时器">
      <div style={{ ...rowStyle, marginBottom: 'var(--space-3)' }}>
        <Button
          variant={mode === 'up' ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => handleModeChange('up')}
        >
          正计时
        </Button>
        <Button
          variant={mode === 'down' ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => handleModeChange('down')}
        >
          倒计时
        </Button>
      </div>

      {mode === 'down' && (
        <div style={{ maxWidth: 200, margin: '0 auto' }}>
          <Input
            label="倒计时分钟数"
            type="number"
            min={0}
            value={minutesInput}
            onChange={(e) => {
              setMinutesInput(e.target.value);
              const mins = Number(e.target.value);
              setDurationMs(
                (Number.isFinite(mins) ? Math.max(0, mins) : 0) * 60 * 1000,
              );
              setElapsedMs(0);
              setRunning(false);
            }}
          />
        </div>
      )}

      <div style={displayStyle} data-testid="timer-display">
        {formatDuration(remainingMs)}
      </div>

      <div style={rowStyle}>
        <Button onClick={handleStartPause}>{running ? '暂停' : '开始'}</Button>
        <Button variant="secondary" onClick={handleReset}>
          重置
        </Button>
      </div>

      <div style={{ ...rowStyle, marginTop: 'var(--space-4)' }}>
        <Button variant="ghost" size="sm" onClick={() => applyCountdown(25)}>
          🍅 专注 25 分钟
        </Button>
        <Button variant="ghost" size="sm" onClick={() => applyCountdown(5)}>
          ☕ 休息 5 分钟
        </Button>
      </div>
    </Card>
  );
}
