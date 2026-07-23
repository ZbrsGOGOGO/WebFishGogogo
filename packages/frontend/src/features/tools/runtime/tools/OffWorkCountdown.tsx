// packages/frontend/src/features/tools/runtime/tools/OffWorkCountdown.tsx
// 下班倒计时（slug: off-work-countdown）。
// 输入每日下班时刻（HH:MM），逐秒实时显示距离下班的剩余时间。

import { useEffect, useState, type CSSProperties, type JSX } from 'react';

import { Card, Input } from '../../../../components/ui';
import { formatDuration, msUntilOffWork } from './logic';

const bigNumberStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '40px',
  fontWeight: 700,
  color: 'var(--color-brand)',
  letterSpacing: '2px',
  textAlign: 'center',
  margin: 'var(--space-3) 0',
};

/**
 * 下班倒计时工具。
 * - 默认下班时刻 18:00，可自定义。
 * - 每秒刷新剩余时长；已过当日时刻则自动指向次日。
 */
export default function OffWorkCountdown(): JSX.Element {
  const [time, setTime] = useState('18:00');
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const remaining = msUntilOffWork(time, now);
  const valid = remaining !== null;

  return (
    <Card title="下班倒计时" bodyClassName="">
      <div style={{ maxWidth: 320 }}>
        <Input
          label="下班时刻"
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          error={valid ? undefined : '请输入有效的 HH:MM 时间'}
        />
      </div>

      <div style={bigNumberStyle} data-testid="countdown-display">
        {valid ? formatDuration(remaining) : '--:--:--'}
      </div>

      <p style={{ textAlign: 'center', color: 'var(--color-text-secondary)' }}>
        {valid
          ? remaining === 0
            ? '到点啦，下班！🎉'
            : `距离 ${time} 下班还有`
          : '等待有效时间'}
      </p>
    </Card>
  );
}
