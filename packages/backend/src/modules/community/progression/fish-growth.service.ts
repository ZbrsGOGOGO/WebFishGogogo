import { BadRequestException, Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { FISH_RULES, fishProgressView, type FishHeartbeatInput, type FishProgressView } from '@stealth-reader/shared';
import { DataSource, EntityManager } from 'typeorm';
import { CommunityFishProgress } from '../../../database/entities/community-growth.entity';
import { User } from '../../../database/entities/user.entity';
import { COMMUNITY_CLOCK, type CommunityClock } from '../community-clock';
import { assertCommunityWritesEnabled } from '../community-write-gate';
import { communityProgressionEnabled } from './membership.service';

export const serviceDate = (now: Date): string => new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
export async function readFishProgress(manager: EntityManager, userId: string, now: Date): Promise<FishProgressView> {
  const row = await manager.getRepository(CommunityFishProgress).findOneBy({ userId });
  const today = row?.serviceDate === serviceDate(now);
  return fishProgressView(row?.experience, row?.activeSeconds, row?.gameSeconds, today ? row?.dailyActiveSeconds : 0, today ? row?.dailyGameSeconds : 0);
}
@Injectable()
export class FishGrowthService {
  constructor(private readonly db: DataSource, @Inject(COMMUNITY_CLOCK) private readonly clock: CommunityClock) {}
  async heartbeat(userId: string, raw: unknown): Promise<FishProgressView> {
    const input = this.parse(raw); this.gates();
    return this.db.transaction(async manager => {
      const user = await manager.getRepository(User).createQueryBuilder('u').where('u.id = :userId', { userId }).setLock('for_no_key_update').getOne();
      if (!user || user.accountStatus !== 'active') throw new UnauthorizedException({ code: 'PROGRESSION_ACTIVE_ACCOUNT_REQUIRED' });
      this.gates();
      const now = this.clock.now(), day = serviceDate(now);
      const repo = manager.getRepository(CommunityFishProgress);
      let row = await repo.findOneBy({ userId });
      if (!row) row = repo.create({ userId, experience: 0, activeSeconds: 0, gameSeconds: 0, dailyActiveSeconds: 0, dailyGameSeconds: 0, serviceDate: day, tabId: null, sequence: 0, mode: 'pause', lastSeenAt: now });
      const elapsed = Math.floor((now.getTime() - row.lastSeenAt.getTime()) / 1000);
      // One server lease per account. Multiple tabs/devices cannot multiply time.
      if (elapsed < 0 || (row.tabId && row.tabId !== input.tabId && elapsed <= FISH_RULES.leaseSeconds)) return readFishProgress(manager, userId, now);
      if (row.tabId === input.tabId && input.sequence <= row.sequence) return readFishProgress(manager, userId, now);
      if (row.tabId === input.tabId && input.mode !== 'pause' && elapsed < 15) return readFishProgress(manager, userId, now);
      if (row.serviceDate !== day) { row.serviceDate = day; row.dailyActiveSeconds = 0; row.dailyGameSeconds = 0; row.tabId = null; }
      const before = fishProgressView(0, 0, 0, row.dailyActiveSeconds, row.dailyGameSeconds).todayExperience;
      if (row.tabId === input.tabId && input.mode !== 'pause' && row.mode !== 'pause' && elapsed >= 15 && elapsed <= FISH_RULES.leaseSeconds) {
        const seconds = Math.min(elapsed, FISH_RULES.activeSecondsPerDay - row.dailyActiveSeconds);
        const gameSeconds = row.mode === 'game' && input.mode === 'game' ? seconds : 0;
        row.activeSeconds += seconds; row.gameSeconds += gameSeconds;
        row.dailyActiveSeconds += seconds; row.dailyGameSeconds += gameSeconds;
      }
      const after = fishProgressView(0, 0, 0, row.dailyActiveSeconds, row.dailyGameSeconds).todayExperience;
      row.experience += after - before;
      row.tabId = input.mode === 'pause' ? null : input.tabId; row.sequence = input.sequence; row.mode = input.mode; row.lastSeenAt = now;
      await repo.save(row);
      return readFishProgress(manager, userId, now);
    });
  }
  private gates(): void { if (!communityProgressionEnabled()) throw new ServiceUnavailableException({ code: 'PROGRESSION_DISABLED' }); assertCommunityWritesEnabled(); }
  private parse(raw: unknown): FishHeartbeatInput {
    const value = raw as FishHeartbeatInput;
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join() !== 'mode,sequence,tabId' || typeof value.tabId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.tabId) || !Number.isSafeInteger(value.sequence) || value.sequence < 1 || value.sequence > 2_000_000_000 || !['browse', 'game', 'pause'].includes(value.mode)) throw new BadRequestException({ code: 'PROGRESSION_REQUEST_INVALID' });
    return { ...value, tabId: value.tabId.toLowerCase() };
  }
}
