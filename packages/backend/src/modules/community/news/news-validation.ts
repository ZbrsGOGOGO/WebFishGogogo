import { createHash } from 'node:crypto';

import { BadRequestException } from '@nestjs/common';

import type {
  NewsAuthorizationStatus,
  NewsSourceType,
} from '../../../database/entities/news-source.entity';
import type { NewsNegativeFeedbackReason } from '../../../database/entities/news-personalization.entity';

export const NEWS_PROFESSION_TAGS = [
  'developer',
  'product',
  'qa',
  'sales',
  'hr',
] as const;

export interface NewsRevisionInput {
  sourceId: string;
  originalTitle: string;
  summary: string;
  originalUrl: string;
  originalPublishedAt: Date;
  professionTags: string[];
  topicTags: string[];
  correctionNote: string | null;
}

export interface NewsSourceInput {
  name: string;
  sourceType: NewsSourceType;
  homepageUrl: string;
  trustRank: number;
  authorizationStatus: NewsAuthorizationStatus;
  authorizationEvidenceRef: string;
  authorizationValidFrom: Date | null;
  authorizationValidUntil: Date | null;
}

export function strictNewsObject(
  body: unknown,
  allowed: readonly string[],
): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw invalid('INVALID_NEWS_REQUEST');
  }
  const value = body as Record<string, unknown>;
  const extra = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extra.length > 0) throw new BadRequestException({ code: 'UNEXPECTED_NEWS_FIELD', fields: extra.sort() });
  return value;
}

export function parseNewsSourceInput(body: unknown): NewsSourceInput {
  const value = strictNewsObject(body, [
    'name',
    'sourceType',
    'homepageUrl',
    'trustRank',
    'authorizationStatus',
    'authorizationEvidenceRef',
    'authorizationValidFrom',
    'authorizationValidUntil',
    'expectedVersion',
  ]);
  if (!['owned', 'official', 'licensed'].includes(String(value.sourceType))) throw invalid('INVALID_NEWS_SOURCE_TYPE');
  if (!['verified', 'revoked', 'expired'].includes(String(value.authorizationStatus))) {
    throw invalid('INVALID_NEWS_AUTHORIZATION_STATUS');
  }
  if (!Number.isInteger(value.trustRank) || Number(value.trustRank) < 1 || Number(value.trustRank) > 100) {
    throw invalid('INVALID_NEWS_TRUST_RANK');
  }
  const input: NewsSourceInput = {
    name: text(value.name, 2, 120, 'INVALID_NEWS_SOURCE_NAME'),
    sourceType: value.sourceType as NewsSourceType,
    homepageUrl: httpsUrl(value.homepageUrl, 'INVALID_NEWS_SOURCE_URL'),
    trustRank: value.trustRank as number,
    authorizationStatus: value.authorizationStatus as NewsAuthorizationStatus,
    authorizationEvidenceRef: text(value.authorizationEvidenceRef, 3, 200, 'NEWS_AUTHORIZATION_EVIDENCE_REQUIRED'),
    authorizationValidFrom: optionalDate(value.authorizationValidFrom, 'INVALID_NEWS_AUTHORIZATION_DATE'),
    authorizationValidUntil: optionalDate(value.authorizationValidUntil, 'INVALID_NEWS_AUTHORIZATION_DATE'),
  };
  if (
    input.authorizationValidFrom &&
    input.authorizationValidUntil &&
    input.authorizationValidUntil <= input.authorizationValidFrom
  ) {
    throw invalid('INVALID_NEWS_AUTHORIZATION_RANGE');
  }
  if (input.sourceType === 'licensed' && !input.authorizationValidUntil) {
    throw invalid('NEWS_LICENSE_EXPIRY_REQUIRED');
  }
  return input;
}

export function parseNewsRevisionInput(body: unknown): NewsRevisionInput {
  const value = strictNewsObject(body, [
    'sourceId',
    'originalTitle',
    'summary',
    'originalUrl',
    'originalPublishedAt',
    'professionTags',
    'topicTags',
    'correctionNote',
    'expectedVersion',
  ]);
  const publishedAt = requiredDate(value.originalPublishedAt, 'INVALID_ORIGINAL_PUBLISHED_AT');
  if (publishedAt.getTime() > Date.now() + 5 * 60 * 1_000) {
    throw invalid('ORIGINAL_PUBLISHED_AT_IN_FUTURE');
  }
  return {
    sourceId: uuid(value.sourceId, 'sourceId'),
    originalTitle: text(value.originalTitle, 2, 300, 'INVALID_ORIGINAL_TITLE'),
    summary: safeSummary(value.summary),
    originalUrl: httpsUrl(value.originalUrl, 'INVALID_ORIGINAL_URL'),
    originalPublishedAt: publishedAt,
    professionTags: tags(value.professionTags, 'professionTags', 5, NEWS_PROFESSION_TAGS),
    topicTags: tags(value.topicTags, 'topicTags', 8),
    correctionNote:
      value.correctionNote === undefined || value.correctionNote === null || value.correctionNote === ''
        ? null
        : text(value.correctionNote, 5, 500, 'INVALID_CORRECTION_NOTE'),
  };
}

