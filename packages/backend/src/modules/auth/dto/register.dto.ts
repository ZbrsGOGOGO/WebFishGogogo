import type { RegisterInput } from '../auth.service';
import {
  normalizeEmail,
  objectBody,
  requiredString,
  validateDisplayName,
  validateNewPassword,
  validateVersion,
} from './auth-validation';

/**
 * POST /auth/register 请求体。
 * email / password 必填，displayName 可选（对齐 Requirement 1.1）。
 */
export interface RegisterDto {
  email: string;
  password: string;
  displayName: string;
  betaAccessCode: string;
  referralToken?: string;
  consents: {
    termsVersion: string;
    privacyVersion: string;
    communityGuidelinesVersion: string;
    adultDeclarationVersion: string;
  };
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
  const raw = objectBody(body);
  const email = normalizeEmail(raw.email);
  const password = validateNewPassword(raw.password, email);
  const consents = objectBody(raw.consents);

  return {
    email,
    password,
    displayName: validateDisplayName(raw.displayName),
    betaAccessCode: requiredString(raw.betaAccessCode, 'betaAccessCode', 128),
    ...(raw.referralToken === undefined
      ? {}
      : {
          referralToken: requiredString(
            raw.referralToken,
            'referralToken',
            200,
          ),
        }),
    consents: {
      termsVersion: validateVersion(consents.termsVersion, 'termsVersion'),
      privacyVersion: validateVersion(consents.privacyVersion, 'privacyVersion'),
      communityGuidelinesVersion: validateVersion(
        consents.communityGuidelinesVersion,
        'communityGuidelinesVersion',
      ),
      adultDeclarationVersion: validateVersion(
        consents.adultDeclarationVersion,
        'adultDeclarationVersion',
      ),
    },
  };
}
