import type { EntityManager } from 'typeorm';
import { DemonTowerProfile, DemonTowerWorldFloor } from '../../../database/entities/demon-tower.entity';
import { DemonTowerSquad } from '../../../database/entities/demon-tower-squad.entity';
import type { DemonTowerEngineState } from './demon-tower.engine';
import type { DemonTowerSquadState } from './demon-tower-squad.engine';

/** Call within the account-lifecycle transaction. No auth dependency and no raw state returned. */
export async function cleanupDemonTowerExpansionUser(manager: EntityManager, userId: string, publicId: string): Promise<void> {
  // All new demon-tower actions take these world locks before any squad/profile settlement.
  // Serializing here avoids overwriting a concurrently settling teammate's JSON with stale data.
  await manager.getRepository(DemonTowerWorldFloor).createQueryBuilder('world').orderBy('world.floor', 'ASC').setLock('pessimistic_write').getMany();
  const squads = await manager.getRepository(DemonTowerSquad).createQueryBuilder('squad').addSelect('squad.state')
    .where('squad.owner_id = :userId OR CAST(squad.state AS text) LIKE :needle', { userId, needle: `%${userId}%` }).setLock('pessimistic_write').getMany();
  for (const row of squads) {
    const state = row.state as unknown as DemonTowerSquadState;
    state.members = state.members.filter(member => member.userId !== userId);
    if (row.ownerId === userId) row.ownerId = state.members[0]?.userId ?? null;
    // Positional combat logs cannot be safely remapped after member removal. Preserve remaining
    // members' HP/damage/reward entitlements, replace the old history with a non-identifying note.
    state.log = ['队伍成员账号状态发生变化，旧回合记录已匿名整理；剩余成员的战斗与奖励数据保留。'];
    if (state.members.length === 0 || row.status === 'active' && state.members.length < 2) row.status = 'closed';
    await manager.getRepository(DemonTowerSquad).save(row);
  }
  const profiles = await manager.getRepository(DemonTowerProfile).createQueryBuilder('profile').addSelect('profile.state')
    .where('profile.user_id <> :userId AND CAST(profile.state AS text) LIKE :needle', { userId, needle: `%${publicId}%` }).setLock('pessimistic_write').getMany();
  for (const row of profiles) {
    const state = row.state as unknown as DemonTowerEngineState;
    state.arenaOpponentsToday = state.arenaOpponentsToday?.filter(id => id !== publicId);
    const report = state.expansion?.arena?.lastReport;
    if (report?.opponentPublicId === publicId) { report.opponentPublicId = ''; report.opponentName = '已注销同事'; }
    row.version += 1;
    await manager.getRepository(DemonTowerProfile).save(row);
  }
}
