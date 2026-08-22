import type { ResendVerificationInput } from '../auth.service';
import { objectBody, validateUuid } from './auth-validation';

export interface ResendVerificationDto {
  registrationId: string;
}

export function toResendVerificationInput(
  body: unknown,
): ResendVerificationInput {
  const raw = objectBody(body);
  return {
    registrationId: validateUuid(raw.registrationId, 'registrationId'),
  };
}
