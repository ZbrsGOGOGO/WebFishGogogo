import { ForbiddenException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { CommunityMembershipView } from '@stealth-reader/shared';
import { EntityManager } from 'typeorm';
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
    if (!row) return emptyMembership();
    const active = communityProgressionEnabled() && row.startsAt.getTime() <= now.getTime() && now.getTime() < row.expiresAt.getTime();
    return { active, startsAt: row.startsAt.toISOString(), expiresAt: row.expiresAt.toISOString(), source: 'launch_gift', benefits: active ? ['demon_tower_auto_explore'] : [] };
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
