// packages/frontend/src/features/reader/index.ts
// 阅读引擎 feature 出口。后续任务（16.2–16.5）在此追加控制/进度/目录/老板键导出。

export { ReaderPage } from './ReaderPage';
export type { ReaderPageProps } from './ReaderPage';
export { useArticle } from './useArticle';
export type { UseArticleResult } from './useArticle';
export { useDocumentTitle } from './useDocumentTitle';
export { ReadingControls } from './ReadingControls';
export type { ReadingControlsProps } from './ReadingControls';
export { useReadingSettings, DEFAULT_READING_MODE } from './useReadingSettings';
export type {
  ReadingMode,
  ReadingSettings,
  UseReadingSettingsResult,
} from './useReadingSettings';
export { useReadingProgress, clampPercent } from './useReadingProgress';
export type {
  ReadingPosition,
  ProgressUpdate,
  UseReadingProgressOptions,
  UseReadingProgressResult,
} from './useReadingProgress';
export { ReaderSidebar } from './ReaderSidebar';
export type { ReaderSidebarProps } from './ReaderSidebar';
export { useReaderSidebar } from './useReaderSidebar';
export type {
  BookmarkPosition,
  UseReaderSidebarResult,
} from './useReaderSidebar';
export { useBossKey, DEFAULT_BOSS_KEY } from './useBossKey';
export type { UseBossKeyOptions, UseBossKeyResult } from './useBossKey';
export { BossScreen } from './BossScreen';
export type { BossScreenProps } from './BossScreen';
