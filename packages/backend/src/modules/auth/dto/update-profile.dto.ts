import { BadRequestException } from '@nestjs/common';

import type { UpdateProfileInput } from '../auth.service';
import {
  objectBody,
  requiredString,
  validateDisplayName,
} from './auth-validation';

const AVATAR_KEYS = new Set(['violet', 'green', 'orange', 'blue', 'rose']);
const BATTLE_PROFESSIONS = new Set([
  'developer',
  'product',
  'qa',
  'sales',
  'hr',
]);

export interface UpdateProfileDto {
  displayName?: string;
  bio?: string;
  avatarKey?: string;
  battleProfession?: string;
  onboardingCompleted?: boolean;
}

export function toUpdateProfileInput(body: unknown): UpdateProfileInput {
  const raw = objectBody(body);
  const result: UpdateProfileInput = {};

  if (raw.displayName !== undefined) {
    result.displayName = validateDisplayName(raw.displayName);
  }
  if (raw.bio !== undefined) {
    if (typeof raw.bio !== 'string') {
      throw new BadRequestException('bio 必须为字符串');
    }
    const bio = raw.bio.trim().normalize('NFC');
    if ([...bio].length > 80) {
      throw new BadRequestException('bio 最多允许 80 个字符');
    }
    result.bio = bio || null;
  }
  if (raw.avatarKey !== undefined) {
    const avatarKey = requiredString(raw.avatarKey, 'avatarKey', 32);
    if (!AVATAR_KEYS.has(avatarKey)) {
      throw new BadRequestException('avatarKey 不在允许的系统头像中');
    }
    result.avatarKey = avatarKey;
  }
  if (raw.battleProfession !== undefined) {
    const profession = requiredString(
      raw.battleProfession,
      'battleProfession',
      32,
    );
    if (!BATTLE_PROFESSIONS.has(profession)) {
      throw new BadRequestException('battleProfession 不受支持');
    }
    result.battleProfession = profession;
  }
  if (raw.onboardingCompleted !== undefined) {
    if (raw.onboardingCompleted !== true) {
      throw new BadRequestException('onboardingCompleted 只能设为 true');
    }
    result.onboardingCompleted = true;
  }

  if (Object.keys(result).length === 0) {
    throw new BadRequestException('至少提供一个可更新字段');
  }
  return result;
}
