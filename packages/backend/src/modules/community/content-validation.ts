import { createHash } from 'node:crypto';

import { BadRequestException } from '@nestjs/common';

import type {
  CommunityPostChannel,
  CommunityPostType,
} from '../../database/entities/community-post.entity';
import type { ContentReportReason } from '../../database/entities/content-report.entity';

export const CONTENT_CHANNELS: readonly CommunityPostChannel[] = [
  'general',
  'developer',
  'product-manager',
  'qa',
  'sales',
  'human-resources',
  'questions',
  'retrospectives',
  'tools',
];
export const CONTENT_TYPES: readonly CommunityPostType[] = [
  'experience',
  'question',
  'retrospective',
];
export const REPORT_REASONS: readonly ContentReportReason[] = [
  'illegal',
  'harassment',
  'spam',
  'misinformation',
  'privacy',
  'other',
];

export interface SavePostInput {
  type: CommunityPostType;
  channel: CommunityPostChannel;
  title: string;
  body: string;
  tags: string[];
  bodyFormat: 'plain_text' | 'restricted_markdown';
}

export type ContentRiskLevel = 'low' | 'medium' | 'high' | 'critical';

const HTML_PATTERN = /<\/?[a-z][^>]*>/i;
const IMAGE_PATTERN = /!\[[^\]]*\]\s*\(/i;
const LINK_PATTERN = /(?:https?:\/\/|www\.)\S+/gi;
const DANGEROUS_SCHEME_PATTERN = /(?:javascript|data|file):/i;
const HIGH_RISK_PATTERN = /(身份证号|银行卡密码|裸照|枪支交易|毒品交易|诈骗收款)/i;

export function parseSavePostInput(value: unknown): SavePostInput {
  const body = strictObject(value, [
    'type',
    'channel',
    'title',
    'body',
    'tags',
    'bodyFormat',
    'expectedVersion',
  ]);
  if (!CONTENT_TYPES.includes(body.type as CommunityPostType)) {
    throw invalid('type');
  }
  if (!CONTENT_CHANNELS.includes(body.channel as CommunityPostChannel)) {
    throw invalid('channel');
  }
  if (body.bodyFormat !== 'plain_text' && body.bodyFormat !== 'restricted_markdown') {
    throw invalid('bodyFormat');
  }
  const title = boundedText(body.title, 'title', 5, 80);
  const content = boundedText(body.body, 'body', 20, 20_000);
  validateSafeText(content, 'body');
  if (!Array.isArray(body.tags) || body.tags.length > 5) throw invalid('tags');
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of body.tags) {
    const tag = boundedText(raw, 'tags', 1, 20);
    if (/[,，#\u0000-\u001f]/.test(tag)) throw invalid('tags');
    const key = tag.toLocaleLowerCase('zh-CN');
    if (!seen.has(key)) {
      seen.add(key);
      tags.push(tag);
    }
  }
  return {
    type: body.type as CommunityPostType,
    channel: body.channel as CommunityPostChannel,
    title,
    body: content,
    tags,
    bodyFormat: body.bodyFormat,
  };
}

export function parseCommentBody(value: unknown): string {
  const body = strictObject(value, ['body', 'parentCommentId', 'expectedVersion']);
  const content = boundedText(body.body, 'body', 2, 5_000);
  validateSafeText(content, 'body');
  return content;
}

export function parseReportInput(value: unknown): {
  reason: ContentReportReason;
  details: string;
} {
  const body = strictObject(value, ['reason', 'details']);
  if (!REPORT_REASONS.includes(body.reason as ContentReportReason)) {
    throw invalid('reason');
  }
  const details =
    body.details === undefined || body.details === null || body.details === ''
      ? ''
      : boundedText(body.details, 'details', 2, 1_000);
  validateSafeText(details, 'details');
  return { reason: body.reason as ContentReportReason, details };
}

export function assessContentRisk(text: string): ContentRiskLevel {
  if (HIGH_RISK_PATTERN.test(text)) return 'high';
  const links = text.match(LINK_PATTERN) ?? [];
  if (
    DANGEROUS_SCHEME_PATTERN.test(text) ||
    /https?:\/\/(?:\d{1,3}\.){3}\d{1,3}/i.test(text) ||
    /xn--/i.test(text)
  ) {
    return 'high';
  }
  return links.length > 0 ? 'medium' : 'low';
}

export function lowRiskAutoPublishEnabled(risk: ContentRiskLevel): boolean {
  // This release has no moderation-provider integration. Production therefore
  // always queues content for a human decision; merely configuring a URL or a
  // token must never be treated as an approval signal.
  return (
    process.env.LOCAL_DEV === 'true' &&
    risk === 'low' &&
    process.env.CONTENT_MODERATION_STAFFED === 'true' &&
    process.env.CONTENT_LOW_RISK_AUTO_PUBLISH_ENABLED === 'true'
  );
}

export function contentHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function searchDocument(input: SavePostInput): string {
  return [input.title, input.body, ...input.tags].join('\n').normalize('NFKC');
}

export function expectedVersion(
  rawIfMatch: unknown,
  bodyVersion?: unknown,
): number {
  const raw = Array.isArray(rawIfMatch) ? rawIfMatch[0] : rawIfMatch;
  if (typeof raw !== 'string' || !/^"[1-9]\d*"$/.test(raw.trim())) {
    throw new BadRequestException({ code: 'IF_MATCH_REQUIRED' });
  }
  const parsed = Number(raw.trim().slice(1, -1));
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw invalid('expectedVersion');
  if (bodyVersion !== undefined && bodyVersion !== parsed) {
    throw new BadRequestException({ code: 'EXPECTED_VERSION_MISMATCH' });
  }
  return parsed;
}

export function strictObject(
  value: unknown,
  allowedKeys: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException({ code: 'INVALID_REQUEST_BODY' });
  }
  const object = value as Record<string, unknown>;
  if (Object.keys(object).some((key) => !allowedKeys.includes(key))) {
    throw new BadRequestException({ code: 'UNSUPPORTED_CONTENT_FIELD' });
  }
  return object;
}

export function normalizeSearchQuery(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw invalid('q');
  const query = value.trim().normalize('NFKC');
  if ([...query].length < 2 || [...query].length > 100) throw invalid('q');
  return query;
}

function validateSafeText(value: string, field: string): void {
  if (HTML_PATTERN.test(value) || IMAGE_PATTERN.test(value)) {
    throw new BadRequestException({ code: 'UNSUPPORTED_CONTENT', field });
  }
  if (DANGEROUS_SCHEME_PATTERN.test(value)) {
    throw new BadRequestException({ code: 'UNSAFE_LINK', field });
  }
  const links = value.match(LINK_PATTERN) ?? [];
  if (links.length > 5 || links.some((link) => link.length > 500)) {
    throw new BadRequestException({ code: 'TOO_MANY_OR_LONG_LINKS', field });
  }
}

function boundedText(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): string {
  if (typeof value !== 'string') throw invalid(field);
  const normalized = value.trim().normalize('NFC');
  const length = [...normalized].length;
  if (length < minimum || length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(normalized)) {
    throw invalid(field);
  }
  return normalized;
}

function invalid(field: string): BadRequestException {
  return new BadRequestException({ code: 'CONTENT_VALIDATION_FAILED', field });
}
