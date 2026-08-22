import type { LoginInput } from '../auth.service';
import {
  normalizeEmail,
  objectBody,
  validateLoginPassword,
} from './auth-validation';

/**
 * POST /auth/login 请求体。
 * email / password 必填（对齐 Requirement 1.3）。
 */
export interface LoginDto {
  email: string;
  password: string;
}

/**
 * 将原始请求体规整并校验为 LoginInput。
 *
 * 无 class-validator 依赖，故在此做轻量类型/取值校验：
 * email / password 必须为非空字符串。凭据匹配校验由 AuthService 负责。
 */
export function toLoginInput(body: unknown): LoginInput {
  const raw = objectBody(body);

  return {
    email: normalizeEmail(raw.email),
    password: validateLoginPassword(raw.password),
  };
}
