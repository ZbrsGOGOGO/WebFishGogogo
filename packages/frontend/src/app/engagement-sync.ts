const READING_SYNC_KEY = 'zbrs:engagement:reading-pending';
export const READING_ENGAGEMENT_PENDING_EVENT =
  'zbrs:engagement:reading-pending-changed';

function notifyReadingPendingChanged(): void {
  try {
    window.dispatchEvent(new Event(READING_ENGAGEMENT_PENDING_EVENT));
  } catch {
    // 非浏览器环境或事件不可用时，sessionStorage 仍可供下一页读取。
  }
}

export function markReadingEngagementPending(): void {
  try {
    window.sessionStorage.setItem(READING_SYNC_KEY, new Date().toISOString());
  } catch {
    // 隐私模式或禁用存储时，阅读本身仍应正常工作。
  }
  notifyReadingPendingChanged();
}

export function hasReadingEngagementPending(): boolean {
  try {
    return window.sessionStorage.getItem(READING_SYNC_KEY) != null;
  } catch {
    return false;
  }
}

export function clearReadingEngagementPending(): void {
  try {
    window.sessionStorage.removeItem(READING_SYNC_KEY);
  } catch {
    // 无需阻断首页刷新。
  }
  notifyReadingPendingChanged();
}
