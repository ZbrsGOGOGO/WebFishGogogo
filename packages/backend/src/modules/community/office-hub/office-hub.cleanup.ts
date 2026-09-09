import type { EntityManager } from 'typeorm';
/** Called inside account lifecycle transaction. Soft deletion needs this as well as FK cleanup. */
export async function cleanupOfficeHubUser(manager: EntityManager, userId: string): Promise<void> {
    const present = await manager.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='office_hub_posts'");
    if (!present.length)
        return;
    const rows = await manager.query('SELECT id,kind,author_id,state,reports FROM office_hub_posts WHERE author_id=$1 OR state::text LIKE $2 OR reports::text LIKE $2 FOR UPDATE', [userId, `%${userId}%`]);
    for (const row of rows) {
        if (row.author_id === userId && row.kind === 'drawing') {
            await manager.query('DELETE FROM office_hub_posts WHERE id=$1', [row.id]);
            continue;
        }
        const state = row.state;
        if(row.author_id===userId&&row.kind==='story')state.title='已注销同事的共创档案';
        if(row.author_id===userId&&row.kind==='spy')state.title='已注销同事的描述局';
        if (row.kind === 'story')
            for (const node of state.nodes) {
                if (node.author.userId === userId) {
                    node.author = { userId: null, publicId: null, displayName: '已注销同事' };
                    node.text = '[作者已注销，正文已清理]';
                }
                delete node.ratings[userId];
            }
        if (row.kind === 'drawing') {
            delete state.guesses[userId];
            state.reports = state.reports.filter((id: string) => id !== userId);
        }
        if (row.kind === 'spy') {
            const member = state.members.find((m: {
                userId: string;
            }) => m.userId === userId);
            if (member) {
                for(const [voter,target] of Object.entries(state.votes))if(target===member.publicId)delete state.votes[voter];
                state.descriptions = state.descriptions.filter((d: {
                    playerId: string;
                }) => d.playerId !== member.publicId);
                state.members = state.members.filter((m: {
                    userId: string;
                }) => m.userId !== userId);
                state.phase = 'finished';
                state.outcome = 'cancelled';
            }
            delete state.votes[userId];
            if (state.ownerId === userId)
                state.ownerId = '';
        }
        await manager.query('UPDATE office_hub_posts SET author_id=CASE WHEN author_id=$2 THEN NULL ELSE author_id END,state=$3::jsonb,reports=$4::jsonb,updated_at=now() WHERE id=$1', [row.id, userId, JSON.stringify(state), JSON.stringify(row.reports.filter((id: string) => id !== userId))]);
    }
    for (const table of ['office_hub_social_awards', 'office_hub_tower_events', 'office_hub_receipts', 'office_hub_profiles'])
        await manager.query(`DELETE FROM ${table} WHERE user_id=$1`, [userId]);
}
