import { BadRequestException } from '@nestjs/common';

import { RegisterInput } from '../auth.service';

/**
 * POST /auth/register 请求体。
 * email / password 必填，displayName 可选（对齐 Requirement 1.1）。
 */
export interface RegisterDto {
  email: string;
  password: string;
  displayName?: string | null;
}

/**
 * 将原始请求体规整并校验为 RegisterInput。
 *
 * 无 class-validator 依赖，故在此做轻量类型/取值校验：
 * - email 必须为非空字符串；
 * - password 必须为非空字符串；
 * - displayName 若提供，必须为字符串或 null。
 * 邮箱唯一性等业务规则由 AuthService 负责。
 */
export function toRegisterInput(body: unknown): RegisterInput {
  if (typeof body !== 'object' || body === null) {
    throw new BadRequestException('请求体必须为对象');
  }
  const raw = body as Record<string, unknown>;

  const email = expectNonEmptyString(raw.email, 'email');
  const password = expectNonEmptyString(raw.password, 'password');

  let displayName: string | null | undefined;
  if ('displayName' in raw) {
    if (raw.displayName === null) {
      displayName = null;
    } else if (typeof raw.displayName === 'string') {
      displayName = raw.displayName;
    } else {
      throw new BadRequestException('displayName 必须为字符串或 null');
    }
  }

  return { email, password, displayName };
}

function expectNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException(`${field} 必须为非空字符串`);
  }
  return value;
}
