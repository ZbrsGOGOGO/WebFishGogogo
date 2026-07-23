import type { JwtModuleOptions } from '@nestjs/jwt';

/**
 * 从环境变量构建 JWT 签发配置（对齐 requirements.md Requirement 1.3：登录签发 JWT 访问令牌）。
 *
 * 说明：
 * - secret 通过环境变量 JWT_SECRET 注入；生产环境必须显式配置强随机密钥。
 * - expiresIn 通过 JWT_EXPIRES_IN 配置，默认 7 天。
 */
export function buildJwtConfig(
  env: NodeJS.ProcessEnv = process.env,
): JwtModuleOptions {
  return {
    secret: env.JWT_SECRET ?? 'dev-insecure-secret-change-me',
    signOptions: {
      expiresIn: env.JWT_EXPIRES_IN ?? '7d',
    },
  };
}
