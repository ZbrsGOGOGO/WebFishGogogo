import { BadRequestException } from '@nestjs/common';

import type { OfficeBattleProfession } from '../../../database/entities/office-battle-profile.entity';
import { isOfficeBattleProfession } from './office-battle-rules';

export function strictBattleObject(
  body: unknown,
  allowed: readonly string[],
): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException({ code: 'INVALID_REQUEST_BODY' });
  }
  const value = body as Record<string, unknown>;
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length > 0) {
    throw new BadRequestException({ code: 'UNEXPECTED_BATTLE_FIELD', fields: unexpected.sort() });
  }
  return value;
}

export function battleProfession(value: unknown): OfficeBattleProfession {
  if (!isOfficeBattleProfession(value)) {
    throw new BadRequestException({ code: 'INVALID_BATTLE_PROFESSION' });
  }
  return value;
}

export function positiveBattleVersion(value: unknown, nullable = false): number | null {
  if (nullable && value === null) return null;
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new BadRequestException({ code: 'INVALID_EXPECTED_VERSION' });
  }
  return value as number;
}

export function battleRequestId(value: unknown): string {
  if (typeof value !== 'string') throw new BadRequestException({ code: 'INVALID_BATTLE_REQUEST_ID' });
  const normalized = value.trim();
  if (normalized.length < 8 || normalized.length > 100 || /[^\x21-\x7e]/.test(normalized)) {
    throw new BadRequestException({ code: 'INVALID_BATTLE_REQUEST_ID' });
  }
  return normalized;
}

export function battleUuid(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  ) {
    throw new BadRequestException({ code: 'INVALID_BATTLE_IDENTIFIER', field });
  }
  return value.toLowerCase();
}

export function battleEquipmentIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 120) {
    throw new BadRequestException({ code: 'INVALID_EQUIPMENT_IDS' });
  }
  const ids = value.map((item) => battleUuid(item, 'equipmentId'));
  if (new Set(ids).size !== ids.length) {
    throw new BadRequestException({ code: 'DUPLICATE_EQUIPMENT_ID' });
  }
  return ids;
}

export function battleMode(value: unknown): 'reward' | 'practice' {
  if (value !== 'reward' && value !== 'practice') {
    throw new BadRequestException({ code: 'INVALID_BATTLE_MODE' });
  }
  return value;
}
