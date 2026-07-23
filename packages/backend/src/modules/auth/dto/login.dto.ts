import { BadRequestException } from '@nestjs/common';

import { LoginInput } from '../auth.service';

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
  if (typeof body !== 'object' || body === null) {
    throw new BadRequestException('请求体必须为对象');
  }
  const raw = body as Record<string, unknown>;

  return {
    email: expectNonEmptyString(raw.email, 'email'),
    password: expectNonEmptyString(raw.password, 'password'),
  };
}

function expectNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException(`${field} 必须为非空字符串`);
  }
  return value;
}
