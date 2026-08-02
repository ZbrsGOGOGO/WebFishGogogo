// packages/frontend/src/components/compliance/SelfOwnedContentDeclaration.tsx
// 可复用的"自有合法内容声明"组件（Req 13.1）。
//
// 上传界面（任务 15）导入此组件，与确认勾选框一起展示，供用户在上传前确认。
// 组件仅渲染声明文案，不含勾选/提交逻辑，以便被不同上传流程复用。

import type { JSX } from 'react';

import {
  SELF_OWNED_CONTENT_DECLARATION_ITEMS,
  SELF_OWNED_CONTENT_DECLARATION_TITLE,
} from './content-declaration';

export interface SelfOwnedContentDeclarationProps {
  /** 可选自定义标题，缺省使用标准声明标题。 */
  title?: string;
  /** 可选类名，便于宿主布局定制样式。 */
  className?: string;
}

/**
 * 展示自有合法内容声明的标题与逐条承诺列表。
 *
 * _Requirements: 13.1_
 */
export function SelfOwnedContentDeclaration({
  title = SELF_OWNED_CONTENT_DECLARATION_TITLE,
  className,
}: SelfOwnedContentDeclarationProps): JSX.Element {
  return (
    <section
      className={className}
      aria-labelledby="self-owned-content-declaration-title"
    >
      <h2 id="self-owned-content-declaration-title">{title}</h2>
      <ul>
        {SELF_OWNED_CONTENT_DECLARATION_ITEMS.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
