// packages/frontend/src/features/library/DocumentSearch.tsx
// 按标题搜索文档库（Req 3.3）：提交关键字交由父组件发起 GET /documents?q=。

import { useState, type FormEvent, type JSX } from 'react';

export interface DocumentSearchProps {
  /** 当前搜索关键字（受控）。 */
  value: string;
  /** 提交搜索关键字（空字符串表示清除搜索、回到全量列表）。 */
  onSearch: (keyword: string) => void;
}

export function DocumentSearch({ value, onSearch }: DocumentSearchProps): JSX.Element {
  const [keyword, setKeyword] = useState(value);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSearch(keyword.trim());
  }

  function handleClear(): void {
    setKeyword('');
    onSearch('');
  }

  return (
    <form onSubmit={handleSubmit} role="search" aria-label="按标题搜索文档">
      <label>
        搜索标题
        <input
          type="search"
          name="q"
          value={keyword}
          placeholder="输入标题关键字"
          onChange={(e) => setKeyword(e.target.value)}
        />
      </label>
      <button type="submit">搜索</button>
      {keyword ? (
        <button type="button" onClick={handleClear}>
          清除
        </button>
      ) : null}
    </form>
  );
}
