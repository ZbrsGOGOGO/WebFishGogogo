import { describe, expect, it } from 'vitest';

import {
  communityPasswordByteLength,
  normalizeCommunityEmail,
  validateCommunityDisplayName,
  validateCommunityPassword,
} from './validation';

describe('community registration validation', () => {
  it('normalizes email without changing the submitted password', () => {
    expect(normalizeCommunityEmail('  User@Example.COM ')).toBe('user@example.com');
  });

  it('enforces 10-64 characters and a 72-byte UTF-8 ceiling', () => {
    expect(validateCommunityPassword('short123')).toMatch(/10/);
    expect(validateCommunityPassword('a'.repeat(65))).toMatch(/64/);
    expect(communityPasswordByteLength('中'.repeat(25))).toBe(75);
    expect(validateCommunityPassword(`中${'a'.repeat(9)}`)).toBeUndefined();
    expect(validateCommunityPassword('中'.repeat(25))).toMatch(/72/);
  });

  it('rejects common passwords and nicknames outside 2-20 characters', () => {
    expect(validateCommunityPassword('password123')).toMatch(/常见/);
    expect(validateCommunityDisplayName('Z')).toMatch(/2/);
    expect(validateCommunityDisplayName('同事小张')).toBeUndefined();
    expect(validateCommunityDisplayName('同'.repeat(21))).toMatch(/20/);
  });
});

