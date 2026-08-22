import {
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
} from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';

export function hashBetaAccessCode(code: string): string {
  return keyedHash(`beta-access:${normalizeBetaAccessCode(code)}`);
}

export function normalizeBetaAccessCode(code: string): string {
  return code.trim().toUpperCase();
}

export function generateEmailVerificationCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function hashEmailVerificationCode(
  verificationId: string,
  code: string,
): string {
  return keyedHash(`email-verification:${verificationId}:${code}`);
}

export interface GeneratedRefreshToken {
  id: string;
  raw: string;
  hash: string;
}

export function generateRefreshToken(): GeneratedRefreshToken {
  const id = randomUUID();
  const secret = randomBytes(32).toString('base64url');
  const raw = `${id}.${secret}`;
  return { id, raw, hash: hashRefreshToken(raw) };
}

export function hashRefreshToken(raw: string): string {
  return keyedHash(`refresh:${raw}`);
}

export interface GeneratedPasswordResetToken {
  id: string;
  raw: string;
  hash: string;
}

export function generatePasswordResetToken(): GeneratedPasswordResetToken {
  const id = randomUUID();
  const secret = randomBytes(32).toString('base64url');
  const raw = `${id}.${secret}`;
  return { id, raw, hash: hashPasswordResetToken(raw) };
}

export function hashPasswordResetToken(raw: string): string {
  return keyedHash(`password-reset:${raw}`);
}

export function hashIpAddress(ipAddress: string | null | undefined): string | null {
  const normalized = ipAddress?.trim();
  return normalized ? keyedHash(`ip:${normalized}`) : null;
}

/** HMACs an auth-abuse dimension without persisting its raw value. */
export function hashAuthRateLimitKey(scope: string, value: string): string {
  return keyedHash(`rate-limit:${scope}:${value}`);
}

/** HMACs sensitive auth metadata that is useful only for correlation. */
export function hashAuthMetadata(namespace: string, value: string): string {
  return keyedHash(`metadata:${namespace}:${value}`);
}

function keyedHash(value: string): string {
  const configured = process.env.AUTH_TOKEN_PEPPER;
  if (
    process.env.NODE_ENV === 'production' &&
    (!configured || Buffer.byteLength(configured, 'utf8') < 32)
  ) {
    throw new ServiceUnavailableException({
      code: 'AUTH_TOKEN_PEPPER_NOT_CONFIGURED',
    });
  }
  const pepper = configured ?? 'local-development-auth-pepper';
  return createHmac('sha256', pepper).update(value).digest('hex');
}
