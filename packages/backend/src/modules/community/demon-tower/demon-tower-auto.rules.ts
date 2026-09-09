import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DEMON_TOWER_AUTO_LIMITS, type DemonTowerAutoRunView, type DemonTowerAutoStartInput } from '@stealth-reader/shared';
import { DemonTowerAutoRun } from '../../../database/entities/demon-tower-auto-run.entity';
import { demonTowerWritesEnabled } from './demon-tower.rules';

export const demonTowerAutoEnabled = (): boolean => demonTowerWritesEnabled() && process.env.FEATURE_COMMUNITY_PROGRESSION_ENABLED === 'true' && process.env.FEATURE_DEMON_TOWER_AUTO_EXPLORE_ENABLED === 'true';
export function assertDemonTowerAutoEnabled(): void {
  if (!demonTowerAutoEnabled()) throw new ServiceUnavailableException({ code: 'DEMON_TOWER_AUTO_DISABLED' });
}
const fail = (): never => { throw new BadRequestException({ code: 'DEMON_TOWER_AUTO_REQUEST_INVALID' }); };
export function demonTowerAutoId(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) fail();
  return (value as string).toLowerCase();
}
function exact(raw: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) fail();
  const input = raw as Record<string, unknown>;
  if (Reflect.ownKeys(input).length !== keys.length || Reflect.ownKeys(input).some(key => typeof key !== 'string' || !keys.includes(key) || !('value' in Object.getOwnPropertyDescriptor(input, key)!)) || keys.some(key => !Object.prototype.hasOwnProperty.call(input, key))) fail();
  return input;
}
export function demonTowerAutoStart(raw: unknown): DemonTowerAutoStartInput {
  const input = exact(raw, ['requestId', 'expectedVersion', 'floor', 'maxExplorations']);
  const requestId = demonTowerAutoId(input.requestId);
  for (const [key, min, max] of [['expectedVersion', 1, 2_147_483_646], ['floor', 1, 9], ['maxExplorations', 1, DEMON_TOWER_AUTO_LIMITS.maxExplorations]] as const) {
    if (!Number.isSafeInteger(input[key]) || (input[key] as number) < min || (input[key] as number) > max) fail();
  }
  return { requestId, expectedVersion: input.expectedVersion as number, floor: input.floor as number, maxExplorations: input.maxExplorations as number };
}
export function demonTowerAutoStop(raw: unknown): void { exact(raw, []); }
/** Stable UUID namespace, not randomness. Gameplay RNG remains solely inside the owned save. */
export function demonTowerAutoStepRequestId(runId: string, step: number): string {
  const bytes = createHash('sha256').update(`demon-tower-auto-step-v1:${runId}:${step}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 0x50; bytes[8] = (bytes[8] & 63) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
/** Explicit projection. No user/internal-session IDs, hashes or worker counters leave the server. */
export function demonTowerAutoView(run: DemonTowerAutoRun): DemonTowerAutoRunView {
  return { id: run.id, version: run.version, status: run.status, stopReason: run.stopReason, serviceDate: run.serviceDate,
    floor: run.floor, maxExplorations: run.maxExplorations, startedExplorations: run.startedExplorations,
    completedExplorations: run.completedExplorations, steps: run.steps, maxSteps: DEMON_TOWER_AUTO_LIMITS.maxSteps,
    officeCoinsGranted: run.officeCoinsGranted, createdAt: run.createdAt.getTime(),
    nextStepAt: run.status === 'running' ? run.nextStepAt.getTime() : null, expiresAt: run.expiresAt.getTime(), stoppedAt: run.stoppedAt?.getTime() ?? null };
}
