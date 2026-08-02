import {
  DEFAULT_SALT_ROUNDS,
  hashPassword,
  verifyPassword,
} from './password.util';

describe('password.util', () => {
  it('never stores the plaintext password in the hash', async () => {
    const password = 'S3cret-pw!';
    const hash = await hashPassword(password);
    expect(hash).not.toContain(password);
    expect(hash).not.toEqual(password);
  });

  it('produces a bcrypt hash string embedding the cost factor', async () => {
    const hash = await hashPassword('another-password');
    // bcrypt 哈希格式：$2b$<rounds>$<22位盐><31位摘要>
    expect(hash).toMatch(/^\$2[aby]\$\d{2}\$.{53}$/);
    expect(hash).toContain(`$${String(DEFAULT_SALT_ROUNDS).padStart(2, '0')}$`);
  });

  it('generates a different (salted) hash for the same input each call', async () => {
    const password = 'same-input';
    const first = await hashPassword(password);
    const second = await hashPassword(password);
    expect(first).not.toEqual(second);
  });

  it('verifies a matching password against its hash', async () => {
    const password = 'correct horse battery staple';
    const hash = await hashPassword(password);
    await expect(verifyPassword(password, hash)).resolves.toBe(true);
  });

  it('rejects a non-matching password', async () => {
    const hash = await hashPassword('right-password');
    await expect(verifyPassword('wrong-password', hash)).resolves.toBe(false);
  });
});
