import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';

import {
  normalizeEmail,
  objectBody,
  validateLoginPassword,
  validateNewPassword,
} from './dto/auth-validation';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_.:-]{0,63}$/;

export interface SocialVerificationCallbackInput {
  sessionId: string;
  providerReference: string;
  status: 'verified' | 'failed';
  occurredAt: Date;
  resultCode: string | null;
}

export function assertFeatureEnabled(name:
  | 'FEATURE_PASSWORD_RESET_ENABLED'
  | 'FEATURE_SOCIAL_VERIFICATION_ENABLED'
  | 'FEATURE_ACCOUNT_DELETION_ENABLED',
): void {
  if (process.env[name] !== 'true') {
    throw new ServiceUnavailableException({ code: 'FEATURE_NOT_AVAILABLE' });
  }
}

export function parsePasswordResetRequest(body: unknown): { email: string } {
  const raw = strictObject(body, ['email']);
  return { email: normalizeEmail(raw.email) };
}

export function parsePasswordReset(body: unknown): {
  token: string;
  newPassword: string;
} {
  const raw = strictObject(body, ['token', 'newPassword']);
  if (
    typeof raw.token !== 'string' ||
    raw.token.length > 200 ||
    !/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{32,100}$/i.test(raw.token)
  ) {
    throw new BadRequestException({ code: 'PASSWORD_RESET_TOKEN_INVALID' });
  }
  return {
    token: raw.token,
    newPassword: validateNewPassword(raw.newPassword, ''),
  };
}

export function parsePasswordChange(body: unknown): {
  currentPassword: string;
  newPassword: string;
} {
  const raw = strictObject(body, ['currentPassword', 'newPassword']);
  return {
    currentPassword: validateLoginPassword(raw.currentPassword),
    // The service repeats this validation with the account identifier so a new
    // password cannot equal the username or email either.
    newPassword: validateNewPassword(raw.newPassword, ''),
  };
}

export function parseVerificationSessionRequest(body: unknown): void {
  const raw = strictObject(body, ['returnPath']);
  if (raw.returnPath !== '/settings/verification') {
    throw new BadRequestException({ code: 'VERIFICATION_RETURN_PATH_INVALID' });
  }
}

export function parseSocialVerificationCallback(
  body: unknown,
): SocialVerificationCallbackInput {
  const raw = strictObject(body, [
    'sessionId',
    'providerReference',
    'status',
    'occurredAt',
    'resultCode',
  ]);
  if (typeof raw.sessionId !== 'string' || !UUID_PATTERN.test(raw.sessionId)) {
    throw new BadRequestException({ code: 'VERIFICATION_CALLBACK_INVALID' });
  }
  if (
    typeof raw.providerReference !== 'string' ||
    raw.providerReference.length < 8 ||
    raw.providerReference.length > 256 ||
    /[\u0000-\u001f]/.test(raw.providerReference)
  ) {
    throw new BadRequestException({ code: 'VERIFICATION_CALLBACK_INVALID' });
  }
  if (raw.status !== 'verified' && raw.status !== 'failed') {
    throw new BadRequestException({ code: 'VERIFICATION_CALLBACK_INVALID' });
  }
  if (typeof raw.occurredAt !== 'string') {
    throw new BadRequestException({ code: 'VERIFICATION_CALLBACK_INVALID' });
  }
  const occurredAt = new Date(raw.occurredAt);
  if (!Number.isFinite(occurredAt.getTime())) {
    throw new BadRequestException({ code: 'VERIFICATION_CALLBACK_INVALID' });
  }
  const resultCode =
    raw.resultCode === undefined || raw.resultCode === null
      ? null
      : safeCode(raw.resultCode, 'VERIFICATION_CALLBACK_INVALID');
  return {
    sessionId: raw.sessionId.toLowerCase(),
    providerReference: raw.providerReference,
    status: raw.status,
    occurredAt,
    resultCode,
  };
}

export function parseDeletionConfirmation(body: unknown): void {
  const raw = strictObject(body, ['confirmation']);
  if (raw.confirmation !== 'DELETE') {
    throw new BadRequestException({ code: 'ACCOUNT_DELETION_CONFIRMATION_REQUIRED' });
  }
}

export function parseAppealReason(body: unknown): string {
  const raw = strictObject(body, ['reason']);
  return boundedText(raw.reason, 20, 1_000, 'ACCOUNT_APPEAL_REASON_INVALID');
}

export function parseAppealDecision(body: unknown): {
  decision: 'approved' | 'rejected';
  reason: string;
} {
  const raw = strictObject(body, ['decision', 'reason']);
  if (raw.decision !== 'approved' && raw.decision !== 'rejected') {
    throw new BadRequestException({ code: 'ACCOUNT_APPEAL_DECISION_INVALID' });
  }
  return {
    decision: raw.decision,
    reason: boundedText(raw.reason, 2, 500, 'ACCOUNT_APPEAL_DECISION_INVALID'),
  };
}

export function safeHeader(
  value: unknown,
  code: string,
  minimum: number,
  maximum: number,
): string {
  const header = Array.isArray(value) ? value[0] : value;
  if (
    typeof header !== 'string' ||
    header.length < minimum ||
    header.length > maximum ||
    /[\u0000-\u0020\u007f]/.test(header)
  ) {
    throw new BadRequestException({ code });
  }
  return header;
}

function strictObject(
  value: unknown,
  allowed: readonly string[],
): Record<string, unknown> {
  const raw = objectBody(value);
  if (Object.keys(raw).some((key) => !allowed.includes(key))) {
    throw new BadRequestException({ code: 'REQUEST_FIELDS_INVALID' });
  }
  return raw;
}

function boundedText(
  value: unknown,
  minimum: number,
  maximum: number,
  code: string,
): string {
  if (typeof value !== 'string') throw new BadRequestException({ code });
  const normalized = value.trim().normalize('NFC');
  const length = [...normalized].length;
  if (
    length < minimum ||
    length > maximum ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(normalized)
  ) {
    throw new BadRequestException({ code });
  }
  return normalized;
}

function safeCode(value: unknown, errorCode: string): string {
  if (typeof value !== 'string' || !SAFE_CODE_PATTERN.test(value)) {
    throw new BadRequestException({ code: errorCode });
  }
  return value;
}
