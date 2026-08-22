import type { SaveCommunityPostPayload } from '../../api/community';

export interface CommunityPostValidationErrors {
  title?: string;
  body?: string;
  tags?: string;
}

function textLength(value: string): number {
  return Array.from(value.trim()).length;
}

export function parseCommunityTags(value: string): string[] {
  return Array.from(new Set(
    value
      .split(/[,，]/)
      .map((tag) => tag.trim())
      .filter(Boolean),
  ));
}

export function validateCommunityPost(
  payload: SaveCommunityPostPayload,
): CommunityPostValidationErrors {
  const errors: CommunityPostValidationErrors = {};
  const titleLength = textLength(payload.title);
  const bodyLength = textLength(payload.body);
  if (titleLength < 5 || titleLength > 80) errors.title = '标题需为 5～80 个字符';
  if (bodyLength < 20 || bodyLength > 20_000) errors.body = '正文需为 20～20000 个字符';
  if (payload.bodyFormat === 'restricted_markdown') {
    if (/!\[[^\]]*\]\s*\(/.test(payload.body)) errors.body = '首版不支持 Markdown 图片，请删除图片语法';
    if (/<\/?[a-z][^>]*>/i.test(payload.body)) errors.body = '受限 Markdown 不允许 HTML 标签';
  }
  if (payload.tags.length > 5) errors.tags = '最多添加 5 个标签';
  if (payload.tags.some((tag) => textLength(tag) < 1 || textLength(tag) > 20)) {
    errors.tags = '每个标签需为 1～20 个字符';
  }
  return errors;
}

export function communityContentLinkWarnings(body: string): string[] {
  const warnings: string[] = [];
  if (/https?:\/\/|www\./i.test(body)) {
    warnings.push('正文包含站外链接，可能进入人工审核；首版不会生成链接预览。');
  }
  if (/https?:\/\/(?:\d{1,3}\.){3}\d{1,3}/i.test(body) || /xn--/i.test(body)) {
    warnings.push('检测到较难辨认的链接形式，请确认目标可靠且与内容直接相关。');
  }
  return warnings;
}

export function validateCommunityComment(body: string): string | undefined {
  const length = textLength(body);
  if (length < 2 || length > 5_000) return '评论需为 2～5000 个字符';
  if (/<\/?[a-z][^>]*>/i.test(body)) return '评论不允许 HTML 标签';
  if (/!\[[^\]]*\]\s*\(/.test(body)) return '评论不支持图片语法';
  return undefined;
}
