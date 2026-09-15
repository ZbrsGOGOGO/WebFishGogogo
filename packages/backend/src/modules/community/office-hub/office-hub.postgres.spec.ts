import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import type { OfficeHubOverview } from '@stealth-reader/shared';
import { entities, User, Guild, GuildMember, UserBlock, WalletBalance } from '../../../database/entities';
import { migrations } from '../../../database/migrations';
import { PlatformAssetsService } from '../../platform';
import { OfficeHubService } from './office-hub.service';
import { cleanupOfficeHubUser } from './office-hub.cleanup';
import { OFFICE_DRAWING_GLOBAL_STORAGE_LIMIT, OFFICE_DRAWING_PARTICIPANT_LIMIT, OFFICE_DRAWING_STATE_MAX_BYTES, OFFICE_DRAWING_STORAGE_LIMIT } from './office-drawing.rules';
import { queueOfficeSocialAwards } from './office-social-awards';
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
    async function waitForBlockedBy(holder: number): Promise<void> {
        for (let i = 0; i < 200; i++) {
            const blocked = await db.query('SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND $1=ANY(pg_blocking_pids(pid))', [holder]);
            if (blocked.length) return;
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        throw new Error('Synthetic request never reached the expected PostgreSQL row lock');
    }
    it('keeps disabled flag fail-closed and fresh users get no automatic tickets or office credits', async () => {
        process.env.FEATURE_OFFICE_HUB_ENABLED = 'false';
        await expect(service.overview(users[0].id)).rejects.toMatchObject({ response: { code: 'OFFICE_DISABLED' } });
        process.env.FEATURE_OFFICE_HUB_ENABLED = 'true';
        const v = await service.overview(users[0].id);
        expect(v.collection.tickets).toBe(0);
        expect(v.collection.draws).toBe(0);
        expect(await db.getRepository(WalletBalance).countBy({ userId: users[0].id })).toBe(0);
    });
    it('persists versioned drawings, restores current draft independently and keeps unfinished art private', async () => {
        const started = await action(0, 'drawing_start'), d = started.drawingWorkspace!.current!;
        const strokes = [{ points: [{ x: 0, y: 0 }, { x: 900, y: 900 }], color: '#334155', width: 4 }];
        const saved = await action(0, 'drawing_save', { postId: d.id, expectedRevision: 0, strokes });
        expect(saved.drawingWorkspace).toMatchObject({ dailyLimit: null, dailyUnlimited: true, dailyUsed: 1, dailyRemaining: null, canStart: false, storageLimit: 1000, storageUsed: 1, current: { id: d.id, revision: 1, status: 'draft', strokes } });
        expect((await service.overview(users[0].id, undefined, 'story')).drawingWorkspace?.current).toMatchObject({ id: d.id, strokes });
        expect((await service.overview(users[1].id)).drawings.some(x => x.id === d.id)).toBe(false);
        expect((await service.overview(users[1].id)).drawingWorkspace?.current).toBeNull();
        await expect(action(1, 'drawing_save', { postId: d.id, expectedRevision: 1, strokes })).rejects.toMatchObject({ response: { code: 'OFFICE_OWNER_REQUIRED' } });
        await expect(action(0, 'drawing_save', { postId: d.id, expectedRevision: 0, strokes: [] })).rejects.toMatchObject({ response: { code: 'OFFICE_DRAWING_VERSION_CONFLICT' } });
        expect((await service.overview(users[0].id)).drawingWorkspace?.current?.strokes).toEqual(strokes);
        await expect(action(0, 'drawing_start')).rejects.toMatchObject({ response: { code: 'OFFICE_DRAWING_ACTIVE' } });
        expect((await state()).counters.drawing_start).toBe(1);
    });
    it('sweeps offline persisted art once after restart and never overwrites it with a late client payload', async () => {
        const d = (await action(0, 'drawing_start')).drawingWorkspace!.current!;
        const strokes = [{ points: [{ x: 0, y: 0 }, { x: 50, y: 60 }], color: '#2563eb', width: 4 }];
        await action(0, 'drawing_save', { postId: d.id, expectedRevision: 0, strokes });
        now = Date.parse(d.deadlineAt!);
        const restarted = new OfficeHubService(db, assets);
        await Promise.all([restarted.settleDueDrawings(), service.settleDueDrawings()]);
        expect((await state()).stats.drawings).toBe(1);
        const other = (await service.overview(users[1].id)).drawings.find(x => x.id === d.id)!;
        expect(other).toMatchObject({ status: 'published', submission: 'automatic', word: null, strokes });
        expect(other.submittedAt).toBe(d.deadlineAt);
        const late = await action(0, 'drawing_publish', { postId: d.id, expectedRevision: 1, strokes: [] });
        expect(late.drawingWorkspace?.current).toMatchObject({ status: 'published', submission: 'automatic', strokes });
        await service.settleDueDrawings(); expect((await state()).stats.drawings).toBe(1);
        expect((await state()).counters.drawing_start).toBe(1);
    });
    it('allows more than three daily creations and does not accumulate expired empty tasks in artwork capacity', async () => {
        const words = new Set<string>();
        for (let i = 0; i < 20; i++) {
            const d = (await action(0, 'drawing_start')).drawingWorkspace!.current!;
            expect(d.word).not.toBeNull();
            if(i<7) words.add(d.word!);
            now = Date.parse(d.deadlineAt!);
            const view = await service.overview(users[0].id);
            expect(view.drawingWorkspace).toMatchObject({ dailyUsed: i + 1, dailyRemaining: null, canStart:true, storageUsed:0, current: { status: 'expired_empty', submission: 'automatic', strokes: [] } });
        }
        expect(words.size).toBe(7);
        expect((await service.overview(users[1].id)).drawings).toEqual([]);
        expect((await state()).stats.drawings).toBe(0);
        // Twelve bounded topic-history rows plus the latest terminal result;
        // none of these empty tasks uses public artwork storage.
        expect(await db.query("SELECT id FROM office_hub_posts WHERE author_id=$1 AND kind='drawing'",[users[0].id])).toHaveLength(13);
        expect((await action(0,'drawing_start')).drawingWorkspace?.dailyUsed).toBe(21);
        now += 86400000;
        expect((await action(0, 'drawing_start')).drawingWorkspace).toMatchObject({dailyLimit:null,dailyRemaining:null,dailyUsed:1});
    });
    it('replays original draft and publish requests without duplicate revisions or drawing credit', async () => {
        const d = (await action(0, 'drawing_start')).drawingWorkspace!.current!;
        const strokes = [{ points: [{ x: 1, y: 2 }, { x: 4, y: 8 }], color: '#334155', width: 4 }];
        const saveId = randomUUID(), data = { postId: d.id, expectedRevision: 0, strokes };
        await action(0, 'drawing_save', data, saveId);
        expect((await action(0, 'drawing_save', data, saveId)).drawingWorkspace?.current?.revision).toBe(1);
        const publishId = randomUUID(), publish = { ...data, expectedRevision: 1 };
        await action(0, 'drawing_publish', publish, publishId);
        expect((await action(0, 'drawing_publish', publish, publishId)).drawingWorkspace?.current).toMatchObject({ revision: 2, submission: 'manual', status: 'published' });
        now = Date.parse(d.deadlineAt!); await service.settleDueDrawings();
        expect((await state()).stats.drawings).toBe(1);
    });
    it('allows legacy revision omission only on untouched drafts, never over a saved revision', async () => {
        const strokes = [{ points: [{ x: 0, y: 0 }, { x: 50, y: 60 }], color: '#2563eb', width: 4 }];
        let d = (await action(0, 'drawing_start')).drawingWorkspace!.current!;
        await action(0, 'drawing_publish', { postId: d.id, strokes });
        d = (await action(0, 'drawing_start')).drawingWorkspace!.current!;
        await action(0, 'drawing_save', { postId: d.id, expectedRevision: 0, strokes });
        const before = await state();
        await expect(action(0, 'drawing_publish', { postId: d.id, strokes: [{ ...strokes[0], color: '#dc2626' }] })).rejects.toMatchObject({ response: { code: 'OFFICE_DRAWING_VERSION_CONFLICT' } });
        expect((await service.overview(users[0].id)).drawingWorkspace?.current).toMatchObject({ status: 'draft', revision: 1, strokes });
        expect((await state()).stats).toEqual(before.stats);
    });
    it.each(['drawing_save', 'drawing_publish'])('uses the post-lock clock when %s waits across its deadline', async kind => {
        const d = (await action(0, 'drawing_start')).drawingWorkspace!.current!;
        const strokes = [{ points: [{ x: 0, y: 0 }, { x: 50, y: 60 }], color: '#2563eb', width: 4 }];
        await action(0, 'drawing_save', { postId: d.id, expectedRevision: 0, strokes });
        const holder = db.createQueryRunner(); await holder.connect(); await holder.startTransaction();
        let queued: Promise<OfficeHubOverview> | undefined;
        try {
            const [{ pid }] = await holder.query('SELECT pg_backend_pid() pid');
            await holder.query('SELECT id FROM office_hub_posts WHERE id=$1 FOR UPDATE', [d.id]);
            now = Date.parse(d.deadlineAt!) - 1;
            queued = service.action(users[0].id, { action: kind, requestId: randomUUID(), postId: d.id, expectedRevision: 1, strokes: [{ ...strokes[0], color: '#dc2626' }] });
            void queued.catch(() => {});
            await waitForBlockedBy(Number(pid)); now = Date.parse(d.deadlineAt!) + 1;
            await holder.commitTransaction();
            const result = await queued;
            expect(result.drawingWorkspace?.current).toMatchObject({ status: 'published', submission: 'automatic', revision: 2, strokes });
            expect((await state()).stats.drawings).toBe(1);
        } finally { if (holder.isTransactionActive) await holder.rollbackTransaction(); await holder.release(); if (queued) await queued.catch(() => {}); }
    });
    it.each(['FEATURE_OFFICE_HUB_ENABLED', 'FEATURE_COMMUNITY_WRITES_ENABLED'])('rejects a draft save when %s closes during a real post-lock wait', async flag => {
        const d = (await action(0, 'drawing_start')).drawingWorkspace!.current!;
        const before = await state(), requestId = randomUUID();
        const holder = db.createQueryRunner(); await holder.connect(); await holder.startTransaction();
        let queued: Promise<OfficeHubOverview> | undefined;
        try {
            const [{ pid }] = await holder.query('SELECT pg_backend_pid() pid');
            await holder.query('SELECT id FROM office_hub_posts WHERE id=$1 FOR UPDATE', [d.id]);
            now += 1100;
            queued = service.action(users[0].id, { action: 'drawing_save', requestId, postId: d.id, expectedRevision: 0, strokes: [{ points: [{ x: 0, y: 0 }, { x: 50, y: 60 }], color: '#2563eb', width: 4 }] });
            void queued.catch(() => {});
            await waitForBlockedBy(Number(pid)); process.env[flag] = 'false';
            await holder.commitTransaction();
            await expect(queued).rejects.toMatchObject({ status: 503 });
            expect(await state()).toEqual(before);
            expect(await db.query('SELECT request_id FROM office_hub_receipts WHERE user_id=$1 AND request_id=$2', [users[0].id, requestId])).toEqual([]);
            const [{ state: stored }] = await db.query('SELECT state FROM office_hub_posts WHERE id=$1', [d.id]);
            expect(stored).toMatchObject({ revision: 0, strokes: [], published: false });
        } finally { if (holder.isTransactionActive) await holder.rollbackTransaction(); await holder.release(); if (queued) await queued.catch(() => {}); process.env[flag] = 'true'; }
    });
    it.each(['action', 'overview', 'sweep'])('rolls back %s settlement and receipts if maintenance closes at its final profile write', async flow => {
        const d = (await action(0, 'drawing_start')).drawingWorkspace!.current!;
        const strokes = [{ points: [{ x: 0, y: 0 }, { x: 50, y: 60 }], color: '#2563eb', width: 4 }];
        await action(0, 'drawing_save', { postId: d.id, expectedRevision: 0, strokes });
        now = flow === 'action' ? now + 1100 : Date.parse(d.deadlineAt!);
        const before = await state(), requestId = randomUUID();
        const original = EntityManager.prototype.query;
        const intercepted = jest.spyOn(EntityManager.prototype, 'query').mockImplementation(async function (this: EntityManager, sql: string, parameters?: unknown[]) {
            const result = await original.call(this, sql, parameters);
            if (sql.startsWith('UPDATE office_hub_profiles SET state=') && parameters?.[0] === users[0].id) process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'false';
            return result;
        });
        try {
            if (flow === 'sweep') await service.settleDueDrawings();
            else await expect(flow === 'overview' ? service.overview(users[0].id) : service.action(users[0].id, { action: 'drawing_publish', postId: d.id, expectedRevision: 1, strokes, requestId })).rejects.toMatchObject({ status: 503 });
            expect(await state()).toEqual(before);
            expect(await db.query('SELECT request_id FROM office_hub_receipts WHERE user_id=$1 AND request_id=$2', [users[0].id, requestId])).toEqual([]);
            const [{ state: stored }] = await db.query('SELECT state FROM office_hub_posts WHERE id=$1', [d.id]);
            expect(stored).toMatchObject({ revision: 1, strokes, published: false });
        } finally { intercepted.mockRestore(); process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'true'; }
    });
    it.each(['action', 'overview'])('rolls back %s after response projection when the office feature is disabled before commit', async flow => {
        const d = (await action(0, 'drawing_start')).drawingWorkspace!.current!;
        const strokes = [{ points: [{ x: 0, y: 0 }, { x: 50, y: 60 }], color: '#2563eb', width: 4 }];
        await action(0, 'drawing_save', { postId: d.id, expectedRevision: 0, strokes });
        now = flow === 'action' ? now + 1100 : Date.parse(d.deadlineAt!);
        const before = await state(), requestId = randomUUID(), original = EntityManager.prototype.query;
        const intercepted = jest.spyOn(EntityManager.prototype, 'query').mockImplementation(async function (this: EntityManager, sql: string, parameters?: unknown[]) {
            const result = await original.call(this, sql, parameters);
            if (sql.includes("kind='drawing' AND hidden=false ORDER BY created_at DESC,id DESC LIMIT 1") && parameters?.[0] === users[0].id) process.env.FEATURE_OFFICE_HUB_ENABLED = 'false';
            return result;
        });
        try {
            await expect(flow === 'overview' ? service.overview(users[0].id) : service.action(users[0].id, { action: 'drawing_publish', postId: d.id, expectedRevision: 1, strokes, requestId })).rejects.toMatchObject({ status: 503 });
            expect(await state()).toEqual(before);
            expect(await db.query('SELECT request_id FROM office_hub_receipts WHERE user_id=$1 AND request_id=$2', [users[0].id, requestId])).toEqual([]);
            const [{ state: stored }] = await db.query('SELECT state FROM office_hub_posts WHERE id=$1', [d.id]);
            expect(stored).toMatchObject({ revision: 1, strokes, published: false });
        } finally { intercepted.mockRestore(); process.env.FEATURE_OFFICE_HUB_ENABLED = 'true'; }
    });
    it('pauses automatic publication behind the write gate and processes saved art after reopening', async () => {
        const d = (await action(0, 'drawing_start')).drawingWorkspace!.current!;
        await action(0, 'drawing_save', { postId: d.id, expectedRevision: 0, strokes: [{ points: [{ x: 1, y: 2 }, { x: 4, y: 8 }], color: '#334155', width: 4 }] });
        now = Date.parse(d.deadlineAt!);
        process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'false';
        try { await service.settleDueDrawings(); expect((await service.overview(users[0].id)).drawingWorkspace?.current?.status).toBe('draft'); }
        finally { process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'true'; }
        await service.settleDueDrawings(); expect((await state()).stats.drawings).toBe(1);
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
        const tx=db.transaction(async m=>{await m.query('SELECT id FROM users WHERE id=$1 FOR NO KEY UPDATE',[users[0].id]);ready();await hold;});await locked;
        try{await action(1,'drawing_guess',{postId:d.id,guess:d.word});expect(await db.getRepository(WalletBalance).countBy({userId:users[0].id})).toBe(0);}finally{release();await tx;}
        expect((await action(0,'collect_social')).collection.socialPoints).toBe(5);
    },20000);
    it('does not impose the old daily save/publish/guess/general caps on drawing requests while retaining short-interval throttling',async()=>{
        await patch(0,p=>{p.counters={all:5000,drawing_start:999,drawing_save:999,drawing_publish:999};});
        const d=(await action(0,'drawing_start')).drawingWorkspace!.current!;
        const strokes=[{points:[{x:0,y:0},{x:20,y:30}],color:'#334155',width:4}];
        const saved=await action(0,'drawing_save',{postId:d.id,expectedRevision:0,strokes});
        now+=101;
        await expect(service.action(users[0].id,{requestId:randomUUID(),action:'drawing_save',postId:d.id,expectedRevision:1,strokes})).rejects.toMatchObject({response:{code:'OFFICE_RATE_LIMIT'}});
        await action(0,'drawing_publish',{postId:d.id,expectedRevision:1,strokes});
        expect(saved.drawingWorkspace?.dailyUsed).toBe(1000);
        expect((await state()).counters.all).toBe(5000);
        await patch(1,p=>{p.counters={all:5000,drawing_guess:999,drawing_rate:999};});
        await action(1,'drawing_guess',{postId:d.id,guess:'不正确的词'});
        expect((await action(1,'drawing_rate',{postId:d.id,rating:4})).drawings.find(x=>x.id===d.id)).toMatchObject({score:4,ratings:1,myRating:4,word:null});
    });
    it('does not consume the daily request allowance of unrelated office activities',async()=>{
        await patch(0,p=>{p.counters.all=1499;});
        const d=(await action(0,'drawing_start')).drawingWorkspace!.current!;
        await action(0,'drawing_publish',{postId:d.id,strokes:[{points:[{x:0,y:0},{x:20,y:30}],color:'#334155',width:4}]});
        expect((await state()).counters.all).toBe(1499);
        expect((await action(0,'daily_ticket')).collection.tickets).toBe(1);
        expect((await state()).counters.all).toBe(1500);
    });
    it('blocks additional stored artwork at capacity and permits creation after the owner explicitly deletes a historical drawing',async()=>{
        const d=(await action(0,'drawing_start')).drawingWorkspace!.current!;
        await action(0,'drawing_publish',{postId:d.id,strokes:[{points:[{x:0,y:0},{x:20,y:30}],color:'#334155',width:4}]});
        const [{state: drawing}]=await db.query('SELECT state FROM office_hub_posts WHERE id=$1',[d.id]);
        const ids=Array.from({length:OFFICE_DRAWING_STORAGE_LIMIT-1},()=>randomUUID());
        await db.query("INSERT INTO office_hub_posts(id,author_id,kind,state) SELECT id,$2,'drawing',$3::jsonb FROM unnest($1::uuid[]) id",[ids,users[0].id,JSON.stringify(drawing)]);
        const full=await service.overview(users[0].id);
        expect(full.drawingWorkspace).toMatchObject({storageUsed:1000,storageLimit:1000,canStart:false,capacityReason:'personal'});
        await expect(action(0,'drawing_start')).rejects.toMatchObject({response:{code:'OFFICE_DRAWING_CAPACITY'}});
        await action(0,'post_delete',{postId:ids[0]});
        expect((await action(0,'drawing_start')).drawingWorkspace).toMatchObject({storageUsed:1000,current:{status:'draft'}});
        expect((await state()).counters.drawing_start).toBe(2);
    });
    it('reports global storage protection distinctly without deleting any real artwork',async()=>{
        const d=(await action(0,'drawing_start')).drawingWorkspace!.current!;
        await action(0,'drawing_publish',{postId:d.id,strokes:[{points:[{x:0,y:0},{x:20,y:30}],color:'#334155',width:4}]});
        const [{state: drawing}]=await db.query('SELECT state FROM office_hub_posts WHERE id=$1',[d.id]);
        const ids=Array.from({length:OFFICE_DRAWING_GLOBAL_STORAGE_LIMIT-1},()=>randomUUID());
        // Synthetic records only: the dedicated test database is isolated.
        await db.query("INSERT INTO office_hub_posts(id,author_id,kind,state) SELECT id,$2,'drawing',$3::jsonb FROM unnest($1::uuid[]) id",[ids,users[0].id,JSON.stringify(drawing)]);
        expect((await service.overview(users[7].id)).drawingWorkspace).toMatchObject({storageUsed:0,canStart:false,capacityReason:'global'});
        await expect(action(7,'drawing_start')).rejects.toMatchObject({response:{code:'OFFICE_DRAWING_GLOBAL_CAPACITY'}});
        expect(await db.query("SELECT id FROM office_hub_posts WHERE author_id=$1 AND kind='drawing'",[users[0].id])).toHaveLength(5000);
    });
    it('requires actual guess participation, rejects self/invalid votes, updates one vote and never reveals an unsolved answer or voter identities',async()=>{
        const d=(await action(0,'drawing_start')).drawingWorkspace!.current!;
        await action(0,'drawing_publish',{postId:d.id,strokes:[{points:[{x:0,y:0},{x:20,y:30}],color:'#334155',width:4}]});
        await expect(action(0,'drawing_rate',{postId:d.id,rating:5})).rejects.toMatchObject({response:{code:'OFFICE_SELF_RATE'}});
        await expect(action(1,'drawing_rate',{postId:d.id,rating:5})).rejects.toMatchObject({response:{code:'OFFICE_DRAWING_RATE_PARTICIPATION_REQUIRED'}});
        await action(1,'drawing_guess',{postId:d.id,guess:'不正确的词'});
        for(const rating of [0,6,2.5,'3',null])await expect(action(1,'drawing_rate',{postId:d.id,rating})).rejects.toMatchObject({response:{code:'OFFICE_DRAWING_RATING_INVALID'}});
        const requestId=randomUUID();
        const vote=await action(1,'drawing_rate',{postId:d.id,rating:1},requestId);
        const mine=vote.drawings.find(x=>x.id===d.id)!;
        expect(mine).toMatchObject({word:null,canRate:true,score:1,ratings:1,myRating:1});
        expect(JSON.stringify(mine)).not.toContain(users[1].id);
        expect(mine).not.toHaveProperty('wordIndex'); expect(mine).not.toHaveProperty('guesses',expect.any(Object));
        expect((await action(1,'drawing_rate',{postId:d.id,rating:1},requestId)).drawings.find(x=>x.id===d.id)).toMatchObject({ratings:1});
        await expect(action(1,'drawing_rate',{postId:d.id,rating:2},requestId)).rejects.toMatchObject({response:{code:'OFFICE_IDEMPOTENCY_CONFLICT'}});
        await action(2,'drawing_guess',{postId:d.id,guess:'也不正确'});
        now+=1100;
        await Promise.all([service.action(users[1].id,{action:'drawing_rate',postId:d.id,rating:3,requestId:randomUUID()}),service.action(users[2].id,{action:'drawing_rate',postId:d.id,rating:5,requestId:randomUUID()})]);
        const outsider=(await service.overview(users[3].id)).drawings.find(x=>x.id===d.id)!;
        expect(outsider).toMatchObject({score:4,ratings:2,myRating:null,canRate:false,word:null});
        expect(await db.query('SELECT source FROM office_hub_social_awards WHERE user_id=ANY($1::uuid[])',[users.slice(0,3).map(u=>u.id)])).toEqual([]);
        expect(await db.getRepository(WalletBalance).countBy({userId:users[1].id})).toBe(0);
        await db.transaction(m=>cleanupOfficeHubUser(m,users[1].id));
        expect((await service.overview(users[3].id)).drawings.find(x=>x.id===d.id)).toMatchObject({score:5,ratings:1});
        const [{state:stored}]=await db.query('SELECT state FROM office_hub_posts WHERE id=$1',[d.id]);
        expect(stored.ratings).not.toHaveProperty(users[1].id); expect(stored.guesses).not.toHaveProperty(users[1].id);
    });
    it('does not permit drawing votes through blocked/hidden content, inactive accounts or disabled feature/write gates',async()=>{
        const d=(await action(0,'drawing_start')).drawingWorkspace!.current!;
        await action(0,'drawing_publish',{postId:d.id,strokes:[{points:[{x:0,y:0},{x:20,y:30}],color:'#334155',width:4}]});
        await action(1,'drawing_guess',{postId:d.id,guess:'不正确'});
        await db.getRepository(UserBlock).save({blockerId:users[1].id,blockedId:users[0].id});
        await expect(action(1,'drawing_rate',{postId:d.id,rating:5})).rejects.toMatchObject({response:{code:'OFFICE_RELATIONSHIP_BLOCKED'}});
        await db.getRepository(UserBlock).delete({blockerId:users[1].id,blockedId:users[0].id});
        await db.query('UPDATE office_hub_posts SET hidden=true WHERE id=$1',[d.id]);
        await expect(action(1,'drawing_rate',{postId:d.id,rating:5})).rejects.toMatchObject({response:{code:'OFFICE_POST_NOT_FOUND'}});
        await db.query('UPDATE office_hub_posts SET hidden=false WHERE id=$1',[d.id]);
        await db.getRepository(User).update(users[1].id,{accountStatus:'suspended'});
        await expect(action(1,'drawing_rate',{postId:d.id,rating:5})).rejects.toMatchObject({response:{code:'ACCOUNT_NOT_ACTIVE'}});
        await db.getRepository(User).update(users[1].id,{accountStatus:'active'});
        for(const flag of ['FEATURE_OFFICE_HUB_ENABLED','FEATURE_COMMUNITY_WRITES_ENABLED']){
            process.env[flag]='false';
            try{await expect(action(1,'drawing_rate',{postId:d.id,rating:5})).rejects.toMatchObject({status:503});}
            finally{process.env[flag]='true';}
        }
        const [{state:stored}]=await db.query('SELECT state FROM office_hub_posts WHERE id=$1',[d.id]);expect(stored.ratings).toEqual({});
    });
    it('rejects an oversized drawing-state write atomically while leaving legacy unknown fields readable',async()=>{
        const d=(await action(0,'drawing_start')).drawingWorkspace!.current!;
        await action(0,'drawing_publish',{postId:d.id,strokes:[{points:[{x:0,y:0},{x:20,y:30}],color:'#334155',width:4}]});
        await action(1,'drawing_guess',{postId:d.id,guess:'不正确'});
        const [{state:stored}]=await db.query('SELECT state FROM office_hub_posts WHERE id=$1',[d.id]);
        stored.unknownFutureField='x'.repeat(OFFICE_DRAWING_STATE_MAX_BYTES);
        await db.query('UPDATE office_hub_posts SET state=$2::jsonb WHERE id=$1',[d.id,JSON.stringify(stored)]);
        expect((await service.overview(users[1].id)).drawings.find(x=>x.id===d.id)?.word).toBeNull();
        await expect(action(1,'drawing_rate',{postId:d.id,rating:5})).rejects.toMatchObject({response:{code:'OFFICE_DRAWING_PARTICIPANT_CAPACITY'}});
        const [{state:after}]=await db.query('SELECT state FROM office_hub_posts WHERE id=$1',[d.id]);expect(after).toEqual(stored);
    });
    it('keeps five attempts per drawing and limits new participants without exposing other guesses',async()=>{
        const d=(await action(0,'drawing_start')).drawingWorkspace!.current!;
        await action(0,'drawing_publish',{postId:d.id,strokes:[{points:[{x:0,y:0},{x:20,y:30}],color:'#334155',width:4}]});
        for(let i=0;i<5;i++)await action(1,'drawing_guess',{postId:d.id,guess:'不正确'});
        await expect(action(1,'drawing_guess',{postId:d.id,guess:d.word})).rejects.toMatchObject({response:{code:'OFFICE_GUESS_LIMIT'}});
        await action(1,'drawing_rate',{postId:d.id,rating:3});
        const [{state:stored}]=await db.query('SELECT state FROM office_hub_posts WHERE id=$1',[d.id]);
        stored.guesses=Object.fromEntries(Array.from({length:OFFICE_DRAWING_PARTICIPANT_LIMIT},()=>[randomUUID(),{attempts:1,solved:false}]));
        await db.query('UPDATE office_hub_posts SET state=$2::jsonb WHERE id=$1',[d.id,JSON.stringify(stored)]);
        await expect(action(2,'drawing_guess',{postId:d.id,guess:'不正确'})).rejects.toMatchObject({response:{code:'OFFICE_DRAWING_PARTICIPANT_CAPACITY'}});
    });
    it('counts claimed drawing rewards toward daily generation, leaves old rewards intact and still accepts successful guesses after reward limits',async()=>{
        const drawings: OfficeHubOverview['drawings']=[];
        for(let i=0;i<2;i++){const d=(await action(0,'drawing_start')).drawingWorkspace!.current!;await action(0,'drawing_publish',{postId:d.id,strokes:[{points:[{x:0,y:0},{x:20,y:30}],color:'#334155',width:4}]});drawings.push(d);}
        for(let i=0;i<9;i++)await db.query("INSERT INTO office_hub_social_awards(user_id,source,points,claimed,created_at) VALUES($1,$2,10,true,$3)",[users[1].id,`guess:prior-${i}`,new Date(now)]);
        await db.query("INSERT INTO office_hub_social_awards(user_id,source,points,created_at) VALUES($1,'guess:legacy-unclaimed',10,$2)",[users[1].id,new Date(now-86400000)]);
        await action(1,'drawing_guess',{postId:drawings[0].id,guess:drawings[0].word});
        expect((await action(1,'collect_social')).collection.socialPoints).toBe(20);
        const second=await action(1,'drawing_guess',{postId:drawings[1].id,guess:drawings[1].word});
        expect(second.drawings.find(x=>x.id===drawings[1].id)).toMatchObject({solved:true,canRate:true});
        expect(second.notice).toMatch(/已达上限/);
        expect(await db.query('SELECT source FROM office_hub_social_awards WHERE user_id=$1',[users[1].id])).toHaveLength(11);
        expect((await state(1)).stats.correctGuesses).toBe(2);
    });
    it('does not generate additional drawing award rows while the existing pending queue is full',async()=>{
        const d=(await action(0,'drawing_start')).drawingWorkspace!.current!;
        await action(0,'drawing_publish',{postId:d.id,strokes:[{points:[{x:0,y:0},{x:20,y:30}],color:'#334155',width:4}]});
        await db.query("INSERT INTO office_hub_social_awards(user_id,source,points,created_at) SELECT $1,'spy:legacy-'||n,1,$2 FROM generate_series(1,200) n",[users[1].id,new Date(now-86400000)]);
        const solved=await action(1,'drawing_guess',{postId:d.id,guess:d.word});
        expect(solved.drawings.find(x=>x.id===d.id)?.solved).toBe(true);
        expect(await db.query('SELECT source FROM office_hub_social_awards WHERE user_id=$1',[users[1].id])).toHaveLength(200);
        expect(await db.query('SELECT source FROM office_hub_social_awards WHERE user_id=$1',[users[0].id])).toHaveLength(1);
    });
    it('serializes concurrent drawing award generation for the same recipient at the exact daily boundary',async()=>{
        await db.query("INSERT INTO office_hub_social_awards(user_id,source,points,claimed,created_at) SELECT $1,'guess:prior-'||n,5,true,$2 FROM generate_series(1,19) n",[users[0].id,new Date(now)]);
        const results=await Promise.all([db.transaction(m=>queueOfficeSocialAwards(m,[{userId:users[0].id,source:'draw:concurrent-a',points:5}],now)),db.transaction(m=>queueOfficeSocialAwards(m,[{userId:users[0].id,source:'draw:concurrent-b',points:5}],now))]);
        expect(results.flat().sort()).toEqual([false,true]);
        const [{points}]=await db.query("SELECT sum(points)::int points FROM office_hub_social_awards WHERE user_id=$1",[users[0].id]);expect(points).toBe(100);
    });
    it('finishes two cross-account guesses and a simultaneous collection without acquiring the other account profile lock',async()=>{
        const d0=(await action(0,'drawing_start')).drawingWorkspace!.current!;
        await action(0,'drawing_publish',{postId:d0.id,strokes:[{points:[{x:0,y:0},{x:20,y:30}],color:'#334155',width:4}]});
        const d1=(await action(1,'drawing_start')).drawingWorkspace!.current!;
        await action(1,'drawing_publish',{postId:d1.id,strokes:[{points:[{x:0,y:0},{x:20,y:30}],color:'#334155',width:4}]});
        now+=1100;
        const results=await Promise.all([service.action(users[0].id,{action:'drawing_guess',postId:d1.id,guess:d1.word,requestId:randomUUID()}),service.action(users[1].id,{action:'drawing_guess',postId:d0.id,guess:d0.word,requestId:randomUUID()})]);
        expect(results.every(v=>v.drawings.some(d=>d.solved))).toBe(true);
        expect(await db.query('SELECT source FROM office_hub_social_awards WHERE user_id=ANY($1::uuid[])',[users.slice(0,2).map(u=>u.id)])).toHaveLength(4);
        const d2=(await action(2,'drawing_start')).drawingWorkspace!.current!;
        await action(2,'drawing_publish',{postId:d2.id,strokes:[{points:[{x:0,y:0},{x:20,y:30}],color:'#334155',width:4}]});
        now+=1100;
        await Promise.all([service.action(users[0].id,{action:'drawing_guess',postId:d2.id,guess:d2.word,requestId:randomUUID()}),service.action(users[2].id,{action:'collect_social',requestId:randomUUID()})]);
        const [{count}]=await db.query('SELECT count(*)::int count FROM office_hub_social_awards WHERE user_id=$1 AND source=$2',[users[2].id,`draw:${d2.id}:${users[0].id}`]);expect(count).toBe(1);
    },20000);
    it('waits for author deletion before post locking and never resurrects deleted drawing/award/ratings state',async()=>{
        const d=(await action(0,'drawing_start')).drawingWorkspace!.current!;
        await action(0,'drawing_publish',{postId:d.id,strokes:[{points:[{x:0,y:0},{x:20,y:30}],color:'#334155',width:4}]});
        const holder=db.createQueryRunner();await holder.connect();await holder.startTransaction();
        let queued:Promise<OfficeHubOverview>|undefined;
        try{
            const [{pid}]=await holder.query('SELECT pg_backend_pid() pid');
            await holder.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[users[0].id]);
            now+=1100;queued=service.action(users[1].id,{action:'drawing_guess',postId:d.id,guess:d.word,requestId:randomUUID()});void queued.catch(()=>{});
            await waitForBlockedBy(Number(pid));
            await holder.query("UPDATE users SET account_status='deleted' WHERE id=$1",[users[0].id]);
            await cleanupOfficeHubUser(holder.manager,users[0].id);
            await holder.commitTransaction();
            await expect(queued).rejects.toMatchObject({response:{code:'OFFICE_POST_NOT_FOUND'}});
            expect(await db.query('SELECT id FROM office_hub_posts WHERE id=$1',[d.id])).toEqual([]);
            expect(await db.query('SELECT source FROM office_hub_social_awards WHERE user_id=ANY($1::uuid[])',[users.slice(0,2).map(u=>u.id)])).toEqual([]);
        }finally{if(holder.isTransactionActive)await holder.rollbackTransaction();await holder.release();if(queued)await queued.catch(()=>{});}
    },20000);
});
