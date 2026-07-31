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
    target.closest('[contenteditable="true"]') != null ||
    ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)
  );
}
