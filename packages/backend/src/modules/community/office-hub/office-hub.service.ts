import { createHash, randomInt, randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { OFFICE_COLLECTION, OFFICE_HOURLY_EXP, OFFICE_STORY_STARTERS, OFFICE_WAVE_EXP, type OfficeAuthor, type OfficeDrawing, type OfficeHubOverview, type OfficeSpyView, type OfficeStory, type OfficeStroke, type OfficeWeeklyView } from '@stealth-reader/shared';
import { PlatformAssetsService } from '../../platform';
import { AdminAuditLog } from '../../../database/entities/admin-audit-log.entity';
import { assertCommunityWritesEnabled } from '../community-write-gate';
import { DRAW_WORDS, UNDERCOVER_WORDS } from '../play/engines/word-bank';
import { accrueOffice, actOfficeSpy, creditOfficeWaves, drawOffice, newOfficeProfile, normalizedOfficeWord, officeDay, officeRateLimit, officeStrokes, officeText, officeTheme, officeWeek, startOfficeSpy, type OfficeProfileState, type OfficeSpyState } from './office-hub.rules';
interface Author extends OfficeAuthor {
    userId: string | null;
}
interface StoryNode {
    id: string;
    parentId: string | null;
    text: string;
    author: Author;
    archived: boolean;
    archiveReason: string | null;
    ratings: Record<string, number>;
    createdAt: string;
}
interface StoryState {
    title: string;
    nodes: StoryNode[];
}
interface DrawingState {
    author: Author;
    theme: string;
    wordIndex: number;
    strokes: OfficeStroke[];
    published: boolean;
    startedAt: number;
    guesses: Record<string, {
        attempts: number;
        solved: boolean;
    }>;
    reports: string[];
    hidden: boolean;
}
interface Post {
    id: string;
    author_id: string | null;
    kind: 'story' | 'drawing' | 'spy';
    state: StoryState | DrawingState | OfficeSpyState;
    created_at: Date;
    cursor_at?: string;
    hidden: boolean;
    reports: string[];
}
const uuid = (value: unknown): string => { if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
    throw new BadRequestException({ code: 'OFFICE_ID_INVALID' }); return value; };
const enabled = (): boolean => process.env.FEATURE_OFFICE_HUB_ENABLED === 'true';
const random = (): number => randomInt(0, 1000000) / 1000000;
@Injectable()
export class OfficeHubService {
    constructor(private readonly db: DataSource, private readonly assets: PlatformAssetsService) { }
    private gate(): void { if (!enabled())
        throw new ServiceUnavailableException({ code: 'OFFICE_DISABLED' }); }
    async overview(userId: string,cursor?:string,kind?:string): Promise<OfficeHubOverview> {
        this.gate();
        if(kind!==undefined&&!['story','drawing','spy'].includes(kind))throw new BadRequestException({code:'OFFICE_PAGE_INVALID'});
        let before:{at:string;id:string}|undefined;
        if(cursor!==undefined){try{if(!kind||cursor.length>300||!/^[A-Za-z0-9_-]+$/.test(cursor))throw new Error();const parsed=JSON.parse(Buffer.from(cursor,'base64url').toString('utf8'));if(Object.keys(parsed).length!==2||typeof parsed.at!=='string'||parsed.at.length>50||!Number.isFinite(Date.parse(parsed.at)))throw new Error();before={at:parsed.at,id:uuid(parsed.id)};}catch{throw new BadRequestException({code:'OFFICE_PAGE_INVALID'});}}
        return this.db.transaction(async (m) => { const p = await this.profile(m, userId); return this.view(m, userId, p,null,{before,kind}); });
    }
    /** Internal only: never expose client-provided run scores, position, or waves as an HTTP command. */
    async recordTowerSettlement(m: EntityManager, userId: string, result: {
        runId: string;
        successfulWaves: number;
        promotionTier: number;
        score: number;
        stars: number;
        streak: number;
    }): Promise<void> {
        if (!enabled())
            return;
        for (const value of [result.successfulWaves, result.promotionTier, result.score, result.stars, result.streak])
            if (!Number.isSafeInteger(value) || value < 0)
                throw new Error('Invalid trusted tower settlement');
        if (result.successfulWaves > 1000 || result.promotionTier > 7 || result.stars > 3)
            throw new Error('Trusted tower settlement out of range');
        const p = await this.profile(m, userId);
        const now = Date.now();
        const membership = await this.membership(m, userId);
        const inserted = await m.query(`INSERT INTO office_hub_tower_events(run_id,user_id,guild_id,week,waves,score,stars,streak)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(run_id) DO NOTHING RETURNING run_id`, [uuid(result.runId), userId, membership?.guild_id ?? null, officeWeek(now), result.successfulWaves, result.score, result.stars, result.streak]);
        if (!inserted.length)
            return;
        creditOfficeWaves(p, result.successfulWaves, result.promotionTier, now);
        await this.save(m, userId, p);
    }
    async getAppearance(m: EntityManager, userId: string): Promise<{
        equipped: string | null;
        owned: string[];
    }> {
        if (!enabled())
            return { equipped: null, owned: [] };
        const [row] = await m.query('SELECT state FROM office_hub_profiles WHERE user_id=$1', [userId]);
        return { equipped: row?.state.equipped ?? null, owned: Object.keys(row?.state.owned ?? {}) };
    }
    async action(userId: string, raw: unknown): Promise<OfficeHubOverview> {
        this.gate();
        assertCommunityWritesEnabled();
        if (!raw || typeof raw !== 'object' || Array.isArray(raw))
            throw new BadRequestException({ code: 'OFFICE_COMMAND_INVALID' });
        const input = raw as Record<string, unknown>;
        const requestId = uuid(input.requestId);
        if (typeof input.action !== 'string' || input.action.length > 40)
            throw new BadRequestException({ code: 'OFFICE_COMMAND_INVALID' });
        const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
        return this.db.transaction(async (m) => {
            const p = await this.profile(m, userId);
            const now = Date.now();
            accrueOffice(p, now);
            const [receipt] = await m.query('SELECT request_hash,result FROM office_hub_receipts WHERE user_id=$1 AND request_id=$2', [userId, requestId]);
            if (receipt) {
                if (receipt.request_hash !== hash)
                    throw new ConflictException({ code: 'OFFICE_IDEMPOTENCY_CONFLICT' });
                return this.view(m, userId, p, receipt.result.notice);
            }
            const allowed: Record<string, string[]> = {
                daily_ticket: [], collect_social: [], exchange_ticket: [], draw: ['source', 'pool'], equip: ['itemId'],
                story_create: ['title', 'text', 'starter'], story_reply: ['postId', 'parentId', 'text'], story_rate: ['postId', 'nodeId', 'rating'],
                drawing_start: [], drawing_publish: ['postId', 'strokes'], drawing_guess: ['postId', 'guess'], post_delete: ['postId'], post_report: ['postId'], post_moderate: ['postId', 'hidden', 'reason'],
                spy_create: ['title', 'department'], spy_join: ['postId'], spy_leave: ['postId'], spy_start: ['postId'], spy_describe: ['postId', 'text'], spy_vote: ['postId', 'targetId'],
                announcement: ['text'], weekly_claim: [], boss_start: [], boss_hit: ['tool'], boss_claim: [],
            };
            const action = input.action as string;
            if (!Object.prototype.hasOwnProperty.call(allowed,action) || Object.keys(input).some((k) => !['requestId', 'action', ...allowed[action]].includes(k)))
                throw new BadRequestException({ code: 'OFFICE_COMMAND_INVALID' });
            if (/^(story_|drawing_|spy_|announcement)/.test(action)) {
                const [u] = await m.query('SELECT social_verification_status FROM users WHERE id=$1', [userId]);
                if (process.env.FEATURE_SOCIAL_VERIFICATION_ENABLED === 'true' && u.social_verification_status !== 'verified')
                    throw new ForbiddenException({ code: 'SOCIAL_VERIFICATION_REQUIRED' });
            }
            if (input.postId && action !== 'post_moderate') {
                const post = await this.post(m, uuid(input.postId));
                if (post.hidden && action !== 'post_delete')
                    throw new NotFoundException({ code: 'OFFICE_POST_NOT_FOUND' });
                if (post.author_id && await this.blocked(m, userId, post.author_id))
                    throw new ForbiddenException({ code: 'OFFICE_RELATIONSHIP_BLOCKED' });
                if (post.kind === 'spy')
                    for (const member of (post.state as OfficeSpyState).members)
                        if (await this.blocked(m, userId, member.userId))
                            throw new ForbiddenException({ code: 'OFFICE_RELATIONSHIP_BLOCKED' });
                if (post.kind === 'story' && (input.parentId || input.nodeId)) {
                    const n = (post.state as StoryState).nodes.find((n) => n.id === (input.parentId ?? input.nodeId));
                    if (n?.author.userId && await this.blocked(m, userId, n.author.userId))
                        throw new ForbiddenException({ code: 'OFFICE_RELATIONSHIP_BLOCKED' });
                }
            }
            officeRateLimit(p, 'all', now, 1500, 100);
            let notice = '已保存';
            if (action === 'daily_ticket') {
                if (p.dailyTicketClaimed)
                    throw new ConflictException({ code: 'OFFICE_ALREADY_CLAIMED' });
                p.dailyTicketClaimed = true;
                p.tickets += 1;
                notice = '今日免费限定券 +1，不占农场额度';
            }
            else if (action === 'collect_social') {
                const awards = await m.query('SELECT source,points FROM office_hub_social_awards WHERE user_id=$1 AND claimed=false ORDER BY created_at LIMIT 200 FOR UPDATE', [userId]);
                let sum = 0;
                for (const award of awards) {
                    const points = Math.min(award.points, 100 - p.socialEarnedToday);
                    if (points <= 0)
                        break;
                    p.socialPoints += points;
                    p.socialEarnedToday += points;
                    sum += points;
                    if (String(award.source).startsWith('spy:'))
                        p.stats.undercoverWins += 1;
                    if (String(award.source).startsWith('department-spy:'))
                        p.stats.departmentWins = (p.stats.departmentWins ?? 0) + 1;
                    await m.query('UPDATE office_hub_social_awards SET claimed=true WHERE user_id=$1 AND source=$2', [userId, award.source]);
                }
                notice = `社交积分 +${sum}，每日最多领取 100 分`;
            }
            else if (action === 'exchange_ticket') {
                if (p.socialPoints < 50 || p.socialExchangesToday >= 2)
                    throw new ConflictException({ code: 'OFFICE_EXCHANGE_LIMIT' });
                p.socialPoints -= 50;
                p.socialExchangesToday += 1;
                p.tickets += 1;
                notice = '50 社交积分已兑换 1 张限定券';
            }
            else if (action === 'draw') {
                if (typeof input.source!=='string'||typeof input.pool!=='string'||!['ticket', 'farm'].includes(input.source) || !['daily', 'standard'].includes(input.pool))
                    throw new BadRequestException({ code: 'OFFICE_COMMAND_INVALID' });
                const item = drawOffice(p, input.source as 'ticket' | 'farm', input.pool as 'daily' | 'standard', random, now);
                notice = `获得 ${OFFICE_COLLECTION.find((x) => x.id === item)!.name}，保底已保存`;
            }
            else if (action === 'equip') {
                if (input.itemId !== null && (typeof input.itemId !== 'string' || !OFFICE_COLLECTION.some((x) => x.id === input.itemId) || !p.owned[input.itemId]))
                    throw new ForbiddenException({ code: 'OFFICE_NOT_OWNED' });
                p.equipped = input.itemId as string | null;
            }
            else if (action === 'post_report' || action === 'post_moderate') {
                const post = await this.post(m, uuid(input.postId));
                if (action === 'post_report') {
                    officeRateLimit(p, 'post_report', now, 10, 1000);
                    if (post.author_id === userId)
                        throw new ForbiddenException({ code: 'OFFICE_SELF_REPORT' });
                    if (!post.reports.includes(userId))
                        post.reports.push(userId);
                    post.hidden = post.hidden || post.reports.length >= 3;
                    notice = '举报已记录，3 位不同同事举报后隐藏，管理员可复核';
                }
                else {
                    const [u] = await m.query('SELECT community_role FROM users WHERE id=$1', [userId]);
                    if (!['admin', 'moderator'].includes(u.community_role))
                        throw new ForbiddenException({ code: 'OFFICE_MODERATOR_REQUIRED' });
                    if (typeof input.hidden !== 'boolean')
                        throw new BadRequestException({ code: 'OFFICE_COMMAND_INVALID' });
                    const reason = officeText(input.reason, 5, 300);
                    await m.getRepository(AdminAuditLog).save({ actorId: userId, actorRole: u.community_role, action: 'office.post.moderate', targetType: 'office_post', targetId: post.id, reason, requestId, previousState: { hidden: post.hidden, reports: post.reports.length }, nextState: { hidden: input.hidden } });
                    post.hidden = input.hidden;
                    if (!post.hidden)
                        post.reports = [];
                    notice = '审核结果已记录到管理审计';
                }
                await m.query('UPDATE office_hub_posts SET hidden=$2,reports=$3::jsonb,updated_at=now() WHERE id=$1', [post.id, post.hidden, JSON.stringify(post.reports)]);
            }
            else if (action.startsWith('story_'))
                notice = await this.storyAction(m, userId, p, input, now);
            else if (action.startsWith('drawing_'))
                notice = await this.drawingAction(m, userId, p, input, now);
            else if (action.startsWith('spy_'))
                notice = await this.spyAction(m, userId, p, input, now);
            else if (action === 'post_delete') {
                const post = await this.post(m, uuid(input.postId));
                if (post.author_id !== userId)
                    throw new ForbiddenException({ code: 'OFFICE_OWNER_REQUIRED' });
                if (post.kind === 'spy') {
                    const s = post.state as OfficeSpyState;
                    s.phase = 'finished';
                    s.outcome = 'cancelled';
                    await this.savePost(m, post);
                }
                else if (post.kind === 'story' && (post.state as StoryState).nodes.some((n) => n.author.userId !== userId))
                    throw new ConflictException({ code: 'OFFICE_SHARED_STORY' });
                else
                    await m.query('DELETE FROM office_hub_posts WHERE id=$1', [post.id]);
            }
            else if (action === 'announcement') {
                const member = await this.membership(m, userId);
                if (member?.role !== 'owner')
                    throw new ForbiddenException({ code: 'OFFICE_OWNER_REQUIRED' });
                const text = officeText(input.text, 0, 300);
                await m.query('INSERT INTO office_hub_departments(guild_id,announcement) VALUES($1,$2) ON CONFLICT(guild_id) DO UPDATE SET announcement=$2,updated_at=now()', [member.guild_id, text]);
            }
            else if (action === 'weekly_claim') {
                const weekly = await this.weekly(m, userId, p, now);
                if (!weekly.guildId || weekly.myWaves < 2 || weekly.totalWaves < weekly.targetWaves || weekly.rewardClaimed)
                    throw new ConflictException({ code: 'OFFICE_WEEKLY_UNAVAILABLE' });
                p.weeklyClaims = [...p.weeklyClaims.slice(-51), weekly.week];
                p.stats.weeklyWins += 1;
                await this.creditCoins(m, userId, 30, `weekly:${weekly.week}`);
                notice = '部门周常完成：办公币 +30（每周仅一次，换部门不重复发）';
            }
            else if (action === 'boss_start') {
                if (p.boss.startedAt !== null || p.boss.claimed)
                    throw new ConflictException({ code: 'OFFICE_ALREADY_STARTED' });
                p.boss.startedAt = now;
                notice = '纸片小老板开始巡视，30 秒后自动完成，可随时离开再回来收取';
            }
            else if (action === 'boss_hit') {
                if (p.boss.startedAt === null || now >= p.boss.startedAt + 30000 || p.boss.claimed)
                    throw new ConflictException({ code: 'OFFICE_BOSS_NOT_RUNNING' });
                if (typeof input.tool!=='string'||!['keyboard', 'stapler', 'coffee'].includes(input.tool))
                    throw new BadRequestException({ code: 'OFFICE_COMMAND_INVALID' });
                if (now - p.boss.lastHitAt < 900 || p.boss.hits >= 30)
                    throw new ConflictException({ code: 'OFFICE_RATE_LIMIT' });
                p.boss.hits += 1;
                p.boss.lastHitAt = now;
                const base = input.tool === 'keyboard' ? 8 : input.tool === 'stapler' ? 5 : 6;
                const critical = random() < .2;
                p.boss.damage += base * (critical ? 3 : 1);
                notice = `${critical ? '暴击！' : ''}${base * (critical ? 3 : 1)} 点纸片压力已释放`;
            }
            else if (action === 'boss_claim') {
                if (p.boss.startedAt === null || now < p.boss.startedAt + 30000 || p.boss.claimed)
                    throw new ConflictException({ code: 'OFFICE_BOSS_UNAVAILABLE' });
                p.boss.claimed = true;
                p.stats.bossDays += 1;
                await this.creditCoins(m, userId, 20, `boss:${p.day}`);
                // Profile day claim + command receipt serialize this non-idempotent primitive in the same transaction.
                await this.assets.addExperience(m, userId, 5);
                notice = '巡视结束，办公币 +20、职场经验 +5；不操作也有相同奖励';
            }
            await this.save(m, userId, p);
            await m.query('INSERT INTO office_hub_receipts(user_id,request_id,request_hash,result) VALUES($1,$2,$3,$4::jsonb)', [userId, requestId, hash, JSON.stringify({ notice })]);
            return this.view(m, userId, p, notice);
        });
    }
    private async profile(m: EntityManager, userId: string): Promise<OfficeProfileState> {
        const [user] = await m.query('SELECT id,account_status FROM users WHERE id=$1 FOR UPDATE', [userId]);
        if (!user || user.account_status !== 'active')
            throw new ForbiddenException({ code: 'ACCOUNT_NOT_ACTIVE' });
        const now = Date.now(); // Clock after user serialization, including midnight-crossing queued requests.
        let [row] = await m.query('SELECT state FROM office_hub_profiles WHERE user_id=$1 FOR UPDATE', [userId]);
        if (!row) {
            const initial = newOfficeProfile(now);
            const [tower] = await m.query('SELECT promotion_tier FROM tower_defense_profiles WHERE user_id=$1', [userId]);
            initial.promotionTier = Math.max(0, Math.min(7, Number(tower?.promotion_tier ?? 0)));
            await m.query('INSERT INTO office_hub_profiles(user_id,state,created_at,updated_at) VALUES($1,$2::jsonb,$3,$3)', [userId, JSON.stringify(initial), new Date(now)]);
            row = { state: initial };
        }
        const p = row.state as OfficeProfileState;
        accrueOffice(p, now);
        return p;
    }
    private save(m: EntityManager, userId: string, p: OfficeProfileState) { return m.query('UPDATE office_hub_profiles SET state=$2::jsonb,updated_at=now() WHERE user_id=$1', [userId, JSON.stringify(p)]); }
    private async blocked(m: EntityManager, left: string, right: string): Promise<boolean> { if (left === right)
        return false; const rows = await m.query('SELECT 1 FROM user_blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1) LIMIT 1', [left, right]); return rows.length > 0; }
    private async author(m: EntityManager, userId: string): Promise<Author> { const [u] = await m.query('SELECT public_id,display_name,username FROM users WHERE id=$1', [userId]); return { userId, publicId: u.public_id, displayName: u.display_name ?? u.username ?? '同事' }; }
    private async membership(m: EntityManager, userId: string): Promise<{
        guild_id: string;
        role: string;
        name: string;
    } | null> { const [r] = await m.query('SELECT gm.guild_id,gm.role,g.name FROM guild_members gm JOIN guilds g ON g.id=gm.guild_id WHERE gm.user_id=$1', [userId]); return r ?? null; }
    private async post(m: EntityManager, id: string, kind?: string): Promise<Post> { const [p] = await m.query('SELECT * FROM office_hub_posts WHERE id=$1 FOR UPDATE', [id]); if (!p || kind && p.kind !== kind)
        throw new NotFoundException({ code: 'OFFICE_POST_NOT_FOUND' }); return p; }
    private savePost(m: EntityManager, p: Post) { return m.query('UPDATE office_hub_posts SET state=$2::jsonb,updated_at=now() WHERE id=$1', [p.id, JSON.stringify(p.state)]); }
    private async createPost(m: EntityManager, userId: string, kind: Post['kind'], state: Post['state']) { const id = randomUUID(); await m.query('INSERT INTO office_hub_posts(id,author_id,kind,state) VALUES($1,$2,$3,$4::jsonb)', [id, userId, kind, JSON.stringify(state)]); return id; }
    private async award(m: EntityManager, userId: string | null, source: string, points: number): Promise<void> { if (userId)
        await m.query('INSERT INTO office_hub_social_awards(user_id,source,points) SELECT id,$2,$3 FROM users WHERE id=$1 AND account_status=\'active\' ON CONFLICT DO NOTHING', [userId, source, points]); }
    private async creditCoins(m: EntityManager, userId: string, amount: number, source: string) { await this.assets.ensurePlatformState(m, userId); await this.assets.creditWallet(m, userId, 'office_coin', amount, { sourceType: 'office_hub', sourceId: source, reason: 'free-office-activity-v1', idempotencyKey: `office:${userId}:${source}` }); }
    private async storyAction(m: EntityManager, userId: string, p: OfficeProfileState, input: Record<string, unknown>, now: number): Promise<string> {
        officeRateLimit(p, String(input.action), now, input.action === 'story_create' ? 3 : 30, 1000);
        const author = await this.author(m, userId);
        if (input.action === 'story_create') {
            const title = officeText(input.title, 2, 60);
            const starter = input.starter;
            const text = starter === undefined ? officeText(input.text, 5, 500) : Number.isInteger(starter) && Number(starter) >= 0 && Number(starter) < OFFICE_STORY_STARTERS.length ? OFFICE_STORY_STARTERS[Number(starter)] : null;
            if (!text)
                throw new BadRequestException({ code: 'OFFICE_STARTER_INVALID' });
            await this.createPost(m, userId, 'story', { title, nodes: [{ id: randomUUID(), parentId: null, text, author, archived: false, archiveReason: null, ratings: {}, createdAt: new Date(now).toISOString() }] });
            p.stats.stories += 1;
            return '故事已发布，同事可以从任意节点续写';
        }
        const post = await this.post(m, uuid(input.postId), 'story');
        const s = post.state as StoryState;
        if (input.action === 'story_reply') {
            const parent = s.nodes.find((n) => n.id === uuid(input.parentId));
            if (!parent || parent.archived)
                throw new ConflictException({ code: 'OFFICE_BRANCH_ARCHIVED' });
            const grand = s.nodes.find((n) => n.id === parent.parentId);
            if (parent.author.userId === userId && grand?.author.userId === userId)
                throw new ConflictException({ code: 'OFFICE_STORY_CONSECUTIVE_LIMIT' });
            if (s.nodes.length >= 128)
                throw new ConflictException({ code: 'OFFICE_STORY_FULL' });
            const node: StoryNode = { id: randomUUID(), parentId: parent.id, text: officeText(input.text, 5, 500), author, archived: false, archiveReason: null, ratings: {}, createdAt: new Date(now).toISOString() };
            const siblings = s.nodes.filter((n) => n.parentId === parent.id && !n.archived);
            if (siblings.length >= 5) {
                siblings.sort((a, b) => this.rating(a) - this.rating(b) || a.createdAt.localeCompare(b.createdAt));
                this.archiveStory(s, siblings[0].id, '分支超过 5 条：按最低评分、最早发布归档');
            }
            s.nodes.push(node);
            p.stats.stories += 1;
        }
        else {
            const n = s.nodes.find((n) => n.id === uuid(input.nodeId));
            const rating = input.rating;
            if (!n || !Number.isInteger(rating) || Number(rating) < 1 || Number(rating) > 5)
                throw new BadRequestException({ code: 'OFFICE_RATING_INVALID' });
            if (n.author.userId === userId)
                throw new ForbiddenException({ code: 'OFFICE_SELF_RATING' });
            if (n.ratings[userId] !== undefined)
                throw new ConflictException({ code: 'OFFICE_ALREADY_ACTED' });
            n.ratings[userId] = Number(rating);
            if (Object.keys(n.ratings).length >= 3 && this.rating(n) < 2)
                this.archiveStory(s, n.id, '至少 3 位读者评分，连续性均分低于 2 分');
        }
        await this.savePost(m, post);
        return '故事分支已保存；归档内容可查，不抹掉共同创作';
    }
    private rating(n: StoryNode): number { const v = Object.values(n.ratings); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 3; }
    private archiveStory(s: StoryState, id: string, reason: string): void { const ids = new Set([id]); for (let i = 0; i < s.nodes.length; i++)
        for (const n of s.nodes)
            if (n.parentId && ids.has(n.parentId))
                ids.add(n.id); for (const n of s.nodes)
        if (ids.has(n.id)) {
            n.archived = true;
            n.archiveReason = reason;
        } }
    private async drawingAction(m: EntityManager, userId: string, p: OfficeProfileState, input: Record<string, unknown>, now: number): Promise<string> {
        officeRateLimit(p, String(input.action), now, input.action === 'drawing_start' ? 3 : 100, 700);
        if (input.action === 'drawing_start') {
            const wordIndex = 8 + randomInt(0, 28);
            await this.createPost(m, userId, 'drawing', { author: await this.author(m, userId), theme: officeTheme(now).theme, wordIndex, strokes: [], published: false, startedAt: now, guesses: {}, reports: [], hidden: false });
            return '绘画任务已领取：2 分钟内提交，只画图形，不写文字';
        }
        const post = await this.post(m, uuid(input.postId), 'drawing'), d = post.state as DrawingState;
        if (input.action === 'drawing_publish') {
            if (post.author_id !== userId)
                throw new ForbiddenException({ code: 'OFFICE_OWNER_REQUIRED' });
            if (d.published || now > d.startedAt + 120000)
                throw new ConflictException({ code: 'OFFICE_DRAWING_EXPIRED' });
            d.strokes = officeStrokes(input.strokes);
            d.published = true;
            p.stats.drawings += 1;
        }
        else {
            if (!d.published || d.hidden)
                throw new NotFoundException({ code: 'OFFICE_POST_NOT_FOUND' });
            if (post.author_id === userId)
                throw new ForbiddenException({ code: 'OFFICE_SELF_GUESS' });
            {
                const guess = d.guesses[userId] ?? { attempts: 0, solved: false };
                if (guess.solved || guess.attempts >= 5)
                    throw new ConflictException({ code: 'OFFICE_GUESS_LIMIT' });
                guess.attempts += 1;
                guess.solved = normalizedOfficeWord(officeText(input.guess, 1, 30)) === normalizedOfficeWord(DRAW_WORDS[d.wordIndex].word);
                d.guesses[userId] = guess;
                if (guess.solved) {
                    p.stats.correctGuesses += 1;
                    await this.award(m, userId, `guess:${post.id}`, 10);
                    await this.award(m, post.author_id, `draw:${post.id}:${userId}`, 5);
                }
                await this.savePost(m, post);
                return guess.solved ? '猜中了！可在收藏页领取社交积分' : '再想想，还剩 ' + (5 - guess.attempts) + ' 次';
            }
        }
        await this.savePost(m, post);
        return '画作已挂到异步猜画墙';
    }
    private async spyAction(m: EntityManager, userId: string, p: OfficeProfileState, input: Record<string, unknown>, now: number): Promise<string> {
        officeRateLimit(p, String(input.action), now, input.action === 'spy_create' ? 3 : 100, 500);
        const author = await this.author(m, userId);
        if (input.action === 'spy_create') {
            const member = await this.membership(m, userId);
            if (input.department !== undefined && typeof input.department !== 'boolean')
                throw new BadRequestException({ code: 'OFFICE_COMMAND_INVALID' });
            if (input.department && !member)
                throw new ForbiddenException({ code: 'OFFICE_DEPARTMENT_REQUIRED' });
            const pair = UNDERCOVER_WORDS[12 + (Math.floor((now + 8 * 3600000) / 86400000) % (UNDERCOVER_WORDS.length - 12))];
            await this.createPost(m, userId, 'spy', { title: officeText(input.title, 2, 50), theme: officeTheme(now).theme, phase: 'waiting', round: 0, members: [{ userId, publicId: author.publicId!, name: author.displayName, role: 'civilian', alive: true }], descriptions: [], votes: {}, words: [pair.words[0], pair.words[1]], ownerId: userId, expiresAt: now + 86400000, guildId: input.department ? member!.guild_id : null, outcome: null });
            return '异步描述局已创建，3—8 人，6 人起设 2 位卧底';
        }
        const post = await this.post(m, uuid(input.postId), 'spy'), s = post.state as OfficeSpyState;
        if (now > s.expiresAt) {
            s.phase = 'finished';
            s.outcome = 'cancelled';
            await this.savePost(m, post);
            return '本局已超过 24 小时，自动归档，不扣资源';
        }
        if (s.guildId && (await this.membership(m, userId))?.guild_id !== s.guildId)
            throw new ForbiddenException({ code: 'OFFICE_DEPARTMENT_REQUIRED' });
        if (input.action === 'spy_join') {
            if (s.phase !== 'waiting' || s.members.length >= 8 || s.members.some((x) => x.userId === userId))
                throw new ConflictException({ code: 'OFFICE_SPY_JOIN_INVALID' });
            s.members.push({ userId, publicId: author.publicId!, name: author.displayName, role: 'civilian', alive: true });
        }
        else if (input.action === 'spy_leave') {
            const member = s.members.find((x) => x.userId === userId);
            if (!member)
                throw new ForbiddenException({ code: 'OFFICE_SPY_NOT_ACTIVE' });
            if (s.phase === 'waiting') {
                s.members = s.members.filter((x) => x.userId !== userId);
                if (s.ownerId === userId) {
                    s.ownerId = s.members[0]?.userId ?? '';
                    post.author_id = s.members[0]?.userId ?? null;
                    await m.query('UPDATE office_hub_posts SET author_id=$2 WHERE id=$1', [post.id, post.author_id]);
                }
                if (!s.members.length) {
                    s.phase = 'finished';
                    s.outcome = 'cancelled';
                }
            }
            else {
                s.phase = 'finished';
                s.outcome = 'cancelled';
            } // Async game cannot silently hold remaining players hostage.
        }
        else if (input.action === 'spy_start')
            startOfficeSpy(s, userId, random, now);
        else {
            const before = s.phase;
            actOfficeSpy(s, userId, input.action === 'spy_describe' ? 'describe' : 'vote', input.action === 'spy_describe' ? input.text : input.targetId);
            if (before !== 'finished' && s.phase === 'finished' && s.outcome !== 'cancelled')
                for (const member of s.members) {
                    if (member.role === s.outcome) {
                        await this.award(m, member.userId, `spy:${post.id}`, 15);
                        if (s.guildId)
                            await this.award(m, member.userId, `department-spy:${post.id}`, 5);
                    }
                }
        }
        await this.savePost(m, post);
        return s.phase === 'finished' ? '本局已归档，可查看角色与结果' : '已保存；不需所有人同时在线，齐人后自动推进';
    }
    private async weekly(m: EntityManager, userId: string, p: OfficeProfileState, now: number): Promise<OfficeWeeklyView> {
        const member = await this.membership(m, userId), week = officeWeek(now);
        const departments = await m.query(`SELECT g.id,g.name,COALESCE(sum(e.waves),0)::int waves FROM guilds g JOIN office_hub_tower_events e ON e.guild_id=g.id AND e.week=$1 GROUP BY g.id ORDER BY waves DESC,g.name LIMIT 20`, [week]);
        const departmentProfiles: {guild_id:string;state:OfficeProfileState}[] = departments.length ? await m.query('SELECT gm.guild_id,p.state FROM office_hub_profiles p JOIN guild_members gm ON gm.user_id=p.user_id JOIN users u ON u.id=p.user_id WHERE gm.guild_id=ANY($1::uuid[]) AND u.account_status=\'active\'', [departments.map((d:{id:string})=>d.id)]) : [];
        const reputation = (state:OfficeProfileState) => Object.keys(state.owned).length * 10 + (state.stats.departmentWins ?? 0) * 5;
        const base: OfficeWeeklyView = { guildId: member?.guild_id ?? null, guildName: member?.name ?? null, week, announcement: '', canEdit: member?.role === 'owner', totalWaves: 0, targetWaves: 40, rewardClaimed: p.weeklyClaims.includes(week), myWaves: 0, reputation: 0, leaderboard: [], departments: departments.map((d: { id:string; name: string; waves: number }) => ({ name:d.name,waves:d.waves,reputation:departmentProfiles.filter(p=>p.guild_id===d.id).reduce((sum,p)=>sum+reputation(p.state),0) })) };
        if (!member)
            return base;
        const [announcement] = await m.query('SELECT announcement FROM office_hub_departments WHERE guild_id=$1', [member.guild_id]);
        base.announcement = announcement?.announcement ?? '';
        const rows = await m.query(`SELECT e.user_id,u.public_id,COALESCE(u.display_name,u.username,'同事') name,sum(e.waves)::int waves,max(e.score)::int score,max(e.stars)::int stars,max(e.streak)::int streak FROM office_hub_tower_events e JOIN users u ON u.id=e.user_id WHERE e.guild_id=$1 AND e.week=$2 AND u.account_status='active' GROUP BY e.user_id,u.public_id,u.display_name,u.username ORDER BY waves DESC,score DESC,u.public_id`, [member.guild_id, week]);
        base.totalWaves = rows.reduce((sum: number, r: {
            waves: number;
        }) => sum + r.waves, 0);
        base.myWaves = rows.find((r: {
            user_id: string;
        }) => r.user_id === userId)?.waves ?? 0;
        base.leaderboard = rows.slice(0, 30).map((r: {
            public_id: string;
            name: string;
            waves: number;
            score: number;
            stars: number;
            streak: number;
        }, i: number) => ({ rank: i + 1, author: { publicId: r.public_id, displayName: r.name }, waves: r.waves, score: r.score, stars: r.stars, streak: r.streak }));
        for (let i = 0; i < base.leaderboard.length; i++)
            if (await this.blocked(m, userId, rows[i].user_id))
                base.leaderboard[i].author = { publicId: null, displayName: '已屏蔽同事' };
        const profiles = await m.query('SELECT p.state FROM office_hub_profiles p JOIN guild_members gm ON gm.user_id=p.user_id JOIN users u ON u.id=p.user_id WHERE gm.guild_id=$1 AND u.account_status=\'active\'', [member.guild_id]);
        base.reputation = profiles.reduce((sum: number, r: {
            state: OfficeProfileState;
        }) => sum + reputation(r.state), 0);
        return base;
    }
    private async view(m: EntityManager, userId: string, p: OfficeProfileState, notice: string | null = null,page?:{before?:{at:string;id:string};kind?:string}): Promise<OfficeHubOverview> {
        const now = Date.now();
        accrueOffice(p, now);
        const [viewer] = await m.query('SELECT community_role FROM users WHERE id=$1', [userId]);
        const moderator = ['admin', 'moderator'].includes(viewer.community_role);
        const blockRows = await m.query('SELECT blocker_id,blocked_id FROM user_blocks WHERE blocker_id=$1 OR blocked_id=$1', [userId]);
        const blocked = new Set<string>(blockRows.map((r: {
            blocker_id: string;
            blocked_id: string;
        }) => r.blocker_id === userId ? r.blocked_id : r.blocker_id));
        let posts: Post[];
        let nextCursor:string|null=null;
        if(page?.kind){
            posts=await m.query(`SELECT *,created_at::text cursor_at FROM office_hub_posts WHERE kind=$1 AND (hidden=false OR $2::boolean) AND ($3::timestamptz IS NULL OR (created_at,id)<($3::timestamptz,$4::uuid)) ORDER BY created_at DESC,id DESC LIMIT 31`,[page.kind,moderator,page.before?.at??null,page.before?.id??null]);
            if(posts.length>30){posts=posts.slice(0,30);const last=posts[29];nextCursor=Buffer.from(JSON.stringify({at:last.cursor_at,id:last.id})).toString('base64url');}
        }else posts=await m.query(`SELECT * FROM (SELECT *,row_number() OVER(PARTITION BY kind ORDER BY created_at DESC,id DESC) n FROM office_hub_posts WHERE (hidden=false OR $1::boolean)) x WHERE n<=30 ORDER BY created_at DESC,id DESC`,[moderator]);
        const stories: OfficeStory[] = [], drawings: OfficeDrawing[] = [], spies: OfficeSpyView[] = [];
        const member = await this.membership(m, userId);
        for (const post of posts) {
            if (post.hidden || post.author_id && blocked.has(post.author_id))
                continue;
            if (post.kind === 'story')
                for (const n of (post.state as StoryState).nodes)
                    if (n.author.userId && blocked.has(n.author.userId)) {
                        n.text = '该段内容不可见';
                        n.author = { userId: null, publicId: null, displayName: '已屏蔽同事' };
                    }
            if (post.kind === 'spy' && (post.state as OfficeSpyState).members.some((m) => blocked.has(m.userId)))
                continue;
            if (post.kind === 'story') {
                const s = post.state as StoryState;
                stories.push({ id: post.id, title: s.title, mine: post.author_id === userId, createdAt: new Date(post.created_at).toISOString(), nodes: s.nodes.map((n) => ({ id: n.id, parentId: n.parentId, text: n.text, author: { publicId: n.author.publicId, displayName: n.author.displayName }, mine: n.author.userId === userId, archived: n.archived, archiveReason: n.archiveReason, score: Object.keys(n.ratings).length ? this.rating(n) : null, ratings: Object.keys(n.ratings).length, myRating: n.ratings[userId] ?? null, createdAt: n.createdAt })) });
            }
            if (post.kind === 'drawing') {
                const d = post.state as DrawingState, mine = post.author_id === userId;
                if (d.hidden || !d.published && (!mine || now > d.startedAt + 120000))
                    continue;
                const g = d.guesses[userId];
                drawings.push({ id: post.id, author: { publicId: d.author.publicId, displayName: d.author.displayName }, mine, theme: d.theme, strokes: d.strokes, word: mine || g?.solved ? DRAW_WORDS[d.wordIndex].word : null, wordLength: DRAW_WORDS[d.wordIndex].word.length, guesses: Object.values(d.guesses).filter((x) => x.solved).length, solved: g?.solved ?? false, attempts: g?.attempts ?? 0, createdAt: new Date(post.created_at).toISOString() });
            }
            if (post.kind === 'spy') {
                const s = post.state as OfficeSpyState;
                if (s.guildId && s.guildId !== member?.guild_id)
                    continue;
                const me = s.members.find((x) => x.userId === userId);
                const expired = now > s.expiresAt && s.phase !== 'finished';
                const finished = s.phase === 'finished' || expired;
                spies.push({ id: post.id, title: s.title, theme: s.theme, phase: expired ? 'finished' : s.phase, round: s.round, owner: s.ownerId === userId, joined: Boolean(me), meId: me?.publicId ?? null, word: me && s.phase !== 'waiting' ? s.words[me.role === 'undercover' ? 1 : 0] : null, myVote: s.votes[userId] ?? null, outcome: expired ? 'cancelled' : s.outcome, members: s.members.map((x) => ({ id: x.publicId, name: x.name, alive: x.alive, described: s.descriptions.some((d) => d.round === s.round && d.playerId === x.publicId), voted: Boolean(s.votes[x.userId]), role: finished ? x.role : null })), descriptions: me || finished ? s.descriptions : [], expiresAt: new Date(s.expiresAt).toISOString(), guildGame: Boolean(s.guildId) });
            }
        }
        const moderation=moderator?posts.filter(x=>x.kind!=='drawing'||(x.state as DrawingState).published).map(x=>({id:x.id,kind:x.kind,title:'title' in x.state?x.state.title:'异步画作',hidden:x.hidden,reports:x.reports.length,preview:x.kind==='story'?(x.state as StoryState).nodes.map(n=>n.text).join('\n\n').slice(0,5000):x.kind==='spy'?(x.state as OfficeSpyState).descriptions.map(d=>d.text).join('\n').slice(0,5000):'已发布的画作，不展示题目答案',strokes:x.kind==='drawing'?(x.state as DrawingState).strokes:undefined})):null;
        return {page:{nextCursor,historical:Boolean(page?.before)},serverTime: new Date(now).toISOString(), collection: { day: p.day, promotionTier: p.promotionTier, hourlyExp: OFFICE_HOURLY_EXP[p.promotionTier], waveExp: OFFICE_WAVE_EXP[p.promotionTier], farmExp: Math.max(0, Math.floor(p.farmEarned) - p.farmSpent), farmEarned: Math.floor(p.farmEarned), farmDraws: p.farmSpent / 100, creditedWaves: p.creditedWaves, tickets: p.tickets, dailyTicketClaimed: p.dailyTicketClaimed, socialPoints: p.socialPoints, socialEarnedToday: p.socialEarnedToday, socialExchangesToday: p.socialExchangesToday, pityR: p.pityR, pitySSR: p.pitySSR, draws: p.draws, owned: p.owned, equipped: p.equipped, lastDraw: p.lastDraw, reputation: Object.keys(p.owned).length * 10, ...officeTheme(now) }, weekly: await this.weekly(m, userId, p, now), boss: { startedAt: p.boss.startedAt === null ? null : new Date(p.boss.startedAt).toISOString(), endsAt: p.boss.startedAt === null ? null : new Date(p.boss.startedAt + 30000).toISOString(), hits: p.boss.hits, damage: p.boss.damage, claimed: p.boss.claimed, rewardCoins: 20 }, stories, drawings, spies, notice, moderation };
    }
}
