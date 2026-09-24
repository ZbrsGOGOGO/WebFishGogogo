import type {
  DevelopmentCategory,
  DevelopmentEvent,
  DevelopmentPerson,
  DevelopmentReviewSummary,
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

export function developmentStatusColor(status: DevelopmentStatus, review?: DevelopmentReviewSummary): TagColor {
  if (status === 'done' && review?.closure === 'owner_closed') return 'neutral';
  if (status === 'done' || status === 'accepted') return 'success';
  if (status === 'rejected') return 'danger';
  if (status === 'submitted' || status === 'needs_info') return 'brand';
  return 'neutral';
}

export function developmentStatusLabel(status: DevelopmentStatus, review?: DevelopmentReviewSummary): string {
  if (status === 'done' && review?.closure === 'owner_closed') return '已归档';
  if (status === 'done' && review?.closure === 'verified_release') return '已验收上线';
  return DEVELOPMENT_STATUS_LABELS[status];
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
    if (code === 'DEVELOPMENT_EXPORT_LIMIT') return '当前筛选超过 200 条，请按状态分别导出；没有生成不完整文件。';
    if (code === 'DEVELOPMENT_AI_DAILY_LIMIT') return '今天的站内免费 AI 次数已经用完，请明天再试。';
    if (code === 'DEVELOPMENT_AI_FREE_LIMIT') return 'Groq 免费额度暂时已满，请稍后再试；本站不会切换到付费模型。';
    if (code === 'DEVELOPMENT_AI_NOT_CONFIGURED') return '免费 AI 尚未启用，请联系站长完成免费密钥配置。';
    if (code === 'DEVELOPMENT_AI_PROVIDER_UNAVAILABLE' || code === 'DEVELOPMENT_AI_INVALID_RESPONSE') {
      return 'Groq 免费服务暂时不可用，请稍后再试。';
    }
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
