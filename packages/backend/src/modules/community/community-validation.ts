import { createHash, randomBytes } from 'node:crypto';

import { BadRequestException } from '@nestjs/common';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function publicId(value: unknown, field = 'publicId'): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value.trim())) {
    throw new BadRequestException(`${field} 格式不合法`);
  }
  return value.trim().toLowerCase();
}

export function idempotencyKey(value: unknown): string {
  if (typeof value !== 'string') {
    throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
  }
  const key = value.trim();
  if (key.length < 8 || key.length > 100 || /[\u0000-\u001f]/.test(key)) {
    throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_INVALID' });
  }
  return key;
}

export function requiredObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('请求体必须为对象');
  }
  return value as Record<string, unknown>;
}

export function requestHash(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

export function opaqueSecret(prefix: string, bytes = 24): string {
  return `${prefix}${randomBytes(bytes).toString('base64url')}`;
}

export function secretHash(scope: string, value: string): string {
  return createHash('sha256').update(`${scope}:${value}`).digest('hex');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
