import { COMMUNITY_ACHIEVEMENTS, type TitleBadge } from '@stealth-reader/shared';
import { EntityManager, In } from 'typeorm';
import { CommunityAchievementUnlock, CommunityUserPresentation } from '../../../database/entities/community-progression.entity';
import { User } from '../../../database/entities/user.entity';
import { communityProgressionEnabled } from './membership.service';

/** Server-owned text only: never trust a title label/key from profile text or message input. */
export function titleBadge(key: string | null | undefined): TitleBadge | null {
  const item = COMMUNITY_ACHIEVEMENTS.find((entry) => entry.key === key);
  return item ? { key: item.title.key, label: item.title.label } : null;
}

/** Chat pages already have bounded authors. Batch projections do not calculate/award achievements. */
export async function loadTitleBadges(manager: EntityManager, userIds: readonly string[]): Promise<Map<string, TitleBadge>> {
  const result = new Map<string, TitleBadge>();
  if (!communityProgressionEnabled() || !userIds.length) return result;
  const ids = [...new Set(userIds)].slice(0, 500);
  const [users, presentations, unlocks] = await Promise.all([
    manager.getRepository(User).find({ select: { id: true }, where: { id: In(ids), accountStatus: 'active' } }),
    manager.getRepository(CommunityUserPresentation).find({ where: { userId: In(ids) } }),
    manager.getRepository(CommunityAchievementUnlock).find({ where: { userId: In(ids) } }),
  ]);
  const active = new Set(users.map((user) => user.id));
  const owned = new Set(unlocks.map((unlock) => `${unlock.userId}:${unlock.achievementKey}`));
  for (const row of presentations) {
    const badge = titleBadge(row.equippedTitleKey);
    if (active.has(row.userId) && badge && owned.has(`${row.userId}:${badge.key}`)) result.set(row.userId, badge);
  }
  return result;
}

export async function unlockedTitleBadges(manager: EntityManager, userId: string): Promise<TitleBadge[]> {
  if (!communityProgressionEnabled()) return [];
  const rows = await manager.getRepository(CommunityAchievementUnlock).findBy({ userId });
  const keys = new Set(rows.map((row) => row.achievementKey));
  return COMMUNITY_ACHIEVEMENTS.filter((entry) => keys.has(entry.key)).map((entry) => ({ ...entry.title }));
}
