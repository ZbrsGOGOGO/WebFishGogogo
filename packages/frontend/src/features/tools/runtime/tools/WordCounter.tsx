// packages/frontend/src/features/tools/runtime/tools/WordCounter.tsx
// 字数统计工具（slug: word-counter）。
// 实时统计：字符数（含/不含空格）、词数、行数、CJK 字符数。
// 纯前端，无网络。逻辑见 ./textStats。

import { useMemo, useState, type JSX } from 'react';

import { Textarea } from '../../../../components/ui';

import { computeTextStats } from './textStats';
import styles from './ToolSurface.module.css';

interface StatItem {
  label: string;
  value: number;
}

/**
 * 字数统计工具组件。输入随时变化，统计结果实时刷新。
 */
export default function WordCounter(): JSX.Element {
  const [text, setText] = useState('');

  const stats = useMemo(() => computeTextStats(text), [text]);

  const items: StatItem[] = [
    { label: '字符数（含空格）', value: stats.characters },
    { label: '字符数（不含空格）', value: stats.charactersNoSpaces },
    { label: '词数', value: stats.words },
    { label: '行数', value: stats.lines },
    { label: 'CJK 字符数', value: stats.cjkCharacters },
  ];

  return (
    <div className={styles.surface}>
      <Textarea
        label="文本内容"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="在此粘贴或输入文本，实时统计…"
        rows={12}
      />

      <dl className={styles.statGrid} aria-live="polite">
        {items.map((item) => (
          <div key={item.label} className={styles.stat}>
            <dt>{item.label}</dt>
            <dd
              data-testid={`stat-value-${item.label}`}
            >
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
