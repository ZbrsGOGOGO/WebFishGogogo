const COMMON_PASSWORDS = new Set([
  '1234567890',
  'password123',
  'qwerty12345',
  '1111111111',
]);

export function normalizeCommunityEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function validateCommunityEmail(value: string): string | undefined {
  const email = normalizeCommunityEmail(value);
  if (!email) return '请输入邮箱地址';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '请输入有效的邮箱地址';
  return undefined;
}

export function communityPasswordByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function validateCommunityPassword(value: string): string | undefined {
  const characterLength = Array.from(value).length;
  if (characterLength < 10) return '密码至少需要 10 个字符';
  if (characterLength > 64) return '密码最多允许 64 个字符';
  if (communityPasswordByteLength(value) > 72) return '密码的 UTF-8 长度不能超过 72 字节';
  if (COMMON_PASSWORDS.has(value.toLowerCase())) return '这个密码过于常见，请换一个更难猜的密码';
  return undefined;
}

export function validateCommunityDisplayName(value: string): string | undefined {
  const length = Array.from(value.trim()).length;
  if (length < 2) return '昵称至少需要 2 个字';
  if (length > 20) return '昵称最多允许 20 个字';
  return undefined;
}

export function validateVerificationCode(value: string): string | undefined {
  return /^\d{6}$/.test(value.trim()) ? undefined : '请输入 6 位数字验证码';
}

