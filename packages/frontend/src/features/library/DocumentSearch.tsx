// packages/frontend/src/features/library/DocumentSearch.tsx
// 按标题搜索文档库（Req 3.3）：提交关键字交由父组件发起 GET /documents?q=。

import { useEffect, useState, type FormEvent, type JSX } from 'react';

import { Button, Input } from '../../components/ui';
import styles from './LibraryPage.module.css';

export interface DocumentSearchProps {
  /** 当前搜索关键字（受控）。 */
  value: string;
  /** 提交搜索关键字（空字符串表示清除搜索、回到全量列表）。 */
  onSearch: (keyword: string) => void;
}

export function DocumentSearch({ value, onSearch }: DocumentSearchProps): JSX.Element {
  const [keyword, setKeyword] = useState(value);

  useEffect(() => {
    setKeyword(value);
  }, [value]);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSearch(keyword.trim());
  }

  function handleClear(): void {
    setKeyword('');
    onSearch('');
  }

  return (
    <form
      className={styles.searchForm}
      onSubmit={handleSubmit}
      role="search"
      aria-label="按标题搜索文档"
    >
      <Input
        type="search"
        name="q"
        aria-label="搜索标题"
        value={keyword}
        placeholder="搜索文档标题"
        autoComplete="off"
        wrapperClassName={styles.searchInput}
        onChange={(event) => setKeyword(event.target.value)}
      />
      <Button type="submit" size="sm">
        搜索
      </Button>
      {keyword ? (
        <Button type="button" size="sm" variant="ghost" onClick={handleClear}>
          清除
        </Button>
      ) : null}
    </form>
  );
}
