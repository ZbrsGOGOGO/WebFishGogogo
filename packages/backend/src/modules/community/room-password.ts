import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { DataSource } from 'typeorm';
import { hashAuthMetadata } from '../auth/auth-crypto';
import { AuthRateLimitService } from '../auth/auth-rate-limit.service';

/** Normalize once for hashing, verification and idempotency. Never trim a secret. */
export function normalizeRoomPassword(raw: unknown): string | null {
  if (raw === undefined || raw === '') return null;
  if (typeof raw !== 'string' || raw.length > 256 || /[\p{Cc}\uD800-\uDFFF]/u.test(raw)) throw invalidPassword();
  const password = raw.normalize('NFC');
  const length = Array.from(password).length;
  if (length < 4 || length > 64) throw invalidPassword();
  return password;
}

/** A keyed intent digest cannot become an offline dictionary oracle after a DB leak. */
export function roomPasswordFingerprint(password: string | null): string {
  return hashAuthMetadata('room-password-intent-v1', password === null ? 'none' : `value:${password}`);
}

function prehash(password: string): string {
  // Fixed 64 ASCII bytes, so long Unicode passwords never hit bcrypt's 72-byte truncation.
  return hashAuthMetadata('room-password-verifier-v1', password);
}

export async function hashRoomPassword(password: string | null): Promise<string | null> {
  return password === null ? null : `rp1$${await bcrypt.hash(prehash(password), 12)}`;
}

export async function verifyRoomPassword(password: string | null, stored: string | null): Promise<boolean> {
  if (stored === null) return true;
  if (password === null || !/^rp1\$\$2[aby]\$\d{2}\$.{53}$/.test(stored)) return false;
  return bcrypt.compare(prehash(password), stored.slice(4));
}

/**
 * Consume BEFORE verification and OUTSIDE the rejected join transaction.
 * These keyed PostgreSQL buckets survive wrong-password errors and API replicas.
 * No room-wide bucket: an attacker must not lock every other colleague out.
 */
export async function consumeRoomPasswordAttempt(db: DataSource, module: 'play' | 'rail', userId: string, roomId: string, now = new Date()): Promise<void> {
  await new AuthRateLimitService(db).consume([
    { scope: `room-password:${module}:user`, dimension: userId, limit: 30, windowMs: 600_000, blockMs: 600_000 },
    { scope: `room-password:${module}:room-user`, dimension: `${roomId}:${userId}`, limit: 5, windowMs: 600_000, blockMs: 600_000 },
  ], now);
}

/** Separate owner-mutation CPU budget; clearing also counts, and never spends a guest's join budget. */
export async function consumeRoomPasswordMutation(db: DataSource, module: 'play' | 'rail', userId: string, roomId: string, now = new Date()): Promise<void> {
  await new AuthRateLimitService(db).consume([
    { scope: `room-password-mutation:${module}:user`, dimension: userId, limit: 20, windowMs: 600_000, blockMs: 600_000 },
    { scope: `room-password-mutation:${module}:room-user`, dimension: `${roomId}:${userId}`, limit: 10, windowMs: 600_000, blockMs: 600_000 },
  ], now);
}

function invalidPassword(): BadRequestException {
  return new BadRequestException({ code: 'ROOM_PASSWORD_INVALID', message: '房间密码须为 4–64 个字符，不含控制字符；留空表示无需密码。' });
}
