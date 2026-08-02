// packages/frontend/src/features/reader/useBossKey.ts
// 老板键（Boss Key）hook（任务 16.5）。
//
// 职责与需求映射：
// - 监听用户偏好中配置的老板键快捷键（默认 'Escape'，Req 9.4）；用户可在偏好中
//   设置自定义老板键（bossKey 字段）。
// - 按下老板键时立即将界面切换为预置的"正经内容"页面 / 空白文档（Req 9.1），
//   由消费方据 active 状态渲染 BossScreen 代替阅读界面。
// - 激活期间应暂停阅读进度上报（Req 9.2）：消费方将 active 传给
//   useReadingProgress 的 paused 开关。
// - 再次按下老板键恢复到激活前的阅读界面并恢复上报（Req 9.3）。
//
// 设计说明：
// - 仅管理"是否激活"这一 UI 状态与按键监听，不直接触碰进度上报，保持与
//   阅读引擎解耦；暂停/恢复上报由消费方通过 paused 开关落实（Req 9.2/9.3）。
// - 挂载时从 GET /preferences 读取 bossKey；加载失败或未配置时回退默认键。
// - 按键匹配对 KeyboardEvent.key 做大小写不敏感比较，兼容单字符键与具名键
//   （如 'Escape'、'F2'）。当焦点位于输入类元素时忽略触发，避免打字冲突。

import { useCallback, useEffect, useRef, useState } from 'react';

import { getPreferences } from '../../api/preferences';

/** 默认老板键，与后端 user_preferences.boss_key 默认值一致（Req 9.4）。 */
export const DEFAULT_BOSS_KEY = 'Escape';

export interface UseBossKeyOptions {
  /**
   * 覆盖偏好中的老板键（主要用于测试或父级显式指定）。
   * 提供时不再从偏好加载。
   */
  bossKey?: string;
  /** 是否启用监听，默认 true。 */
  enabled?: boolean;
}

export interface UseBossKeyResult {
  /** 老板键是否处于激活状态（true 时应展示正经内容页并暂停上报）。 */
  active: boolean;
  /** 当前生效的老板键。 */
  bossKey: string;
  /** 手动激活（切换到正经页面）。 */
  activate: () => void;
  /** 手动退出老板键，恢复阅读界面。 */
  deactivate: () => void;
  /** 切换激活状态。 */
  toggle: () => void;
}

/** 判断事件目标是否为可编辑输入元素，避免在输入时误触发老板键。 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

/** 大小写不敏感地比较按键与配置的老板键。 */
function matchesBossKey(eventKey: string, bossKey: string): boolean {
  if (!eventKey || !bossKey) return false;
  return eventKey.toLowerCase() === bossKey.toLowerCase();
}

/**
 * 老板键：监听配置的快捷键在阅读界面与"正经内容"页之间切换。
 *
 * @param options bossKey 覆盖与启用开关。
 */
export function useBossKey(
  options: UseBossKeyOptions = {},
): UseBossKeyResult {
  const { bossKey: bossKeyOverride, enabled = true } = options;

  const [active, setActive] = useState(false);
  const [bossKey, setBossKey] = useState<string>(
    bossKeyOverride ?? DEFAULT_BOSS_KEY,
  );

  // 用 ref 持有最新 bossKey，供稳定的 keydown 监听读取，避免频繁重绑监听。
  const bossKeyRef = useRef(bossKey);
  bossKeyRef.current = bossKey;

  // 挂载时从偏好加载老板键（Req 9.4）；显式覆盖时跳过加载。
  useEffect(() => {
    if (bossKeyOverride) {
      setBossKey(bossKeyOverride);
      return;
    }
    let live = true;
    getPreferences()
      .then((prefs) => {
        if (!live) return;
        if (prefs.bossKey && prefs.bossKey.trim().length > 0) {
          setBossKey(prefs.bossKey);
        }
      })
      .catch(() => {
        // 加载失败时沿用默认键，仍可正常触发。
      });
    return () => {
      live = false;
    };
  }, [bossKeyOverride]);

  const activate = useCallback(() => setActive(true), []);
  const deactivate = useCallback(() => setActive(false), []);
  const toggle = useCallback(() => setActive((prev) => !prev), []);

  // 监听全局 keydown：命中老板键即切换激活状态（Req 9.1 切换 / 9.3 恢复）。
  useEffect(() => {
    if (!enabled) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      // 输入态忽略，避免与打字/表单冲突（激活态下仍允许再次按下以恢复）。
      if (!active && isEditableTarget(event.target)) return;
      if (!matchesBossKey(event.key, bossKeyRef.current)) return;
      event.preventDefault();
      setActive((prev) => !prev);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, active]);

  return { active, bossKey, activate, deactivate, toggle };
}