export function newsContentHash(input: NewsRevisionInput): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        sourceId: input.sourceId,
        originalTitle: input.originalTitle,
        summary: input.summary,
        originalUrl: input.originalUrl,
        originalPublishedAt: input.originalPublishedAt.toISOString(),
        professionTags: input.professionTags,
        topicTags: input.topicTags,
        correctionNote: input.correctionNote,
      }),
    )
    .digest('hex');
}

export function newsFeedbackReason(value: unknown): NewsNegativeFeedbackReason {
  if (!['not_interested', 'not_relevant', 'seen_too_often', 'source_not_preferred'].includes(String(value))) {
    throw invalid('INVALID_NEWS_FEEDBACK_REASON');
  }
  return value as NewsNegativeFeedbackReason;
}

export function newsExpectedVersion(value: unknown, allowNull = false): number | null {
  if (allowNull && (value === undefined || value === null)) return null;
  if (!Number.isInteger(value) || Number(value) <= 0) throw invalid('INVALID_EXPECTED_VERSION');
  return value as number;
}

export function newsTopicPreferences(value: unknown): string[] {
  return tags(value, 'topicPreferences', 12);
}

export function uuid(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  ) {
    throw new BadRequestException({ code: 'INVALID_NEWS_ID', field });
  }
  return value.toLowerCase();
}

export function boundedReason(value: unknown, code: string): string {
  return text(value, 5, 500, code);
}

function safeSummary(value: unknown): string {
  const summary = text(value, 50, 300, 'INVALID_NEWS_SUMMARY');
  if (/<\/?[a-z][^>]*>|!\[[^\]]*\]\s*\(|(?:javascript|data|file):/i.test(summary)) {
    throw invalid('INVALID_NEWS_SUMMARY');
  }
  return summary;
}

function tags(
  value: unknown,
  field: string,
  max: number,
  allowlist?: readonly string[],
): string[] {
  if (!Array.isArray(value) || value.length > max) throw invalid(`INVALID_NEWS_${field.toUpperCase()}`);
  const result: string[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    const tag = text(raw, 1, 30, `INVALID_NEWS_${field.toUpperCase()}`).toLocaleLowerCase('zh-CN');
    if (allowlist && !allowlist.includes(tag)) throw invalid(`INVALID_NEWS_${field.toUpperCase()}`);
    if (!/^[\p{L}\p{N}_-]+$/u.test(tag)) throw invalid(`INVALID_NEWS_${field.toUpperCase()}`);
    if (!seen.has(tag)) {
      seen.add(tag);
      result.push(tag);
    }
  }
  return result.sort();
}

function httpsUrl(value: unknown, code: string): string {
  if (typeof value !== 'string' || value.length > 2048) throw invalid(code);
  try {
    const parsed = new URL(value.trim());
    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      !parsed.hostname ||
      parsed.hostname === 'localhost' ||
      /^\d{1,3}(?:\.\d{1,3}){3}$/.test(parsed.hostname)
    ) {
      throw new Error();
    }
    for (const key of parsed.searchParams.keys()) {
      if (/^(?:access_?token|api_?key|auth|authorization|password|secret|signature|sig)$/i.test(key)) {
        throw new Error();
      }
    }
    parsed.hash = '';
    return parsed.toString();
  } catch {
    throw invalid(code);
  }
}

function optionalDate(value: unknown, code: string): Date | null {
  if (value === undefined || value === null || value === '') return null;
  return requiredDate(value, code);
}

function requiredDate(value: unknown, code: string): Date {
  if (typeof value !== 'string') throw invalid(code);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw invalid(code);
  return date;
}

function text(value: unknown, min: number, max: number, code: string): string {
  if (typeof value !== 'string') throw invalid(code);
  const normalized = value.normalize('NFC').trim().replace(/\r\n/g, '\n');
  if (
    normalized.length < min ||
    normalized.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(normalized)
  ) {
    throw invalid(code);
  }
  return normalized;
}

function invalid(code: string): BadRequestException {
  return new BadRequestException({ code });
}
