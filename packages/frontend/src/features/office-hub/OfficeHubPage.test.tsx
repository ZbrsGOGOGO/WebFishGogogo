import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { OfficeHubOverview, OfficeSpyView } from '@stealth-reader/shared';
import { officeHubApi } from '../../api/office-hub';
import { OfficeHubPage, OfficeBossPage } from './OfficeHubPage';
const session = vi.hoisted(() => ({ generation: 0 }));
vi.mock('../../api/office-hub', () => ({ officeHubApi: { overview: vi.fn(), action: vi.fn() }, officeHubError: (e: unknown) => e instanceof Error ? e.message : '请求失败' }));
vi.mock('../../api/community-http', () => ({ getCommunitySessionGeneration: () => session.generation }));
vi.mock('../../app/store/community-auth-store',()=>({useCommunityAuthStore:(select:(state:{user:{publicId:string}})=>unknown)=>select({user:{publicId:`test-account-${session.generation}`}})}));
vi.mock('../office-battle/CommunityGuildPanel', () => ({ CommunityGuildPanel: () => <section>现有公司档案与加入入口</section> }));
function fixture(): OfficeHubOverview {
    return {
        serverTime: new Date().toISOString(), notice: null, moderation: null,
        collection: { day: '2026-09-09', promotionTier: 0, hourlyExp: 40, waveExp: 150, farmExp: 0, farmEarned: 0, farmDraws: 0, creditedWaves: 0, tickets: 0, dailyTicketClaimed: false, socialPoints: 0, socialEarnedToday: 0, socialExchangesToday: 0, pityR: 0, pitySSR: 0, draws: 0, owned: {}, equipped: null, lastDraw: null, reputation: 0, dailyUp: 'skin-mint', theme: '茶水间故事' },
        weekly: { guildId: null, guildName: null, week: '2026-09-07', announcement: '', canEdit: false, totalWaves: 0, targetWaves: 40, rewardClaimed: false, myWaves: 0, reputation: 0, leaderboard: [], departments: [] },
        boss: { startedAt: null, endsAt: null, hits: 0, damage: 0, claimed: false, rewardCoins: 20 }, stories: [], drawings: [], spies: [],
    };
}
function page(tab = 'company', view = fixture()) { vi.mocked(officeHubApi.overview).mockResolvedValue(view); return render(<MemoryRouter initialEntries={[`/office?tab=${tab}`]}><OfficeHubPage /></MemoryRouter>); }
beforeEach(() => { session.generation = 0; vi.clearAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });
describe('Office workspace functional controls', () => {
    it('exposes all six working sections and reuses the existing company membership / economy panel', async () => {
        page();
        expect(await screen.findByText('现有公司档案与加入入口')).toBeInTheDocument();
        const nav = screen.getByRole('navigation', { name: '公司工作台功能' });
        expect(within(nav).getAllByRole('button')).toHaveLength(6);
        fireEvent.click(within(nav).getByRole('button', { name: '故事接龙' }));
        expect(await screen.findByRole('button', { name: '发布故事（每天最多 3 篇）' })).toBeInTheDocument();
        expect(screen.queryByText(/网站内容审核/)).not.toBeInTheDocument();
    });
    it('claims the actual server daily ticket and then disables duplicate claims', async () => {
        const v = fixture();
        vi.mocked(officeHubApi.action).mockResolvedValue({ ...v, collection: { ...v.collection, tickets: 1, dailyTicketClaimed: true }, notice: '今日限定券到账' });
        page('collection', v);
        fireEvent.click(await screen.findByRole('button', { name: '领取今日免费券' }));
        await waitFor(() => expect(officeHubApi.action).toHaveBeenCalledWith('daily_ticket', {}, expect.any(String)));
        expect(await screen.findByRole('button', { name: '今日券已领取' })).toBeDisabled();
        expect(screen.getByText('今日限定券到账')).toBeInTheDocument();
    });
    it('preserves a failed operation request ID on retry rather than duplicating draws', async () => {
        const v = fixture();
        vi.mocked(officeHubApi.action).mockRejectedValueOnce(new Error('网络中断')).mockResolvedValueOnce({ ...v, collection: { ...v.collection, tickets: 1, dailyTicketClaimed: true } });
        page('collection', v);
        fireEvent.click(await screen.findByRole('button', { name: '领取今日免费券' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('网络中断');
        fireEvent.click(screen.getByRole('button', { name: '领取今日免费券' }));
        await waitFor(() => expect(officeHubApi.action).toHaveBeenCalledTimes(2));
        expect(vi.mocked(officeHubApi.action).mock.calls[0][2]).toBe(vi.mocked(officeHubApi.action).mock.calls[1][2]);
    });
    it('shows the full probability and quota rules, disables unavailable farm draw and unowned appearances', async () => {
        page('collection');
        expect(await screen.findByText(/基础概率：N 93.7%/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '使用 100 farmExp' })).toBeDisabled();
        expect(screen.getByRole('button', { name: '使用 1 张券' })).toBeDisabled();
        const card = screen.getByRole('heading', { name: '素笺工作台' }).closest('article')!;
        expect(within(card).getByRole('button', { name: '使用外观' })).toBeDisabled();
    });
    it('uses API story starters and never submits an invented score / author identity', async () => {
        const v = fixture();
        vi.mocked(officeHubApi.action).mockResolvedValue(v);
        page('stories', v);
        fireEvent.change(await screen.findByLabelText('故事标题'), { target: { value: '未来办公室' } });
        fireEvent.click(screen.getByRole('button', { name: '发布故事（每天最多 3 篇）' }));
        await waitFor(() => expect(officeHubApi.action).toHaveBeenCalledWith('story_create', { title: '未来办公室', starter: 0 }, expect.any(String)));
    });
    it('allows archived story reading without allowing replies into archived nodes', async () => {
        const v = fixture();
        v.stories = [{ id: 'story1', title: '分支故事', mine: false, createdAt: v.serverTime, nodes: [{ id: 'n1', parentId: null, text: '可续写的开头正文', author: { publicId: 'pub', displayName: '同事' }, mine: false, archived: false, archiveReason: null, ratings: 0, score: null, myRating: null, createdAt: v.serverTime }, { id: 'n2', parentId: 'n1', text: '已归档的分支正文', author: { publicId: 'pub2', displayName: '同事乙' }, mine: false, archived: true, archiveReason: '低于评分阈值', ratings: 3, score: 1, myRating: null, createdAt: v.serverTime }] }];
        page('stories', v);
        await screen.findByText('可续写的开头正文');
        expect(screen.queryByText('已归档的分支正文')).not.toBeInTheDocument();
        fireEvent.click(screen.getByLabelText('显示归档'));
        expect(screen.getByText('已归档的分支正文')).toBeInTheDocument();
        expect(within(screen.getByLabelText('续写起点')).getAllByRole('option')).toHaveLength(1);
    });
    it('never reveals another drawer answer and submits guesses without a target user ID', async () => {
        const v = fixture();
        v.drawings = [{ id: 'drawing1', author: { publicId: 'p', displayName: '画手' }, mine: false, theme: '今日', strokes: [{ points: [{ x: 0, y: 0 }, { x: 100, y: 100 }], color: '#334155', width: 4 }], word: null, wordLength: 2, guesses: 0, solved: false, attempts: 0, createdAt: v.serverTime }];
        vi.mocked(officeHubApi.action).mockResolvedValue(v);
        page('drawings', v);
        expect(await screen.findByText(/2 个字/)).toBeInTheDocument();
        expect(screen.queryByText(/答案：/)).not.toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('你的答案'), { target: { value: '键盘' } });
        fireEvent.click(screen.getByRole('button', { name: '提交（还剩 5 次）' }));
        await waitFor(() => expect(officeHubApi.action).toHaveBeenCalledWith('drawing_guess', { postId: 'drawing1', guess: '键盘' }, expect.any(String)));
    });
    it('shows own secret word only and excludes self / eliminated members from vote options', async () => {
        const v = fixture();
        const spy: OfficeSpyView = { id: 'spy1', title: '投票中的描述局', theme: '今日', phase: 'vote', round: 1, owner: true, joined: true, meId: 'me', word: '周报', myVote: null, outcome: null, expiresAt: v.serverTime, guildGame: false, descriptions: [], members: [{ id: 'me', name: '自己', alive: true, described: true, voted: false, role: null }, { id: 'other', name: '同事甲', alive: true, described: true, voted: false, role: null }, { id: 'out', name: '已出局同事', alive: false, described: true, voted: true, role: null }] };
        v.spies = [spy];
        page('spy', v);
        await screen.findByText('周报');
        const options = within(screen.getByLabelText('你认为谁是卧底')).getAllByRole('option');
        expect(options.map(o => o.textContent)).toEqual(['请选择', '同事甲']);
    });
    it('provides an independent low-key boss page with actual server start/claim commands', async () => {
        const v = fixture();
        v.boss = { ...v.boss, startedAt: new Date(Date.now() - 60000).toISOString(), endsAt: new Date(Date.now() - 30000).toISOString() };
        vi.mocked(officeHubApi.overview).mockResolvedValue(v);
        vi.mocked(officeHubApi.action).mockResolvedValue({ ...v, boss: { ...v.boss, claimed: true } });
        render(<MemoryRouter><OfficeBossPage /></MemoryRouter>);
        expect(await screen.findByRole('heading', { name: '暴打小老板' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '收工：领取 20 办公币 +5 经验' }));
        await waitFor(() => expect(officeHubApi.action).toHaveBeenCalledWith('boss_claim', {}, expect.any(String)));
        expect(await screen.findByRole('button', { name: '今日奖励已领取' })).toBeDisabled();
    });
    it('ignores account-switched responses rather than exposing the previous account collection', async () => {
        let resolve!: (v: OfficeHubOverview) => void;
        vi.mocked(officeHubApi.overview).mockReturnValue(new Promise(r => { resolve = r; }));
        render(<MemoryRouter><OfficeHubPage initialTab="collection"/></MemoryRouter>);
        session.generation += 1;
        const v = fixture();
        v.collection.lastDraw = 'skin-night';
        resolve(v);
        await waitFor(() => expect(screen.queryByText('最近获得：夜航工作台')).not.toBeInTheDocument());
        expect(screen.queryByRole('heading', { name: /我的收藏/ })).not.toBeInTheDocument();
    });
    it('pages archived content and explicitly returns to the latest scoped page', async () => {
        const v=fixture();v.page={nextCursor:'older-cursor',historical:false};
        page('stories',v);
        await screen.findByRole('button',{name:'查看更早的共创记录'});
        vi.mocked(officeHubApi.overview).mockResolvedValue({...v,page:{nextCursor:null,historical:true}});
        fireEvent.click(screen.getByRole('button',{name:'查看更早的共创记录'}));
        await waitFor(()=>expect(officeHubApi.overview).toHaveBeenLastCalledWith('older-cursor','story'));
        fireEvent.click(await screen.findByRole('button',{name:'返回最新内容'}));
        await waitFor(()=>expect(officeHubApi.overview).toHaveBeenLastCalledWith(undefined,'story'));
    });
    it('clears an already loaded private word and pending forms on account identity remount',async()=>{
        const v=fixture();v.drawings=[{id:'draft',author:{publicId:'test-account-0',displayName:'自己'},mine:true,theme:'今日',word:'秘密办公题目',wordLength:6,strokes:[],guesses:0,solved:false,attempts:0,createdAt:v.serverTime}];
        const rendered=page('drawings',v);await screen.findByText(/秘密办公题目/);
        session.generation++;vi.mocked(officeHubApi.overview).mockImplementation(()=>new Promise(()=>{}));
        rendered.rerender(<MemoryRouter initialEntries={['/office?tab=drawings']}><OfficeHubPage/></MemoryRouter>);
        expect(screen.queryByText(/秘密办公题目/)).not.toBeInTheDocument();
    });
});
