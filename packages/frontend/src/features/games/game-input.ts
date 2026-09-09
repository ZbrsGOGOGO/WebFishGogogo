/**
 * 全局游戏快捷键必须让位于文本编辑和原生交互控件。
 *
 * 游戏按钮点击后会主动把焦点交还棋盘，因此这里保留按钮、链接的原生
 * Space / Enter 行为，同时避免常驻便签中的输入被 WASD 或空格污染。
 */
export function shouldIgnoreGameKeyboard(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    // A persistent floating game owns these keystrokes; background games must
    // not move a second character or steal focus from its canvas.
    target.closest('[data-exclusive-game-input]') != null ||
    target.closest('[contenteditable="true"]') != null ||
    ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)
  );
}

const LOCAL_GAME_FOREGROUND_EVENT = 'momo:local-game-foreground';

/** Explicit same-page ownership signal, not a synthetic browser blur event. */
export function announceLocalGameForeground(owner: string): void {
  window.dispatchEvent(new CustomEvent(LOCAL_GAME_FOREGROUND_EVENT, { detail: { owner } }));
}

/** Local games pause when another local game becomes foreground; never resume automatically. */
export function listenForOtherLocalGame(owner: string, pause: () => void): () => void {
  const listener = (event: Event): void => {
    if (event instanceof CustomEvent && typeof event.detail?.owner === 'string' && event.detail.owner !== owner) pause();
  };
  window.addEventListener(LOCAL_GAME_FOREGROUND_EVENT, listener);
  return () => window.removeEventListener(LOCAL_GAME_FOREGROUND_EVENT, listener);
}
