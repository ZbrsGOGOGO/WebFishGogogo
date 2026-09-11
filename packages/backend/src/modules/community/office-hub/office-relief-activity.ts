import { FISH_RULES } from '@stealth-reader/shared';
import type { EntityManager } from 'typeorm';
import { assertCommunityWritesEnabled } from '../community-write-gate';
import { accrueOfficeRelief, readOfficeRelief } from './office-relief.rules';
import { newOfficeProfile } from './office-hub.rules';

/** Internal only. Caller owns the active user's lock and SAME transaction as
 * FishGrowthService's accepted heartbeat. Never pass lifetime/client seconds. */
export async function creditOfficeReliefActivity(manager: EntityManager, userId: string, acceptedSeconds: number, now: Date): Promise<void> {
  if (!Number.isSafeInteger(acceptedSeconds) || acceptedSeconds < 0 || acceptedSeconds > FISH_RULES.leaseSeconds || !Number.isFinite(now.getTime())) {
    throw new Error('OFFICE_RELIEF_ACTIVITY_INVALID');
  }
  if (acceptedSeconds === 0 || process.env.FEATURE_OFFICE_HUB_ENABLED !== 'true') return;
  assertCommunityWritesEnabled();
  const [row] = await manager.query('SELECT state FROM office_hub_profiles WHERE user_id=$1 FOR UPDATE', [userId]);
  let state: Record<string, unknown>;
  if (row) {
    if (!row.state || typeof row.state !== 'object' || Array.isArray(row.state)) throw new Error('OFFICE_RELIEF_PROFILE_INVALID');
    // Do not accrue daily farm EXP, reset a legacy boss, change promotion, or
    // rewrite another field merely because a user sent an activity heartbeat.
    state = { ...row.state };
  } else {
    const initial = newOfficeProfile(now.getTime());
    const [tower] = await manager.query('SELECT promotion_tier FROM tower_defense_profiles WHERE user_id=$1', [userId]);
    initial.promotionTier = Math.max(0, Math.min(7, Number(tower?.promotion_tier ?? 0)));
    state = initial as unknown as Record<string, unknown>;
  }
  state.relief = accrueOfficeRelief(readOfficeRelief(state.relief, now.getTime()), acceptedSeconds);
  assertCommunityWritesEnabled();
  if (row) await manager.query('UPDATE office_hub_profiles SET state=$2::jsonb,updated_at=$3 WHERE user_id=$1', [userId, JSON.stringify(state), now]);
  else await manager.query('INSERT INTO office_hub_profiles(user_id,state,created_at,updated_at) VALUES($1,$2::jsonb,$3,$3)', [userId, JSON.stringify(state), now]);
}
