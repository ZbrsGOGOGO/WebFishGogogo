import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { entities, User, Guild, GuildMember, UserBlock, WalletBalance } from '../../../database/entities';
import { migrations } from '../../../database/migrations';
import { PlatformAssetsService } from '../../platform';
import { OfficeHubService } from './office-hub.service';
import { cleanupOfficeHubUser } from './office-hub.cleanup';
/** Real PostgreSQL only: supply a DEDICATED database office_test_* / webfish_test_* / feedback_test_*.
 * Does not run automatically against application DB_*. Never logs connection credentials.
 */
const url = process.env.OFFICE_TEST_DATABASE_URL;
const integration = url ? describe : describe.skip;
integration('OfficeHub real PostgreSQL transactions / ownership / lifecycle', () => {
    let db: DataSource, service: OfficeHubService, assets: PlatformAssetsService, now: number, users: User[] = [];
    let testPostIds=new Set<string>();
    const originalEnv = { ...process.env };
    beforeAll(async () => {
        if (!url || !/^\/(office_test_|webfish_test_|feedback_test_)[a-z0-9_]+$/.test(new URL(url).pathname))
            throw new Error('Office test requires a dedicated safe-name PostgreSQL database');
        db = new DataSource({ type: 'postgres', url, entities, migrations, synchronize: false, logging: false, extra: { statement_timeout: 15000, lock_timeout: 10000 } });
        await db.initialize();
        await db.runMigrations();
        process.env.FEATURE_OFFICE_HUB_ENABLED = 'true';
        process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'true';
        delete process.env.FEATURE_SOCIAL_VERIFICATION_ENABLED;
    }, 120000);
    beforeEach(async () => {
        now = Date.now();
        jest.spyOn(Date, 'now').mockImplementation(() => now);
        assets = new PlatformAssetsService({ now: () => new Date(now) });
        service = new OfficeHubService(db, assets);
        users = [];
        testPostIds=new Set();
        for (let i = 0; i < 8; i++) {
            const n = randomUUID().slice(0, 8);
            users.push(await db.getRepository(User).save(db.getRepository(User).create({ email: `office-test-${n}@example.invalid`, passwordHash: 'integration-only-not-a-real-password-hash', accountStatus: 'active', displayName: `测试同事${i}` })));
        }
    });
    afterEach(async () => {
        jest.restoreAllMocks();
        if (db?.isInitialized) {
            // Capture only this test's synthetic content before lifecycle cleanup anonymizes authors.
            const posts: {id:string}[] = users.length ? await db.query('SELECT id FROM office_hub_posts WHERE author_id=ANY($1::uuid[])',[users.map(u=>u.id)]) : [];
            for(const post of posts)testPostIds.add(post.id);
            for (const u of users)
                await db.transaction(m => cleanupOfficeHubUser(m, u.id));
            if(testPostIds.size) await db.query('DELETE FROM office_hub_posts WHERE id=ANY($1::uuid[])',[[...testPostIds]]);
            if(users.length) await db.query("DELETE FROM community_admin_audit_logs WHERE actor_id=ANY($1::uuid[]) AND action='office.post.moderate'",[users.map(u=>u.id)]);
            for (const u of users)
                await db.query('DELETE FROM guilds WHERE owner_user_id=$1', [u.id]);
            for (const u of users)
                await db.getRepository(User).delete({ id: u.id });
        }
    });
    afterAll(async () => { process.env = originalEnv; if (db?.isInitialized)
        await db.destroy(); });
    const action = async (i: number, action: string, data: Record<string, unknown> = {}, requestId = randomUUID()) => { now += 1100; const result=await service.action(users[i].id, { action, ...data, requestId });for(const post of [...result.stories,...result.drawings])if(post.mine)testPostIds.add(post.id);for(const spy of result.spies)if(spy.owner)testPostIds.add(spy.id);return result; };
    const state = async (i = 0) => (await db.query('SELECT state FROM office_hub_profiles WHERE user_id=$1', [users[i].id]))[0].state;
    const patch = async (i: number, patcher: (s: any) => void) => { await service.overview(users[i].id); const s = await state(i); patcher(s); await db.query('UPDATE office_hub_profiles SET state=$2::jsonb WHERE user_id=$1', [users[i].id, JSON.stringify(s)]); };
    it('keeps disabled flag fail-closed and fresh users get no automatic tickets or office credits', async () => {
        process.env.FEATURE_OFFICE_HUB_ENABLED = 'false';
        await expect(service.overview(users[0].id)).rejects.toMatchObject({ response: { code: 'OFFICE_DISABLED' } });
        process.env.FEATURE_OFFICE_HUB_ENABLED = 'true';
        const v = await service.overview(users[0].id);
        expect(v.collection.tickets).toBe(0);
        expect(v.collection.draws).toBe(0);
        expect(await db.getRepository(WalletBalance).countBy({ userId: users[0].id })).toBe(0);
    });
    it('serializes concurrent same-key daily ticket requests, rejects key reuse with different actions', async () => {
        const id = randomUUID();
        const command = { action: 'daily_ticket', requestId: id };
        const values = await Promise.all([service.action(users[0].id, command), service.action(users[0].id, command)]);
        expect(values.map(v => v.collection.tickets)).toEqual([1, 1]);
        expect((await state()).tickets).toBe(1);
        await expect(service.action(users[0].id, { action: 'exchange_ticket', requestId: id })).rejects.toMatchObject({ response: { code: 'OFFICE_IDEMPOTENCY_CONFLICT' } });
        await expect(action(0, 'daily_ticket')).rejects.toMatchObject({ response: { code: 'OFFICE_ALREADY_CLAIMED' } });
    });
    it('does not consume draw quota on invalid source/unknown fields/unowned equip/insufficient EXP', async () => {
        await service.overview(users[0].id);
        const before = await state();
        for (const data of [{ source: 'office_coin', pool: 'daily' }, { source: 'farm', pool: 'daily', score: 9999 }, { source: 'farm', pool: 'daily' }])
            await expect(action(0, 'draw', data)).rejects.toThrow();
        await expect(action(0, 'equip', { itemId: 'skin-paper' })).rejects.toThrow();
        expect((await state()).farmSpent).toBe(before.farmSpent);
        expect((await state()).draws).toBe(0);
    });
    it('persists collection pity, 20-draw quota and capped 4-wave credits exactly once per trusted run', async () => {
        const result = { runId: randomUUID(), successfulWaves: 20, promotionTier: 7, score: 1000, stars: 3, streak: 4 };
        await db.transaction(m => service.recordTowerSettlement(m, users[0].id, result));
        await db.transaction(m => service.recordTowerSettlement(m, users[0].id, result));
        expect((await state()).creditedWaves).toBe(4);
        expect((await state()).farmEarned).toBe(960);
        await patch(0, s => { s.farmEarned = 2000; s.pitySSR = 79; });
        const v = await action(0, 'draw', { source: 'farm', pool: 'daily' });
        expect(v.collection.lastDraw).toBe(v.collection.dailyUp);
        expect(v.collection.pitySSR).toBe(0);
        expect(v.collection.farmDraws).toBe(1);
        await expect(action(0, 'equip', { itemId: v.collection.lastDraw })).resolves.toMatchObject({ collection: { equipped: v.collection.lastDraw } });
    });
    it('enforces story consecutive / branches / low-score archival without deleting other authors', async () => {
        let v = await action(0, 'story_create', { title: '办公室故事', starter: 0 });
        const id = v.stories[0].id, root = v.stories[0].nodes[0].id;
        v = await action(0, 'story_reply', { postId: id, parentId: root, text: '这里是我续写的第二段故事。' });
        const second = v.stories[0].nodes[1].id;
        await expect(action(0, 'story_reply', { postId: id, parentId: second, text: '这应该被连续次数限制拦住。' })).rejects.toMatchObject({ response: { code: 'OFFICE_STORY_CONSECUTIVE_LIMIT' } });
        for (let i = 1; i <= 6; i++)
            await action(i, 'story_reply', { postId: id, parentId: root, text: `同事${i}独立的故事分支线索。` });
        v = await service.overview(users[0].id);
        expect(v.stories.find(s => s.id === id)!.nodes.filter(n => n.parentId === root && !n.archived)).toHaveLength(5);
        const target = v.stories.find(s => s.id === id)!.nodes.find(n => !n.archived && n.parentId === root)!;
        for (let i = 0; i < 3; i++) {
            if (target.author.publicId === users[i].publicId)
                continue;
            await action(i, 'story_rate', { postId: id, nodeId: target.id, rating: 1 });
        }
        if (!(await service.overview(users[0].id)).stories.find(s => s.id === id)!.nodes.find(n => n.id === target.id)!.archived)
            await action(7, 'story_rate', { postId: id, nodeId: target.id, rating: 1 });
        expect((await service.overview(users[0].id)).stories.find(s => s.id === id)!.nodes.find(n => n.id === target.id)!.archived).toBe(true);
        await expect(action(0, 'post_delete', { postId: id })).rejects.toMatchObject({ response: { code: 'OFFICE_SHARED_STORY' } });
    });
    it('does not reveal private drawing answer/draft, rejects forged strokes, awards each successful guess once', async () => {
        let v = await action(0, 'drawing_start');
        const d = v.drawings.find(d => d.mine)!, postId = d.id;
        expect(d.word).toBeTruthy();
        expect((await service.overview(users[1].id)).drawings.some(x => x.id === postId)).toBe(false);
        await expect(action(1, 'drawing_publish', { postId, strokes: [] })).rejects.toThrow();
        await expect(action(0, 'drawing_publish', { postId, strokes: [{ points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], color: 'url(evil)', width: 4 }] })).rejects.toThrow();
        await action(0, 'drawing_publish', { postId, strokes: [{ points: [{ x: 0, y: 0 }, { x: 900, y: 900 }], color: '#334155', width: 4 }] });
        v = await service.overview(users[1].id);
        expect(v.drawings.find(d => d.id === postId)!.word).toBeNull();
        const guessed = await action(1, 'drawing_guess', { postId, guess: d.word });
        expect(guessed.drawings.find(d => d.id === postId)!.solved).toBe(true);
        await expect(action(1, 'drawing_guess', { postId, guess: d.word })).rejects.toThrow();
        expect((await action(1, 'collect_social')).collection.socialPoints).toBe(10);
        expect((await action(0, 'collect_social')).collection.socialPoints).toBe(5);
    });
    it('enforces 6-person 2-spy rules and hides roles and other words through normal views', async () => {
        let v = await action(0, 'spy_create', { title: '安全描述局' });
        const postId = v.spies[0].id;
        for (let i = 1; i < 6; i++)
            await action(i, 'spy_join', { postId });
        await expect(action(1, 'spy_start', { postId })).rejects.toThrow();
        v = await action(0, 'spy_start', { postId });
        expect(v.spies[0].members.every(m => m.role === null)).toBe(true);
        expect(v.spies[0].word).toBeTruthy();
        expect((await service.overview(users[7].id)).spies.find(s => s.id === postId)!.word).toBeNull();
        const raw = (await db.query('SELECT state FROM office_hub_posts WHERE id=$1', [postId]))[0].state;
        expect(raw.members.filter((m: any) => m.role === 'undercover')).toHaveLength(2);
        await expect(action(7, 'spy_describe', { postId, text: '不属于我的局' })).rejects.toThrow();
        await expect(action(0, 'spy_describe', { postId, text: v.spies[0].word })).rejects.toThrow();
        for (let i = 0; i < 6; i++)
            await action(i, 'spy_describe', { postId, text: `这是第${i}位同事写下的描述` });
        v = await service.overview(users[0].id);
        expect(v.spies[0].phase).toBe('vote');
    });
    it('uses blocked relationship enforcement for both discovery and direct post actions', async () => {
        const v = await action(0, 'story_create', { title: '屏蔽测试故事', starter: 1 });
        const postId = v.stories[0].id, parentId = v.stories[0].nodes[0].id;
        await db.getRepository(UserBlock).save({ blockerId: users[1].id, blockedId: users[0].id });
        expect((await service.overview(users[1].id)).stories.find(s => s.id === postId)).toBeUndefined();
        await expect(action(1, 'story_reply', { postId, parentId, text: '直接伪造链接也不能绕过。' })).rejects.toMatchObject({ response: { code: 'OFFICE_RELATIONSHIP_BLOCKED' } });
    });
    it('reports hide content and only real moderator roles restore it with an audit record', async () => {
        const v = await action(0, 'story_create', { title: '审核测试故事', starter: 1 }), postId = v.stories[0].id;
        for (let i = 1; i <= 3; i++)
            await action(i, 'post_report', { postId });
        expect((await service.overview(users[4].id)).stories.some(s => s.id === postId)).toBe(false);
        await expect(action(4, 'post_moderate', { postId, hidden: false, reason: '尝试越权恢复内容' })).rejects.toThrow();
        await db.getRepository(User).update(users[4].id, { communityRole: 'moderator' });
        await action(4, 'post_moderate', { postId, hidden: false, reason: '确认内容合规恢复' });
        expect((await service.overview(users[5].id)).stories.some(s => s.id === postId)).toBe(true);
        expect((await db.query('SELECT count(*)::int n FROM community_admin_audit_logs WHERE target_id=$1 AND action=$2', [postId, 'office.post.moderate']))[0].n).toBe(1);
    });
    it('uses server boss time and one daily wallet / XP award, transaction failure rolls claim back', async () => {
        await action(0, 'boss_start');
        await expect(action(0, 'boss_claim')).rejects.toThrow();
        now += 30000;
        const original = assets.creditWallet.bind(assets);
        jest.spyOn(assets, 'creditWallet').mockImplementationOnce(async (...args) => { await original(...args); throw new Error('forced rollback'); });
        await expect(action(0, 'boss_claim')).rejects.toThrow();
        expect((await state()).boss.claimed).toBe(false);
        const v = await action(0, 'boss_claim');
        expect(v.boss.claimed).toBe(true);
        expect((await db.getRepository(WalletBalance).findOneByOrFail({ userId: users[0].id, currency: 'office_coin' })).balance).toBe('520');
        await expect(action(0, 'boss_claim')).rejects.toThrow();
        expect((await state()).stats.bossDays).toBe(1);
    });
    it('grants shared weekly reward once across department changes, based only on trusted events', async () => {
        const guild = await db.getRepository(Guild).save(db.getRepository(Guild).create({ name: `周常${randomUUID().slice(0, 6)}`, nameKey: randomUUID().slice(0, 24), ownerUserId: users[0].id, level: 1, treasury: '0', memberCapacity: 30, buildings: { project_room: 0, training_room: 0, pantry: 0, showcase_wall: 0 } }));
        await db.getRepository(GuildMember).save({ userId: users[0].id, guildId: guild.id, role: 'owner', activity: 0, donatedToday: 0, donationServiceDate: null });
        await db.transaction(m => service.recordTowerSettlement(m, users[0].id, { runId: randomUUID(), successfulWaves: 40, promotionTier: 2, score: 2000, stars: 3, streak: 4 }));
        const first = await action(0, 'weekly_claim');
        expect(first.weekly.rewardClaimed).toBe(true);
        const second=await db.getRepository(Guild).save(db.getRepository(Guild).create({name:`另公司${randomUUID().slice(0,6)}`,nameKey:randomUUID().slice(0,24),ownerUserId:users[1].id,level:1,treasury:'0',memberCapacity:30,buildings:{project_room:0,training_room:0,pantry:0,showcase_wall:0}}));
        await db.getRepository(GuildMember).update({userId:users[0].id},{guildId:second.id,role:'member'});
        await db.transaction(m=>service.recordTowerSettlement(m,users[0].id,{runId:randomUUID(),successfulWaves:40,promotionTier:2,score:2000,stars:3,streak:4}));
        await expect(action(0, 'weekly_claim')).rejects.toThrow();
        expect((await state()).stats.weeklyWins).toBe(1);
    });
    it('clears deleted account authored text, private words, contributions and claims, retains others story nodes', async () => {
        const v = await action(0, 'story_create', { title: '注销后保留的共创', starter: 0 }), postId = v.stories[0].id, parentId = v.stories[0].nodes[0].id;
        await action(1, 'story_reply', { postId, parentId, text: '其他同事合法保留的续写内容' });
        await action(0, 'drawing_start');
        await action(0, 'spy_create', { title: '注销测试局' });
        await db.transaction(m => cleanupOfficeHubUser(m, users[0].id));
        await db.getRepository(User).update(users[0].id, { accountStatus: 'deleted' });
        const after = await service.overview(users[1].id);
        expect(after.stories.find(s => s.id === postId)!.nodes[0].text).toContain('正文已清理');
        expect(after.stories.find(s => s.id === postId)!.title).toBe('已注销同事的共创档案');
        expect(after.stories.find(s => s.id === postId)!.nodes[1].text).toBe('其他同事合法保留的续写内容');
        expect(JSON.stringify(after)).not.toContain(users[0].publicId);
        expect((await db.query('SELECT count(*)::int n FROM office_hub_profiles WHERE user_id=$1', [users[0].id]))[0].n).toBe(0);
    });
    it('strictly rejects prototype actions and malicious object-to-string payloads as 400 errors',async()=>{
        for(const actionName of ['__proto__','constructor','toString','drawing_report'])await expect(action(0,actionName)).rejects.toMatchObject({response:{code:'OFFICE_COMMAND_INVALID'}});
        await expect(action(0,'draw',{source:{toString:null},pool:'daily'})).rejects.toMatchObject({response:{code:'OFFICE_COMMAND_INVALID'}});
    });
    it('uses precision-preserving keyset archive pages without dropping equal-timestamp posts',async()=>{
        const seed=await action(0,'story_create',{title:'可翻页的共创档案',starter:0});const original=seed.stories[0];const row=(await db.query('SELECT state FROM office_hub_posts WHERE id=$1',[original.id]))[0];
        for(let i=0;i<34;i++)await db.query("INSERT INTO office_hub_posts(id,author_id,kind,state,created_at) VALUES($1,$2,'story',$3::jsonb,$4)",[randomUUID(),users[0].id,JSON.stringify({...row.state,title:`归档故事${i}`}),new Date(now-1000)]);
        const first=await service.overview(users[1].id,undefined,'story');expect(first.stories).toHaveLength(30);expect(first.page?.nextCursor).toBeTruthy();const second=await service.overview(users[1].id,first.page!.nextCursor!,'story');const owned=[...first.stories,...second.stories].filter(s=>s.nodes[0]?.author.publicId===users[0].publicId);expect(owned).toHaveLength(35);expect(new Set(owned.map(s=>s.id)).size).toBe(35);await expect(service.overview(users[1].id,'malformed','story')).rejects.toMatchObject({response:{code:'OFFICE_PAGE_INVALID'}});
    });
    it('queues drawer rewards without waiting for the drawer users lock or writing their wallet',async()=>{
        const started=await action(0,'drawing_start'),d=started.drawings[0];await action(0,'drawing_publish',{postId:d.id,strokes:[{points:[{x:0,y:0},{x:20,y:30}],color:'#334155',width:4}]});
        let ready!:()=>void,release!:()=>void;const locked=new Promise<void>(r=>{ready=r;});const hold=new Promise<void>(r=>{release=r;});
        const tx=db.transaction(async m=>{await m.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[users[0].id]);ready();await hold;});await locked;
        try{await action(1,'drawing_guess',{postId:d.id,guess:d.word});expect(await db.getRepository(WalletBalance).countBy({userId:users[0].id})).toBe(0);}finally{release();await tx;}
        expect((await action(0,'collect_social')).collection.socialPoints).toBe(5);
    },20000);
});
