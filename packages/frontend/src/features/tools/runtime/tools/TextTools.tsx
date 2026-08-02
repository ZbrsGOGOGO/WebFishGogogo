// packages/frontend/src/features/tools/runtime/tools/TextTools.tsx
// 文本处理工具（slug: text-tools）。
// 提供文本域 + 一组文本操作：大小写 / 去重 / 删空行 / 排序 / 去空格。
// 纯前端，无网络。逻辑见 ./textOps。

import { useState, type JSX } from 'react';

import { Button, Textarea } from '../../../../components/ui';

import { applyTextOp, TEXT_OPS, type TextOp } from './textOps';
import styles from './ToolSurface.module.css';

/**
 * 文本处理工具组件。
 *
 * 用户在文本域输入内容，点击操作按钮后原地应用到文本。
 */
export default function TextTools(): JSX.Element {
  const [text, setText] = useState('');

  function handleOp(op: TextOp): void {
    setText((prev) => applyTextOp(prev, op));
  }

  return (
    <div className={styles.surface}>
      <Textarea
        label="文本内容"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="在此粘贴或输入文本，然后选择下方操作…"
        rows={14}
      />

      <div className={styles.actions} role="group" aria-label="文本操作">
        {TEXT_OPS.map(({ op, label }) => (
          <Button
            key={op}
            variant="secondary"
            size="sm"
            disabled={text === ''}
            onClick={() => handleOp(op)}
          >
            {label}
          </Button>
        ))}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setText('')}
          disabled={text === ''}
        >
          清空
        </Button>
      </div>
    </div>
  );
}
