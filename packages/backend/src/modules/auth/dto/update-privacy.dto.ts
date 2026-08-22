import { BadRequestException } from '@nestjs/common';

import type {
  CommunityPrivacyLevel,
  CommunityPrivacySettings,
} from '../../../database/entities/player-profile.entity';
import { objectBody, requiredString } from './auth-validation';

const FIELDS = [
  'equipment',
  'battleRecord',
  'plant',
  'honors',
  'friendCount',
  'recentActivity',
] as const satisfies ReadonlyArray<keyof CommunityPrivacySettings>;
const LEVELS = new Set<CommunityPrivacyLevel>([
  'everyone',
  'friends',
  'self',
]);

export interface UpdatePrivacyDto {
  privacy: CommunityPrivacySettings;
}

export function toPrivacySettings(body: unknown): CommunityPrivacySettings {
  const raw = objectBody(body);
  const privacy = objectBody(raw.privacy);
  const result = {} as CommunityPrivacySettings;

  for (const field of FIELDS) {
    const level = requiredString(privacy[field], `privacy.${field}`, 16);
    if (!LEVELS.has(level as CommunityPrivacyLevel)) {
      throw new BadRequestException(`privacy.${field} 不受支持`);
    }
    result[field] = level as CommunityPrivacyLevel;
  }
  return result;
}
