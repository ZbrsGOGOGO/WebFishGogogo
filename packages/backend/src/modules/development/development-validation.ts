import { BadRequestException } from '@nestjs/common';

import {
  DEVELOPMENT_CATEGORIES,
  DEVELOPMENT_CHECK_STATES,
  DEVELOPMENT_LIMITS,
  DEVELOPMENT_STATUSES,
  type DevelopmentCategory,
  type DevelopmentCreateInput,
  type DevelopmentStatus,
  type DevelopmentProgressInput,
  type DevelopmentCheckState,
} from '@stealth-reader/shared';

import { normalizeUsername } from '../auth/dto/auth-validation';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLIENT_ID_PATTERN = /^[A-Za-z0-9._:-]{8,100}$/;

export function developmentCreateInput(body: unknown): DevelopmentCreateInput {
  const value = strictObject(body, [
    'clientRequestId',
    'title',
    'category',
    'description',
  ]);
  const clientRequestId = text(value.clientRequestId, 'clientRequestId', 100);
  if (!CLIENT_ID_PATTERN.test(clientRequestId)) {
    throw invalid('clientRequestId');
  }
  return {
    clientRequestId,
    title: text(value.title, 'title', DEVELOPMENT_LIMITS.titleChars),
    category: developmentCategory(value.category),
    description: text(
      value.description,
      'description',
      DEVELOPMENT_LIMITS.descriptionChars,
    ),
  };
}

export function developmentCommentInput(body: unknown): {
  body: string;
  expectedVersion: number;
} {
  const value = strictObject(body, ['body', 'expectedVersion']);
  return {
    body: text(value.body, 'body', DEVELOPMENT_LIMITS.commentChars),
    expectedVersion: developmentVersion(value.expectedVersion),
  };
}

export function developmentDecisionInput(body: unknown): {
  status: DevelopmentStatus;
  note: string;
  expectedVersion: number;
} {
  const value = strictObject(body, ['status', 'note', 'expectedVersion']);
  return {
    status: developmentStatus(value.status),
    note: text(value.note, 'note', DEVELOPMENT_LIMITS.commentChars),
    expectedVersion: developmentVersion(value.expectedVersion),
  };
}

export function developmentMemberInput(body: unknown): { username: string } {
  const value = strictObject(body, ['username']);
  return { username: normalizeUsername(value.username) };
}

export function developmentProgressInput(body: unknown): DevelopmentProgressInput {
  const value = strictObject(body, ['expectedVersion', 'summary', 'items']);
  if (!Array.isArray(value.items) || value.items.length < 1 || value.items.length > 40) throw invalid('items');
  const items = value.items.map((raw) => {
    const item = strictObject(raw, ['id', 'label', 'status']);
    if (typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(item.id)) throw invalid('item.id');
    if (!DEVELOPMENT_CHECK_STATES.includes(item.status as DevelopmentCheckState)) throw invalid('item.status');
    return { id: item.id, label: text(item.label, 'item.label', 160), status: item.status as DevelopmentCheckState };
  });
  if (new Set(items.map((item) => item.id)).size !== items.length) throw invalid('items');
  return { expectedVersion: developmentVersion(value.expectedVersion), summary: text(value.summary, 'summary', 1200), items };
}

export function developmentVersion(value: unknown): number {
  const parsed = typeof value === 'string' && value.trim() !== ''
    ? Number(value)
    : value;
  if (!Number.isSafeInteger(parsed) || Number(parsed) < 1) {
    throw invalid('expectedVersion');
  }
  return Number(parsed);
}

export function developmentStatus(value: unknown): DevelopmentStatus {
  if (
    typeof value !== 'string' ||
    !DEVELOPMENT_STATUSES.includes(value as DevelopmentStatus)
  ) {
    throw invalid('status');
  }
  return value as DevelopmentStatus;
}

export function optionalDevelopmentStatus(
  value: unknown,
): DevelopmentStatus | undefined {
  if (value === undefined || value === '') return undefined;
  return developmentStatus(value);
}

export function developmentPage(value: unknown): number {
  if (value === undefined || value === '') return 1;
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (!Number.isSafeInteger(parsed) || Number(parsed) < 1 || Number(parsed) > 10_000) {
    throw invalid('page');
  }
  return Number(parsed);
}

export function developmentId(value: unknown, field = 'requestId'): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw invalid(field);
  }
  return value.toLowerCase();
}

function developmentCategory(value: unknown): DevelopmentCategory {
  if (
    typeof value !== 'string' ||
    !DEVELOPMENT_CATEGORIES.includes(value as DevelopmentCategory)
  ) {
    throw invalid('category');
  }
  return value as DevelopmentCategory;
}

function strictObject(
  value: unknown,
  allowed: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException({ code: 'DEVELOPMENT_INPUT_INVALID' });
  }
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some((key) => !allowed.includes(key))) {
    throw new BadRequestException({ code: 'DEVELOPMENT_INPUT_INVALID' });
  }
  return result;
}

function text(value: unknown, field: string, maximum: number): string {
  if (typeof value !== 'string') throw invalid(field);
  const normalized = value.trim().normalize('NFC');
  const length = [...normalized].length;
  if (length < 1 || length > maximum || /\u0000/.test(normalized)) {
    throw invalid(field);
  }
  return normalized;
}

function invalid(field: string): BadRequestException {
  return new BadRequestException({
    code: 'DEVELOPMENT_INPUT_INVALID',
    field,
  });
}
