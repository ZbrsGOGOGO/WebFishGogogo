import type { JwtModuleOptions } from '@nestjs/jwt';

type JwtExpiresIn = NonNullable<
  NonNullable<JwtModuleOptions['signOptions']>['expiresIn']
>;

/**
 * 从环境变量构建 JWT 签发配置（对齐 requirements.md Requirement 1.3：登录签发 JWT 访问令牌）。
 *
 * 说明：
 * - secret 通过环境变量 JWT_SECRET 注入；生产环境必须显式配置强随机密钥。
 * - 访问令牌固定为短会话语义，默认 15 分钟；仅允许通过
 *   JWT_ACCESS_EXPIRES_IN 显式覆盖，旧 JWT_EXPIRES_IN 不再延长访问令牌。
 */
export function buildJwtConfig(
  env: NodeJS.ProcessEnv = process.env,
): JwtModuleOptions {
  const secret = env.JWT_SECRET ?? 'dev-insecure-secret-change-me';
  if (
    env.NODE_ENV === 'production' &&
    (!env.JWT_SECRET || env.JWT_SECRET.length < 32)
  ) {
    throw new Error(
      'JWT_SECRET must be explicitly configured with at least 32 characters in production',
    );
  }

  return {
    secret,
    signOptions: {
      expiresIn: accessTokenExpiry(env.JWT_ACCESS_EXPIRES_IN),
    },
  };
}

function accessTokenExpiry(configured: string | undefined): JwtExpiresIn {
  const value = configured?.trim() || '15m';
  if (/^\d+$/.test(value)) {
    const seconds = Number(value);
    if (Number.isSafeInteger(seconds) && seconds > 0) return seconds;
  }
  if (/^\d+(?:ms|s|m|h|d|w|y)$/.test(value)) {
    return value as JwtExpiresIn;
  }
  throw new Error(
    'JWT_ACCESS_EXPIRES_IN must be positive seconds or a duration such as 15m',
  );
}
