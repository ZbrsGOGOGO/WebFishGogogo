import type { EntityManager } from 'typeorm';
import { createHash } from 'node:crypto';
import { officeDay } from './office-hub.rules';

export const OFFICE_SOCIAL_PENDING_LIMIT = 200;
export const OFFICE_DRAWING_SOCIAL_GENERATION_LIMIT = 100;
export interface OfficeSocialAward { userId: string | null; source: string; points: number }
/** No recipient user/profile lock: cross-account games already hold the actor
 * and post locks. Drawing award pairs take recipient advisory locks once in a
 * stable order; collection can only reduce capacity. Other established reward
 * sources keep their original policy and do not share a new reward limit.
 */
export async function queueOfficeSocialAwards(m: EntityManager, awards: readonly OfficeSocialAward[], now = Date.now()): Promise<boolean[]> {
    const recipients = [...new Set(awards.map(award => award.userId).filter((id): id is string => Boolean(id)))];
    const keys = [...new Set(recipients.map(id => BigInt.asIntN(64, BigInt('0x' + createHash('sha256').update(`office-social-award:${id}`).digest('hex').slice(0, 16)))))].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
    for (const key of keys) await m.query('SELECT pg_advisory_xact_lock($1::bigint)', [key.toString()]);
    // Acquire the clock after a potentially queued advisory lock, including midnight.
    const lockedNow = Math.max(now, Date.now());
    const dayStart = new Date(`${officeDay(lockedNow)}T00:00:00+08:00`);
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);
    const accepted: boolean[] = [];
    for (const award of awards) {
        if (!award.userId) { accepted.push(false); continue; }
        const drawing = /^(guess:|draw:)/.test(award.source);
        const inserted: { user_id: string }[] = await m.query(`INSERT INTO office_hub_social_awards(user_id,source,points,created_at)
            SELECT id,$2,$3::integer,$4 FROM users WHERE id=$1 AND account_status='active'
            AND (SELECT count(*) FROM office_hub_social_awards WHERE user_id=$1 AND claimed=false)<$5
            AND ($6::boolean=false OR (SELECT COALESCE(sum(points),0) FROM office_hub_social_awards
                WHERE user_id=$1 AND (source LIKE 'guess:%' OR source LIKE 'draw:%') AND created_at >= $7 AND created_at < $8)+$3::integer <= $9::integer)
            ON CONFLICT DO NOTHING RETURNING user_id`, [award.userId, award.source, award.points, new Date(lockedNow), OFFICE_SOCIAL_PENDING_LIMIT,
            drawing, dayStart, dayEnd, OFFICE_DRAWING_SOCIAL_GENERATION_LIMIT]);
        accepted.push(inserted.length > 0);
    }
    return accepted;
}
