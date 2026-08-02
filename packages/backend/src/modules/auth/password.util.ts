import * as bcrypt from 'bcrypt';

/**
 * 密码加盐哈希工具（对齐 requirements.md Requirement 1.7：以加盐哈希形式存储密码）。
 *
 * 使用 bcrypt：其哈希串本身内嵌随机盐与代价因子，因此无需单独存储盐值，
 * 也永远不会持久化明文密码。
 */

/** bcrypt 代价因子（cost factor / rounds）。10 为兼顾安全与性能的常用默认值。 */
export const DEFAULT_SALT_ROUNDS = 10;

/**
 * 对明文密码进行加盐哈希。
 *
 * Preconditions:
 *   - password 为非空明文字符串
 * Postconditions:
 *   - 返回内嵌随机盐的 bcrypt 哈希串（每次调用即便同一输入也不同）
 *   - 不返回、不记录明文
 */
export async function hashPassword(
  password: string,
  saltRounds: number = DEFAULT_SALT_ROUNDS,
): Promise<string> {
  return bcrypt.hash(password, saltRounds);
}

/**
 * 校验明文密码是否与已存哈希匹配。
 *
 * Preconditions:
 *   - passwordHash 为先前由 hashPassword 生成的 bcrypt 哈希串
 * Postconditions:
 *   - 匹配返回 true，否则返回 false
 *   - 无副作用
 */
export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}
