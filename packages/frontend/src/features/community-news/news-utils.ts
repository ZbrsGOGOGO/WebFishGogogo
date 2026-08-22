import type {
  CommunityNewsProfession,
  CommunityNewsRevisionInput,
} from '../../api/community';

export const COMMUNITY_NEWS_PROFESSION_LABELS: Record<
  CommunityNewsProfession,
  string
> = {
  developer: '程序员',
  product: '产品经理',
  qa: '测试',
  sales: '销售',
  hr: '人力资源',
};

export function communityNewsHttpsUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      !url.hostname ||
      url.hostname === 'localhost' ||
      /^\d{1,3}(?:\.\d{1,3}){3}$/.test(url.hostname)
    ) {
      return null;
    }
    for (const key of url.searchParams.keys()) {
      if (/^(?:access_?token|api_?key|auth|authorization|password|secret|signature|sig)$/i.test(key)) {
        return null;
      }
    }
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

export function parseCommunityNewsTopics(value: string): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const raw of value.split(/[，,\s]+/u)) {
    const topic = raw.normalize('NFC').trim().toLocaleLowerCase('zh-CN');
    if (topic && !seen.has(topic)) {
      seen.add(topic);
      result.push(topic);
    }
  }
  return result;
}

export function communityNewsTopicsError(
  topics: string[],
  maximum: number,
): string | null {
  if (topics.length > maximum) return `最多填写 ${maximum} 个主题`;
  if (topics.some((topic) => Array.from(topic).length > 30 || !/^[\p{L}\p{N}_-]+$/u.test(topic))) {
    return '主题只能包含中英文、数字、下划线或短横线，每项最多 30 个字符';
  }
  return null;
}

export interface CommunityNewsRevisionErrors {
  sourceId?: string;
  originalTitle?: string;
  summary?: string;
  originalUrl?: string;
  originalPublishedAt?: string;
  professionTags?: string;
  topicTags?: string;
  correctionNote?: string;
}

export function validateCommunityNewsRevision(
  payload: CommunityNewsRevisionInput,
): CommunityNewsRevisionErrors {
  const errors: CommunityNewsRevisionErrors = {};
  const titleLength = Array.from(payload.originalTitle).length;
  const summaryLength = Array.from(payload.summary).length;
  const correctionLength = payload.correctionNote
    ? Array.from(payload.correctionNote).length
    : 0;
  if (!payload.sourceId) errors.sourceId = '请选择已核验来源';
  if (titleLength < 2 || titleLength > 300) errors.originalTitle = '原文标题需为 2—300 个字符';
  if (summaryLength < 50 || summaryLength > 300) errors.summary = '原创摘要需为 50—300 个字符';
  if (/<\/?[a-z][^>]*>|!\[[^\]]*\]\s*\(|(?:javascript|data|file):/i.test(payload.summary)) {
    errors.summary = '摘要不能包含 HTML、Markdown 图片或危险链接协议';
  }
  if (!communityNewsHttpsUrl(payload.originalUrl)) errors.originalUrl = '原文地址必须是公开 HTTPS 链接';
  const publishedAt = new Date(payload.originalPublishedAt);
  if (!Number.isFinite(publishedAt.getTime())) {
    errors.originalPublishedAt = '请选择原文发布时间';
  } else if (publishedAt.getTime() > Date.now() + 5 * 60_000) {
    errors.originalPublishedAt = '原文发布时间不能晚于当前时间';
  }
  if (payload.professionTags.length > 5) errors.professionTags = '职业标签最多 5 个';
  const topicError = communityNewsTopicsError(payload.topicTags, 8);
  if (topicError) errors.topicTags = topicError;
  if (payload.correctionNote && (correctionLength < 5 || correctionLength > 500)) {
    errors.correctionNote = '更正说明需为 5—500 个字符，或留空';
  }
  return errors;
}

export function communityNewsDateTimeLocal(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function communityNewsDateTimeIso(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : value;
}
