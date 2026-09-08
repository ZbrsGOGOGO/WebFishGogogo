import { createHash } from 'node:crypto';
import { hashRoomPassword, normalizeRoomPassword, roomPasswordFingerprint, verifyRoomPassword } from './room-password';

describe('shared room password cryptography', () => {
  const originalEnv = { ...process.env };
  beforeEach(() => { process.env.AUTH_TOKEN_PEPPER = 'room-password-tests-have-an-independent-pepper'; });
  afterEach(() => { process.env = { ...originalEnv }; });
  it('normalizes Unicode without trimming and checks code points, empty and controls', () => {
    expect(normalizeRoomPassword(undefined)).toBeNull(); expect(normalizeRoomPassword('')).toBeNull();
    expect(normalizeRoomPassword('e\u0301abc')).toBe('éabc'); expect(normalizeRoomPassword(' ab ')).toBe(' ab ');
    expect(normalizeRoomPassword('😀'.repeat(64))).toBe('😀'.repeat(64));
    for (const value of [null, 1234, {}, 'abc', '😀'.repeat(65), 'abc\n', 'abc\u0085', 'abc\uD800']) {
      expect(() => normalizeRoomPassword(value)).toThrow();
    }
  });
  it('uses a peppered intent digest rather than a plain SHA password oracle', () => {
    const fingerprint = roomPasswordFingerprint('1234');
    expect(fingerprint).not.toBe(createHash('sha256').update('1234').digest('hex'));
    expect(roomPasswordFingerprint(null)).not.toBe(roomPasswordFingerprint('none'));
    process.env.AUTH_TOKEN_PEPPER = 'a-different-independent-room-password-pepper';
    expect(roomPasswordFingerprint('1234')).not.toBe(fingerprint);
  });
  it('salts verifiers and distinguishes secrets with the same first 72 UTF-8 bytes', async () => {
    const password = '密'.repeat(30) + 'A'; const changed = '密'.repeat(30) + 'B';
    const first = await hashRoomPassword(password); const second = await hashRoomPassword(password);
    expect(first).not.toBe(second); expect(first).not.toContain(password);
    expect(await verifyRoomPassword(password, first)).toBe(true);
    expect(await verifyRoomPassword(changed, first)).toBe(false);
    expect(await verifyRoomPassword(null, first)).toBe(false);
    expect(await hashRoomPassword(null)).toBeNull(); expect(await verifyRoomPassword(null, null)).toBe(true);
    expect(await verifyRoomPassword(password, 'unrecognized-format')).toBe(false);
  });
  it('fails closed in production when the authentication pepper is missing', () => {
    process.env.NODE_ENV = 'production'; delete process.env.AUTH_TOKEN_PEPPER;
    expect(() => roomPasswordFingerprint('1234')).toThrow();
  });
});
