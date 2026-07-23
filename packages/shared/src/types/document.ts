// packages/shared/src/types/document.ts
// 对齐 design.md 6.1 共享类型定义

export type DocumentStatus = 'processing' | 'ready' | 'failed';

export interface DocumentMeta {
  id: string;
  ownerId: string;
  title: string;
  encoding: string;
  charCount: number;
  chapterCount: number;
  status: DocumentStatus;
  createdAt: string;
}

export interface ChapterIndex {
  idx: number;
  title: string | null;
  charOffset: number;
  charLength: number;
  storageKey: string;
}

export interface ReadingProgress {
  documentId: string;
  chapterIdx: number;
  charOffset: number;
  percent: number;
}

// 伪装层消费的标准视图模型（与真实内容解耦）
export interface FakeMeta {
  views: number;
  likes: number;
  favorites: number;
  tags: string[];
  columnName: string | null;
  publishedAt: string;
}

export interface ArticleViewModel {
  articleTitle: string; // 伪装标题（可用章节标题）
  htmlBody: string; // 已渲染为"博客正文"的 HTML
  fakeMeta: FakeMeta;
  progress: ReadingProgress;
  skinId: string;
}
