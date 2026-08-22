import { BadRequestException } from '@nestjs/common';

import type { VerifyEmailInput } from '../auth.service';
import { objectBody, requiredString, validateUuid } from './auth-validation';

export interface VerifyEmailDto {
  registrationId: string;
  code: string;
}

export function toVerifyEmailInput(body: unknown): VerifyEmailInput {
  const raw = objectBody(body);
  const code = requiredString(raw.code, 'code', 6);
  if (!/^\d{6}$/.test(code)) {
    throw new BadRequestException('code 必须为 6 位数字');
  }
  return {
    registrationId: validateUuid(raw.registrationId, 'registrationId'),
    code,
  };
}
