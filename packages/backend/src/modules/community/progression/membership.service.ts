import { ForbiddenException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { CommunityMembershipView } from '@stealth-reader/shared';
import { EntityManager, IsNull } from 'typeorm';
import { CommunitySupportEntry } from '../../../database/entities/community-growth.entity';
import { CommunityMembershipGrant } from '../../../database/entities/community-progression.entity';
import { User } from '../../../database/entities/user.entity';

export const communityProgressionEnabled = (): boolean => process.env.FEATURE_COMMUNITY_PROGRESSION_ENABLED === 'true';
export const emptyMembership = (): CommunityMembershipView => ({ active: false, startsAt: null, expiresAt: null, source: null, benefits: [] });

@Injectable()
export class MembershipService {
  /** Caller supplies authoritative lock-after time; this read never creates or renews a membership. */
  async view(manager: EntityManager, userId: string, now: Date): Promise<CommunityMembershipView> {
    const row = await manager.getRepository(CommunityMembershipGrant).findOne({
      where: { userId, campaignKey: 'launch_vip_202609' },
    });
    const supports = await manager.getRepository(CommunitySupportEntry).find({ where: { userId, revokedAt: IsNull() }, order: { startsAt: 'ASC' } });
    const periods = [...(row ? [{ startsAt: row.startsAt, expiresAt: row.expiresAt, source: 'launch_gift' as const }] : []),
      ...supports.map(entry => ({ startsAt: entry.startsAt, expiresAt: entry.expiresAt, source: 'afdian_support' as const }))].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    if (!periods.length) return emptyMembership();
    const merged: typeof periods = [];
    for (const period of periods) {
      const tail = merged.at(-1);
      if (tail && tail.expiresAt.getTime() >= period.startsAt.getTime()) {
        if (period.expiresAt > tail.expiresAt) tail.expiresAt = period.expiresAt;
        if (period.source === 'afdian_support') tail.source = period.source;
      } else merged.push({ ...period });
    }
    const current = merged.find(period => period.startsAt <= now && now < period.expiresAt);
    const visible = current ?? merged.at(-1)!;
    const active = communityProgressionEnabled() && Boolean(current);
    return { active, startsAt: visible.startsAt.toISOString(), expiresAt: visible.expiresAt.toISOString(), source: visible.source, benefits: active ? ['demon_tower_auto_explore'] : [] };
  }
  async requireVip(manager: EntityManager, userId: string, now: Date): Promise<CommunityMembershipView> {
    if (!communityProgressionEnabled()) throw new ServiceUnavailableException({ code: 'PROGRESSION_DISABLED' });
    const user = await manager.getRepository(User).findOne({ select: { id: true, accountStatus: true }, where: { id: userId } });
    if (!user || user.accountStatus !== 'active') throw new UnauthorizedException({ code: 'PROGRESSION_ACTIVE_ACCOUNT_REQUIRED' });
    const vip = await this.view(manager, userId, now);
    if (!vip.active) throw new ForbiddenException({ code: 'VIP_REQUIRED' });
    return vip;
  }
}
