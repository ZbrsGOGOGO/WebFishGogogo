// packages/frontend/src/features/reader/useReadingSettings.ts
// 阅读控制设置 hook（任务 16.2）。
//
// 职责：
// - 挂载时从用户偏好（GET /preferences）恢复字号、行距、明暗主题（Req 6.4）
//   以及翻页/滚动模式（Req 6.5，存于 preferences.settings.readingMode）。
// - 暴露 setter 调整上述设置，并以防抖方式持久化回用户偏好（PUT /preferences）。
//
// 设计说明：
// - 视觉设置（字号/行距/主题）持久化到偏好列（Req 6.4）。
// - 阅读模式（翻页/滚动）持久化到偏好的 settings JSONB（Req 6.5 跨会话保留）。
// - 加载完成前不触发保存，避免用默认值覆盖服务端已存偏好。

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_FONT_SIZE,
  DEFAULT_LINE_HEIGHT,
  DEFAULT_THEME,
  Theme,
} from '@stealth-reader/shared';

import { getPreferences, updatePreferences } from '../../api/preferences';
import { useAutoSave } from '../../hooks/useAutoSave';

/** 正文呈现模式（Req 6.5）。 */
export type ReadingMode = 'scroll' | 'paging';

export const DEFAULT_READING_MODE: ReadingMode = 'scroll';

/** 字号可调区间（px），避免过小/过大破坏排版。 */
export const MIN_FONT_SIZE = 12;
export const MAX_FONT_SIZE = 30;
export const FONT_SIZE_STEP = 1;

/** 行距可调区间。 */
export const MIN_LINE_HEIGHT = 1.2;
export const MAX_LINE_HEIGHT = 2.6;
export const LINE_HEIGHT_STEP = 0.1;

/** settings JSONB 中存放阅读模式的键。 */
const READING_MODE_KEY = 'readingMode';

/** 将任意值收敛到 [min, max] 闭区间。 */
function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** 规整行距，保留一位小数以匹配后端 numeric(3,1)。 */
function roundLineHeight(value: number): number {
  return Math.round(value * 10) / 10;
}

function parseReadingMode(value: unknown): ReadingMode {
  return value === 'paging' ? 'paging' : 'scroll';
}

export interface ReadingSettings {
  fontSize: number;
  lineHeight: number;
  theme: Theme;
  mode: ReadingMode;
}

export interface UseReadingSettingsResult extends ReadingSettings {
  /** 偏好是否已从服务端加载完成。 */
  loaded: boolean;
  setFontSize: (next: number) => void;
  incrementFontSize: () => void;
  decrementFontSize: () => void;
  setLineHeight: (next: number) => void;
  incrementLineHeight: () => void;
  decrementLineHeight: () => void;
  setTheme: (next: Theme) => void;
  toggleTheme: () => void;
  setMode: (next: ReadingMode) => void;
  toggleMode: () => void;
}

/**
 * 加载并管理阅读控制设置，变更后防抖持久化到用户偏好。
 *
 * @param autoSaveDelay 防抖延迟（毫秒），默认 600ms。
 */
export function useReadingSettings(
  autoSaveDelay = 600,
): UseReadingSettingsResult {
  const [fontSize, setFontSizeState] = useState<number>(DEFAULT_FONT_SIZE);
  const [lineHeight, setLineHeightState] =
    useState<number>(DEFAULT_LINE_HEIGHT);
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);
  const [mode, setModeState] = useState<ReadingMode>(DEFAULT_READING_MODE);
  const [loaded, setLoaded] = useState(false);

  // 保留服务端 settings，持久化模式时合并回去，避免覆盖其它扩展配置。
  const settingsRef = useRef<Record<string, unknown>>({});

  // 挂载时恢复偏好（Req 6.4 / 6.5）。
  useEffect(() => {
    let active = true;
    getPreferences()
      .then((prefs) => {
        if (!active) return;
        setFontSizeState(
          clamp(prefs.fontSize, MIN_FONT_SIZE, MAX_FONT_SIZE),
        );
        setLineHeightState(
          clamp(
            roundLineHeight(Number(prefs.lineHeight)),
            MIN_LINE_HEIGHT,
            MAX_LINE_HEIGHT,
          ),
        );
        setThemeState(prefs.theme === Theme.Dark ? Theme.Dark : Theme.Light);
        settingsRef.current = prefs.settings ?? {};
        setModeState(parseReadingMode(settingsRef.current[READING_MODE_KEY]));
      })
      .catch(() => {
        // 加载失败时沿用默认值，仍允许调整并保存。
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<ReadingSettings>(
    () => ({ fontSize, lineHeight, theme, mode }),
    [fontSize, lineHeight, theme, mode],
  );

  // 设置变更后防抖持久化（Req 6.4：字号/行距/主题；Req 6.5：模式）。
  useAutoSave<ReadingSettings>({
    value,
    enabled: loaded,
    delay: autoSaveDelay,
    save: (next) =>
      updatePreferences({
        fontSize: next.fontSize,
        lineHeight: next.lineHeight,
        theme: next.theme,
        settings: {
          ...settingsRef.current,
          [READING_MODE_KEY]: next.mode,
        },
      }).then(() => {
        settingsRef.current = {
          ...settingsRef.current,
          [READING_MODE_KEY]: next.mode,
        };
      }),
  });

  const setFontSize = (next: number) =>
    setFontSizeState(clamp(Math.round(next), MIN_FONT_SIZE, MAX_FONT_SIZE));
  const incrementFontSize = () =>
    setFontSizeState((prev) =>
      clamp(prev + FONT_SIZE_STEP, MIN_FONT_SIZE, MAX_FONT_SIZE),
    );
  const decrementFontSize = () =>
    setFontSizeState((prev) =>
      clamp(prev - FONT_SIZE_STEP, MIN_FONT_SIZE, MAX_FONT_SIZE),
    );

  const setLineHeight = (next: number) =>
    setLineHeightState(
      clamp(roundLineHeight(next), MIN_LINE_HEIGHT, MAX_LINE_HEIGHT),
    );
  const incrementLineHeight = () =>
    setLineHeightState((prev) =>
      clamp(
        roundLineHeight(prev + LINE_HEIGHT_STEP),
        MIN_LINE_HEIGHT,
        MAX_LINE_HEIGHT,
      ),
    );
  const decrementLineHeight = () =>
    setLineHeightState((prev) =>
      clamp(
        roundLineHeight(prev - LINE_HEIGHT_STEP),
        MIN_LINE_HEIGHT,
        MAX_LINE_HEIGHT,
      ),
    );

  const setTheme = (next: Theme) => setThemeState(next);
  const toggleTheme = () =>
    setThemeState((prev) => (prev === Theme.Dark ? Theme.Light : Theme.Dark));

  const setMode = (next: ReadingMode) => setModeState(next);
  const toggleMode = () =>
    setModeState((prev) => (prev === 'paging' ? 'scroll' : 'paging'));

  return {
    fontSize,
    lineHeight,
    theme,
    mode,
    loaded,
    setFontSize,
    incrementFontSize,
    decrementFontSize,
    setLineHeight,
    incrementLineHeight,
    decrementLineHeight,
    setTheme,
    toggleTheme,
    setMode,
    toggleMode,
  };
}
