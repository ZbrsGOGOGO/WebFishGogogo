import type {
  DevelopmentCategory,
  DevelopmentEvent,
  DevelopmentPerson,
  DevelopmentStatus,
} from '@stealth-reader/shared';
import type { TagColor } from '../../components/ui';
import { CommunityApiError } from '../../api/community-http';
import { communityRequestErrorMessage } from '../community/request-error';

export const DEVELOPMENT_CATEGORY_LABELS: Record<DevelopmentCategory, string> = {
  bug: '缺陷',
  feature: '新功能',
  ui: '界面体验',
  game: '小游戏',
  other: '其他',
};

export const DEVELOPMENT_STATUS_LABELS: Record<DevelopmentStatus, string> = {
  submitted: '待审阅',
  needs_info: '待补充',
  accepted: '已接纳',
  rejected: '已拒绝',
  in_progress: '实现中',
  done: '已完成',
};

export function developmentStatusColor(status: DevelopmentStatus): TagColor {
  if (status === 'done' || status === 'accepted') return 'success';
  if (status === 'rejected') return 'danger';
  if (status === 'submitted' || status === 'needs_info') return 'brand';
  return 'neutral';
}

export function developmentPersonName(person: DevelopmentPerson): string {
  return person.displayName || (person.username ? `@${person.username}` : person.publicId);
}

export function developmentEventActorName(event: DevelopmentEvent): string {
  const actor = event.actor;
  if (!actor) return '未知操作人';
  if ('kind' in actor) {
    return event.actorSource === 'site_operations' && actor.kind === 'system' &&
      actor.publicId === null && actor.username === null
      ? '站点运维（站长授权）'
      : '未知操作人';
  }
  return developmentPersonName(actor);
}

export function developmentTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN');
}

export function developmentError(error: unknown, fallback: string): string {
  if (error instanceof CommunityApiError) {
    const code = error.body && typeof error.body === 'object' && 'code' in error.body
      ? (error.body as { code?: unknown }).code
      : undefined;
    if (code === 'DEVELOPMENT_VERSION_CONFLICT' || code === 'STALE_SESSION_REFRESH') {
      return '内容已被其他操作更新，本次操作没有覆盖新版本。请刷新详情后重试。';
    }
    if (code === 'STATUS_TRANSITION_INVALID') return '当前状态不能转到所选状态，请刷新后核对最新流程。';
    if (code === 'COMMENT_LIMIT') return '这条提案的评论数量已达上限。';
    if (code === 'DECISION_LIMIT') return '这条提案的决策记录已达上限。';
    if (code === 'ATTACHMENTS_FROZEN') return '当前状态已冻结附件，无法继续上传。';
    if (error.status === 409) {
      return error.message && error.message !== 'Conflict'
        ? error.message
        : '当前操作条件不满足，请核对最新内容后重试。';
    }
  }
  return communityRequestErrorMessage(error, fallback);
}

export function safeDownloadFilename(filename: string): string {
  const cleaned = filename.replace(/[\\/\u0000-\u001f\u007f]/g, '_').trim();
  return (cleaned || '下载文件').slice(0, 180);
}

export function downloadPrivateBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = safeDownloadFilename(filename);
  anchor.hidden = true;
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    globalThis.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
}

export function fileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '未知大小';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
