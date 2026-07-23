// packages/frontend/src/features/tools/runtime/tools/WordCounter.tsx
// 字数统计工具（slug: word-counter）。
// 实时统计：字符数（含/不含空格）、词数、行数、CJK 字符数。
// 纯前端，无网络。逻辑见 ./textStats。

import { useMemo, useState, type JSX } from 'react';

import { Card, Textarea } from '../../../../components/ui';

import { computeTextStats } from './textStats';

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
    <Card title="字数统计">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <Textarea
          label="文本内容"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="在此粘贴或输入文本，实时统计…"
          rows={8}
          aria-label="文本内容"
        />

        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: 'var(--space-3)',
            margin: 0,
          }}
        >
          {items.map((item) => (
            <div
              key={item.label}
              style={{
                background: 'var(--color-surface-2)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-3)',
                textAlign: 'center',
              }}
            >
              <dd
                style={{
                  margin: 0,
                  fontSize: '22px',
                  fontWeight: 600,
                  color: 'var(--color-brand)',
                }}
                data-testid={`stat-value-${item.label}`}
              >
                {item.value}
              </dd>
              <dt
                style={{
                  marginTop: 'var(--space-1)',
                  fontSize: '12px',
                  color: 'var(--color-text-secondary)',
                }}
              >
                {item.label}
              </dt>
            </div>
          ))}
        </dl>
      </div>
    </Card>
  );
}
