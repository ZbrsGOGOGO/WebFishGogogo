// packages/frontend/src/features/reader/ReadingControls.tsx
// 阅读控制条（任务 16.2）：调节字号、行距、明暗主题并持久化到用户偏好（Req 6.4），
// 以及切换翻页/滚动模式（Req 6.5）。
//
// 该组件挂载到 ReaderPage 的 controlsSlot（CsdnSkin 顶栏区域）。为保持伪装外观，
// 控件文案与图标克制，融入博客工具条风格。

import type { JSX } from 'react';
import { Theme } from '@stealth-reader/shared';

import styles from './reading-controls.module.css';
import type {
  ReadingMode,
  UseReadingSettingsResult,
} from './useReadingSettings';

export interface ReadingControlsProps {
  /** 由 {@link useReadingSettings} 提供的设置状态与操作。 */
  settings: UseReadingSettingsResult;
}

/**
 * 阅读控制条。受控于外部的 useReadingSettings 状态，本组件只负责交互与呈现。
 */
export function ReadingControls({
  settings,
}: ReadingControlsProps): JSX.Element {
  const {
    fontSize,
    lineHeight,
    theme,
    mode,
    decrementFontSize,
    incrementFontSize,
    decrementLineHeight,
    incrementLineHeight,
    toggleTheme,
    setMode,
  } = settings;

  return (
    <div
      className={styles.controls}
      role="group"
      aria-label="阅读控制"
      data-testid="reading-controls"
    >
      {/* 字号（Req 6.4） */}
      <div className={styles.group}>
        <span className={styles.label}>字号</span>
        <button
          type="button"
          className={styles.btn}
          aria-label="减小字号"
          onClick={decrementFontSize}
        >
          A-
        </button>
        <span className={styles.value} aria-live="polite">
          {fontSize}
        </span>
        <button
          type="button"
          className={styles.btn}
          aria-label="增大字号"
          onClick={incrementFontSize}
        >
          A+
        </button>
      </div>

      {/* 行距（Req 6.4） */}
      <div className={styles.group}>
        <span className={styles.label}>行距</span>
        <button
          type="button"
          className={styles.btn}
          aria-label="减小行距"
          onClick={decrementLineHeight}
        >
          −
        </button>
        <span className={styles.value} aria-live="polite">
          {lineHeight.toFixed(1)}
        </span>
        <button
          type="button"
          className={styles.btn}
          aria-label="增大行距"
          onClick={incrementLineHeight}
        >
          +
        </button>
      </div>

      {/* 明暗主题（Req 6.4） */}
      <div className={styles.group}>
        <button
          type="button"
          className={styles.btn}
          aria-label="切换明暗主题"
          aria-pressed={theme === Theme.Dark}
          onClick={toggleTheme}
        >
          {theme === Theme.Dark ? '☾ 夜间' : '☀ 日间'}
        </button>
      </div>

      {/* 翻页/滚动模式（Req 6.5） */}
      <div
        className={styles.group}
        role="radiogroup"
        aria-label="阅读模式"
      >
        <button
          type="button"
          className={styles.modeBtn}
          role="radio"
          aria-checked={mode === 'scroll'}
          data-active={mode === 'scroll'}
          onClick={() => setMode('scroll' satisfies ReadingMode)}
        >
          滚动
        </button>
        <button
          type="button"
          className={styles.modeBtn}
          role="radio"
          aria-checked={mode === 'paging'}
          data-active={mode === 'paging'}
          onClick={() => setMode('paging' satisfies ReadingMode)}
        >
          翻页
        </button>
      </div>
    </div>
  );
}
