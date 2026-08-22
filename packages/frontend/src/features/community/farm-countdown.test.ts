import { describe, expect, it } from 'vitest';

import {
  communityFarmRemainingSeconds,
  formatCommunityFarmDuration,
} from './farm-countdown';

describe('community farm server clock', () => {
  it('uses the server offset rather than trusting the local wall clock', () => {
    const localNow = Date.parse('2026-08-22T00:00:00.000Z');
    const serverOffset = 5 * 60 * 1000;
    const maturesAt = '2026-08-22T00:05:30.000Z';

    expect(communityFarmRemainingSeconds(maturesAt, serverOffset, localNow)).toBe(30);
    expect(communityFarmRemainingSeconds(maturesAt, serverOffset, localNow + 31_000)).toBe(0);
  });

  it('formats the onboarding and standard product cycles clearly', () => {
    expect(formatCommunityFarmDuration(30)).toBe('30秒');
    expect(formatCommunityFarmDuration(20 * 60 * 60)).toBe('20小时 0分');
  });
});
