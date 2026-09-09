import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { type WorkstationCommand } from '@stealth-reader/shared';
import { assertCommunityWritesEnabled, communityWritesEnabled } from '../community-write-gate';

export function workstationWritesEnabled(): boolean {
  return communityWritesEnabled() && process.env.FEATURE_WORKSTATION_CAMPAIGN_ENABLED === 'true';
}
export function assertWorkstationWrites(): void {
  assertCommunityWritesEnabled();
  if (!workstationWritesEnabled()) throw new ServiceUnavailableException({ code: 'WORKSTATION_CAMPAIGN_DISABLED' });
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException({ code: 'WORKSTATION_REQUEST_INVALID' });
  return value as Record<string, unknown>;
}
export function exact(value: Record<string, unknown>, keys: string[]): void {
  if (Object.keys(value).some((key) => !keys.includes(key))) throw new BadRequestException({ code: 'WORKSTATION_FIELD_INVALID' });
}
export function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[\da-f]{8}-[\da-f]{4}-[1-5][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(value)) throw new BadRequestException({ code: 'WORKSTATION_ID_INVALID' });
  return value;
}
export function integer(value: unknown, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) throw new BadRequestException({ code: 'WORKSTATION_NUMBER_INVALID' });
  return Number(value);
}
export function workstationCommand(raw: unknown): WorkstationCommand {
  const value = object(raw);
  const type = value.type;
  if (['start','go','next','pause','resume','pulse','hero','plant','refresh','abandon','skill2','skill3','rush','repair-plant'].includes(String(type))) { exact(value, ['type']); return { type } as WorkstationCommand; }
  if (type === 'move') {
    exact(value, ['type','direction']);
    if (!['up','down','left','right'].includes(String(value.direction))) throw new BadRequestException({ code: 'WORKSTATION_DIRECTION_INVALID' });
    return value as WorkstationCommand;
  }
  if (type === 'focus') {
    exact(value, ['type','towerType']);
    if (!['single','slow','splash','push','shred'].includes(String(value.towerType))) throw new BadRequestException({ code: 'WORKSTATION_TOWER_INVALID' });
    return value as WorkstationCommand;
  }
  if (type === 'merge' || type === 'sell-tower') { exact(value, ['type','slotIndex']); integer(value.slotIndex, 0, 8); return value as WorkstationCommand; }
  if (type === 'buy') { exact(value, ['type','offerId']); if (typeof value.offerId !== 'string' || !/^offer-\d{1,8}$/.test(value.offerId)) throw new BadRequestException({ code: 'WORKSTATION_OFFER_INVALID' }); return value as WorkstationCommand; }
  if (type === 'deploy' || type === 'sell-item') {
    exact(value, type === 'deploy' ? ['type','itemId','slotIndex'] : ['type','itemId']);
    if (typeof value.itemId !== 'string' || !/^item-\d{1,8}$/.test(value.itemId)) throw new BadRequestException({ code: 'WORKSTATION_ITEM_INVALID' });
    if (type === 'deploy') integer(value.slotIndex, 0, 8);
    return value as WorkstationCommand;
  }
  throw new BadRequestException({ code: 'WORKSTATION_COMMAND_INVALID' });
}
