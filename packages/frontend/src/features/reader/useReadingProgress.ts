// packages/frontend/src/features/reader/useReadingProgress.ts
// 阅读进度自动保存与恢复 hook（任务 16.3）。
//
// 职责：
// - 重开文档时，从 ArticleViewModel.progress 恢复到上次保存的章节序号与
//   章节内偏移（Req 7.2）。
// - 用户翻页/滚动改变阅读位置时，以防抖方式自动保存该文档的阅读进度
//   （Req 7.1），复用通用 useAutoSave（内部基于 useDebouncedCallback）。
//
// 设计说明：
// - 保存的 percent 收敛到 [0, 100] 闭区间，与后端 reading_progress.percent
//   约束一致（Req 7.4）。
// - 恢复动作按 docId 仅执行一次，避免文章重新拉取时用旧进度覆盖用户在本次
//   会话中已推进的位置。
// - 恢复到的初始进度会作为 useAutoSave 的基线（不会触发一次多余的回写）；
//   只有用户后续翻页/滚动产生的变化才会触发防抖保存。
// - 支持 paused 开关，便于后续老板键（任务 16.5）在激活时暂停进度上报
//   （Req 9.2），默认不暂停。

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReadingProgress } from '@stealth-reader/shared';

import { readingApi } from '../../api';
import { useAutoSave, type SaveStatus } from '../../hooks/useAutoSave';

/** 阅读位置（章节内偏移 + 全书百分比）。 */
export interface ReadingPosition {
  chapterIdx: number;
  charOffset: number;
  percent: number;
}

/** 上报进度时可部分更新的字段。 */
export type ProgressUpdate = Partial<ReadingPosition>;

export interface UseReadingProgressOptions {
  /** 防抖延迟（毫秒），默认 800ms。 */
  delay?: number;
  /**
   * 是否暂停进度上报（老板键激活时置为 true，Req 9.2）。
   * 暂停期间位置变化仍会记录到本地状态，但不会触发保存。
   */
  paused?: boolean;
}

export interface UseReadingProgressResult {
  /** 当前阅读位置（已恢复上次进度或用户最新位置）。 */
  progress: ReadingPosition;
  /** 是否已从文章视图模型恢复过初始进度（Req 7.2）。 */
  restored: boolean;
  /** 保存状态。 */
  status: SaveStatus;
  /** 最近一次保存失败的错误信息（成功后清空）。 */
  error: string | null;
  /** 上报最新阅读位置（翻页/滚动时调用），将触发防抖保存（Req 7.1）。 */
  reportProgress: (update: ProgressUpdate) => void;
  /** 立即落盘挂起的保存（例如离开页面前）。 */
  flush: () => void;
}

const DEFAULT_POSITION: ReadingPosition = {
  chapterIdx: 0,
  charOffset: 0,
  percent: 0,
};

/** 将百分比收敛到 [0, 100] 闭区间（Req 7.4）。 */
export function clampPercent(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/** 将非负整数偏移规整（防止负值/小数）。 */
function normalizeOffset(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

/**
 * 管理某文档的阅读进度：挂载/重开时恢复上次位置，翻页/滚动时防抖保存。
 *
 * @param docId           文档 ID；为 undefined 时不发起保存。
 * @param initialProgress 文章视图模型中的进度（来自后端持久化），用于恢复（Req 7.2）。
 * @param options         防抖延迟与暂停开关。
 */
export function useReadingProgress(
  docId: string | undefined,
  initialProgress: ReadingProgress | null | undefined,
  options: UseReadingProgressOptions = {},
): UseReadingProgressResult {
  const { delay = 800, paused = false } = options;

  const [progress, setProgress] = useState<ReadingPosition>(DEFAULT_POSITION);
  const [restored, setRestored] = useState(false);

  // 记录已恢复过的 docId，保证同一文档仅恢复一次（避免覆盖用户已推进的位置）。
  const restoredDocRef = useRef<string | null>(null);

  // 恢复上次保存的章节与偏移（Req 7.2）。
  useEffect(() => {
    if (!docId || !initialProgress) return;
    if (restoredDocRef.current === docId) return;

    restoredDocRef.current = docId;
    setProgress({
      chapterIdx: normalizeOffset(initialProgress.chapterIdx),
      charOffset: normalizeOffset(initialProgress.charOffset),
      percent: clampPercent(initialProgress.percent),
    });
    setRestored(true);
  }, [docId, initialProgress]);

  // 位置变化后防抖保存（Req 7.1）；恢复完成前及暂停时不保存。
  const { status, error, flush } = useAutoSave<ReadingPosition>({
    value: progress,
    enabled: Boolean(docId) && restored && !paused,
    delay,
    save: (next) => {
      if (!docId) return Promise.resolve();
      return readingApi.saveProgress(docId, {
        chapterIdx: next.chapterIdx,
        charOffset: next.charOffset,
        percent: clampPercent(next.percent),
      });
    },
  });

  const reportProgress = useCallback((update: ProgressUpdate) => {
    setProgress((prev) => {
      const next: ReadingPosition = {
        chapterIdx:
          update.chapterIdx === undefined
            ? prev.chapterIdx
            : normalizeOffset(update.chapterIdx),
        charOffset:
          update.charOffset === undefined
            ? prev.charOffset
            : normalizeOffset(update.charOffset),
        percent:
          update.percent === undefined
            ? prev.percent
            : clampPercent(update.percent),
      };
      // 无变化时保持引用不变，避免触发多余的保存。
      if (
        next.chapterIdx === prev.chapterIdx &&
        next.charOffset === prev.charOffset &&
        next.percent === prev.percent
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  return { progress, restored, status, error, reportProgress, flush };
}
