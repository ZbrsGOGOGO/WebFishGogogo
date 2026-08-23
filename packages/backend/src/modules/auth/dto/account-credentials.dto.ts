import type {
  AccountLoginInput,
  AccountRegisterInput,
} from '../auth.service';
import {
  normalizeUsername,
  objectBody,
  requiredString,
  validateLoginPassword,
  validateUsernamePassword,
  validateVersion,
} from './auth-validation';

export interface AccountRegisterDto {
  username: string;
  password: string;
  referralToken?: string;
  consents: {
    termsVersion: string;
    privacyVersion: string;
    communityGuidelinesVersion: string;
    adultDeclarationVersion: string;
  };
}

export interface AccountLoginDto {
  username: string;
  password: string;
}

export function toAccountRegisterInput(body: unknown): AccountRegisterInput {
  const raw = objectBody(body);
  const username = normalizeUsername(raw.username);
  const consents = objectBody(raw.consents);
  return {
    username,
    password: validateUsernamePassword(raw.password, username),
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

export function toAccountLoginInput(body: unknown): AccountLoginInput {
  const raw = objectBody(body);
  return {
    username: normalizeUsername(raw.username),
    password: validateLoginPassword(raw.password),
  };
}
