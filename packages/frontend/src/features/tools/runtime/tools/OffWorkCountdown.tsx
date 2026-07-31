// packages/frontend/src/features/tools/runtime/tools/OffWorkCountdown.tsx
// 下班倒计时（slug: off-work-countdown）。
// 输入每日下班时刻（HH:MM），逐秒实时显示距离下班的剩余时间。

import { useEffect, useState, type JSX } from 'react';

import { Input } from '../../../../components/ui';
import { formatDuration, msUntilOffWork } from './logic';
import styles from './ToolSurface.module.css';

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
    <div className={`${styles.surface} ${styles.compact}`}>
      <div className={styles.panel}>
        <Input
          label="下班时刻"
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          error={valid ? undefined : '请输入有效的 HH:MM 时间'}
        />
      </div>

      <div
        className={styles.timerDisplay}
        role="timer"
        aria-live="off"
        data-testid="countdown-display"
      >
        {valid ? formatDuration(remaining) : '--:--:--'}
      </div>

      <p className={`${styles.hint} ${styles.center}`}>
        {valid
          ? remaining === 0
            ? '到点啦，下班！🎉'
            : `距离 ${time} 下班还有`
          : '等待有效时间'}
      </p>
    </div>
  );
}
