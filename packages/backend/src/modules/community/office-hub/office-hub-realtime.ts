import type { EntityManager } from 'typeorm';
import type { PlayRoom, PlayRoomMember } from '../../../database/entities';
import type { ArcadeEngineState } from '../play/engines';
/** Same-company real-time undercover games share the free office social rewards.
 * The authoritative engine, not the browser's score, determines the winning role.
 * Membership must predate game start, all human participants must belong to one company.
 */
export async function recordOfficeRealtimeUndercover(manager: EntityManager, room: PlayRoom, members: PlayRoomMember[]): Promise<void> {
    if (process.env.FEATURE_OFFICE_HUB_ENABLED !== 'true' || room.gameKey !== 'undercover' || room.mode !== 'room' || !room.startedAt || !room.engineState)
        return;
    const state = room.engineState as unknown as ArcadeEngineState, u = state.undercover;
    if (state.phase !== 'finished' || !u?.outcome || members.length < 3 || members.length > 8)
        return;
    const guildMembers = await manager.query('SELECT user_id,guild_id,joined_at FROM guild_members WHERE user_id=ANY($1::uuid[])', [members.map(m => m.userId)]);
    if (guildMembers.length !== members.length || new Set(guildMembers.map((m: {
        guild_id: string;
    }) => m.guild_id)).size !== 1 || guildMembers.some((m: {
        joined_at: Date;
    }) => new Date(m.joined_at).getTime() > room.startedAt!.getTime()))
        return;
    for (const member of members) {
        const player = state.players.find(p => p.id === member.user.publicId);
        if (member.leftAt || member.user.accountStatus !== 'active' || !player || player.forfeited || player.actionCount === 0 || u.roles[member.user.publicId] !== u.outcome)
            continue;
        for (const [prefix, points] of [['spy', 15], ['department-spy', 5]] as const)
            await manager.query("INSERT INTO office_hub_social_awards(user_id,source,points) SELECT id,$2,$3 FROM users WHERE id=$1 AND account_status='active' ON CONFLICT DO NOTHING", [member.userId, `${prefix}:realtime:${room.id}`, points]);
    }
}
