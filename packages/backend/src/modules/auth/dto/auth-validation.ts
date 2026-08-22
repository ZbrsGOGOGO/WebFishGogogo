import { BadRequestException } from '@nestjs/common';

const EMAIL_PATTERN = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i;
const VERSION_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const COMMON_WEAK_PASSWORDS = new Set([
  '1234567890',
  '123456789a',
  'password123',
  'qwerty12345',
  'admin12345',
  'iloveyou123',
]);

export function objectBody(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new BadRequestException('请求体必须为对象');
  }
  return body as Record<string, unknown>;
}

export function requiredString(
  value: unknown,
  field: string,
  maximum: number,
): string {
  if (typeof value !== 'string') {
    throw new BadRequestException(`${field} 必须为字符串`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) {
    throw new BadRequestException(`${field} 长度不合法`);
  }
  return normalized;
}

export function normalizeEmail(value: unknown): string {
  const email = requiredString(value, 'email', 254).normalize('NFC').toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    throw new BadRequestException('email 格式不正确');
  }
  return email;
}

export function validateNewPassword(value: unknown, email: string): string {
  if (typeof value !== 'string') {
    throw new BadRequestException('password 必须为字符串');
  }
  const characterLength = [...value].length;
  const byteLength = Buffer.byteLength(value, 'utf8');
  if (characterLength < 10 || characterLength > 64 || byteLength > 72) {
    throw new BadRequestException(
      'password 必须为 10～64 个字符，且 UTF-8 编码不超过 72 字节',
    );
  }
  const lowered = value.toLowerCase();
  const localPart = email.split('@', 1)[0];
  if (
    COMMON_WEAK_PASSWORDS.has(lowered) ||
    lowered === email ||
    (localPart.length >= 6 && lowered === localPart)
  ) {
    throw new BadRequestException('password 过于常见或与邮箱过于相似');
  }
  return value;
}

export function validateLoginPassword(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || Buffer.byteLength(value, 'utf8') > 256) {
    throw new BadRequestException('password 不合法');
  }
  return value;
}

export function validateDisplayName(value: unknown): string {
  const displayName = requiredString(value, 'displayName', 20).normalize('NFC');
  if ([...displayName].length < 2 || [...displayName].length > 20) {
    throw new BadRequestException('displayName 必须为 2～20 个字符');
  }
  return displayName;
}

export function validateVersion(value: unknown, field: string): string {
  const version = requiredString(value, field, 64);
  if (!VERSION_PATTERN.test(version)) {
    throw new BadRequestException(`${field} 格式不合法`);
  }
  return version;
}

export function validateUuid(value: unknown, field: string): string {
  const id = requiredString(value, field, 64);
  if (!UUID_PATTERN.test(id)) {
    throw new BadRequestException(`${field} 格式不合法`);
  }
  return id;
}
