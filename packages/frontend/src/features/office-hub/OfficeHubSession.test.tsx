import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OfficeDrawing, OfficeHubOverview } from '@stealth-reader/shared';
import { officeHubApi } from '../../api/office-hub';
import { setCommunitySessionTokens } from '../../api/community-http';
import { resetCommunityAuthStoreForTests, useCommunityAuthStore } from '../../app/store/community-auth-store';
import { TOWER_TEST_USER } from '../games/demon-tower/test-fixtures';
import { OfficeHubPage } from './OfficeHubPage';

vi.mock('../office-battle/CommunityGuildPanel', () => ({ CommunityGuildPanel: () => null }));
function fixture(): OfficeHubOverview {
    const serverTime = new Date().toISOString();
    return {
        serverTime, notice: null, moderation: null,
        collection: { day: serverTime.slice(0, 10), promotionTier: 0, hourlyExp: 40, waveExp: 150, farmExp: 0, farmEarned: 0, farmDraws: 0, creditedWaves: 0, tickets: 0, dailyTicketClaimed: false, socialPoints: 0, socialEarnedToday: 0, socialExchangesToday: 0, pityR: 0, pitySSR: 0, draws: 0, owned: {}, equipped: null, lastDraw: null, reputation: 0, dailyUp: 'skin-mint', theme: '合成猜画墙' },
        weekly: { guildId: null, guildName: null, week: serverTime.slice(0, 10), announcement: '', canEdit: false, totalWaves: 0, targetWaves: 40, rewardClaimed: false, myWaves: 0, reputation: 0, leaderboard: [], departments: [] },
        boss: { startedAt: null, endsAt: null, hits: 0, damage: 0, claimed: false, rewardCoins: 20 }, stories: [], drawings: [], spies: [],
        drawingWorkspace: { dailyLimit: null, dailyRemaining: null, dailyUsed: 8, dailyUnlimited: true, canStart: true, storageUsed: 0, storageLimit: 1000, current: null },
    };
}
function drawing(patch: Partial<OfficeDrawing> = {}): OfficeDrawing {
    const createdAt = new Date().toISOString();
    return { id: 'synthetic-session-drawing', author: { publicId: 'other-synthetic-user', displayName: '合成同事' }, mine: false, theme: '合成题目', strokes: [{ color: '#334155', width: 4, points: [{ x: 20, y: 20 }, { x: 50, y: 60 }] }], word: null, wordLength: 2, guesses: 0, solved: false, attempts: 1, createdAt, status: 'published', canRate: true, score: null, ratings: 0, myRating: null, ...patch };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }
beforeEach(() => {
    resetCommunityAuthStoreForTests();
    setCommunitySessionTokens('synthetic-office-session-a');
    useCommunityAuthStore.setState({ phase: 'active', user: TOWER_TEST_USER, sessionReady: true, loading: false });
});
afterEach(() => { cleanup(); resetCommunityAuthStoreForTests(); vi.restoreAllMocks(); });
describe('real auth publication isolates the drawing workspace', () => {
    it('remounts private drafts for a new session even when publicId, user object and active phase are unchanged', async () => {
        const old = fixture();
        old.drawingWorkspace!.current = drawing({ mine: true, author: { publicId: TOWER_TEST_USER.publicId, displayName: '合成自己' }, status: 'draft', strokes: [], word: '旧会话秘密题', revision: 0, deadlineAt: new Date(Date.now() + 120_000).toISOString() });
        old.drawingWorkspace!.canStart = false;
        const fresh = deferred<OfficeHubOverview>();
        const read = vi.spyOn(officeHubApi, 'overview').mockResolvedValueOnce(old).mockReturnValueOnce(fresh.promise);
        render(<MemoryRouter initialEntries={['/office?tab=drawings']}><OfficeHubPage /></MemoryRouter>);
        expect(await screen.findByText('旧会话秘密题')).toBeVisible();
        await act(async () => {
            setCommunitySessionTokens('synthetic-office-session-b');
            // Exactly the publication beginAuthTransition performs: same user,
            // same active phase, but a changed auth snapshot/generation.
            useCommunityAuthStore.setState({ loading: true });
        });
        expect(useCommunityAuthStore.getState().user).toBe(TOWER_TEST_USER);
        expect(screen.queryByText('旧会话秘密题')).not.toBeInTheDocument();
        expect(read).toHaveBeenCalledTimes(2);
        await act(async () => { fresh.resolve(fixture()); });
        expect(screen.getByRole('button', { name: '领取绘画主题' })).toBeEnabled();
        expect(screen.queryByRole('img', { name: '绘画画布' })).not.toBeInTheDocument();
    });
    it('ignores the old vote ACK across same-account reauthentication and does not resend it in the new workspace', async () => {
        const old = fixture(); old.drawings = [drawing()];
        const ack = deferred<OfficeHubOverview>();
        const read = vi.spyOn(officeHubApi, 'overview').mockResolvedValue(old);
        const write = vi.spyOn(officeHubApi, 'action').mockReturnValue(ack.promise);
        render(<MemoryRouter initialEntries={['/office?tab=drawings']}><OfficeHubPage /></MemoryRouter>);
        fireEvent.change(await screen.findByRole('combobox', { name: '你的评分（1–5 分）' }), { target: { value: '5' } });
        fireEvent.click(screen.getByRole('button', { name: '提交评分' }));
        expect(write).toHaveBeenCalledOnce();
        const fresh = fixture(); fresh.drawings = [drawing()]; read.mockResolvedValue(fresh);
        await act(async () => {
            setCommunitySessionTokens('synthetic-office-session-b');
            useCommunityAuthStore.setState({ loading: true });
            ack.resolve({ ...old, notice: '旧会话私有评分回执', drawings: [drawing({ ratings: 1, score: 5, myRating: 5 })] });
        });
        expect(read).toHaveBeenCalledTimes(2);
        expect(screen.queryByText('旧会话私有评分回执')).not.toBeInTheDocument();
        expect(screen.queryByText(/平均 5.0|我的评分 5 分/)).not.toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: '你的评分（1–5 分）' })).toHaveValue('');
        expect(write).toHaveBeenCalledOnce();
    });
});
