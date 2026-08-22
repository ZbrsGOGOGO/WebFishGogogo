import { toBusinessLocalDate } from '../platform/platform-time';

const BUSINESS_DAY_CUTOFF_MS = 5 * 60 * 60 * 1_000;

/** Asia/Shanghai 05:00 到次日 04:59:59 属于同一业务日。 */
export function toCommunityServiceDate(instant: Date): string {
  return toBusinessLocalDate(
    new Date(instant.getTime() - BUSINESS_DAY_CUTOFF_MS),
  );
}

export function serviceDateDistance(left: string, right: string): number {
  const leftMs = Date.parse(`${left}T00:00:00Z`);
  const rightMs = Date.parse(`${right}T00:00:00Z`);
  return Math.round((rightMs - leftMs) / (24 * 60 * 60 * 1_000));
}

export function serviceMonth(serviceDate: string): string {
  return serviceDate.slice(0, 7);
}
