import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OfficeDrawing, OfficeHubOverview, OfficeStroke } from '@stealth-reader/shared';
import { officeHubApi } from '../../api/office-hub';
import { CommunityApiError, setCommunitySessionTokens } from '../../api/community-http';
import { OfficeDrawingEditor, OfficeDrawingPanel } from './OfficeDrawingPanel';

const NOW = '2026-09-12T02:00:00.000Z', END = '2026-09-12T02:02:00.000Z';
const STROKES: OfficeStroke[] = [{ color: '#334155', width: 4, points: [{ x: 0, y: 0 }, { x: 30, y: 50 }] }];
function draft(patch: Partial<OfficeDrawing> = {}): OfficeDrawing {
    return { id: 'draft-a', author: { publicId: 'synthetic-a', displayName: '测试画手' }, mine: true, theme: '今日', strokes: [], word: '键盘', wordLength: 2, guesses: 0, solved: false, attempts: 0, createdAt: NOW, status: 'draft', deadlineAt: END, revision: 0, savedAt: null, submittedAt: null, submission: null, ...patch };
}
function overview(current = draft(), time = NOW): OfficeHubOverview {
    return { serverTime: time, notice: null, moderation: null, drawingWorkspace: { dailyLimit: 3, dailyUsed: 1, dailyRemaining: 2, current },
        collection: { day: '2026-09-12', promotionTier: 0, hourlyExp: 40, waveExp: 150, farmExp: 0, farmEarned: 0, farmDraws: 0, creditedWaves: 0, tickets: 0, dailyTicketClaimed: false, socialPoints: 0, socialEarnedToday: 0, socialExchangesToday: 0, pityR: 0, pitySSR: 0, draws: 0, owned: {}, equipped: null, lastDraw: null, reputation: 0, dailyUp: 'skin-mint', theme: '茶水间故事' },
        weekly: { guildId: null, guildName: null, week: '2026-09-07', announcement: '', canEdit: false, totalWaves: 0, targetWaves: 40, rewardClaimed: false, myWaves: 0, reputation: 0, leaderboard: [], departments: [] },
        boss: { startedAt: null, endsAt: null, hits: 0, damage: 0, claimed: false, rewardCoins: 20 }, stories: [], drawings: [current], spies: [] };
}
function editor(d = draft(), time = NOW, settled = vi.fn()) { return render(<OfficeDrawingEditor drawing={d} serverTime={time} onSettled={settled} />); }
async function draw(): Promise<void> {
    const canvas = screen.getByRole('img', { name: '绘画画布' });
    await act(async () => { fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 12, clientY: 20 }); fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 30, clientY: 40 }); fireEvent.pointerUp(canvas, { pointerId: 1 }); });
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }
beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(NOW));
    vi.stubGlobal('PointerEvent', MouseEvent);
    setCommunitySessionTokens('synthetic-drawing-session');
    vi.spyOn(officeHubApi, 'overview').mockResolvedValue(overview());
    vi.spyOn(officeHubApi, 'action').mockImplementation(async (action, data) => overview(draft({ strokes: (data?.strokes ?? []) as OfficeStroke[], revision: Number(data?.expectedRevision ?? 0) + 1, savedAt: NOW, ...(action === 'drawing_publish' ? { status: 'published', submission: 'manual', submittedAt: NOW } : {}) })));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('persistent asynchronous drawing workspace', () => {
    it('uses the server deadline despite a different device clock and announces the last 30 seconds', async () => {
        vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
        editor(); expect(screen.getByRole('timer')).toHaveTextContent('02:00');
        await act(async () => vi.advanceTimersByTimeAsync(90000));
        expect(screen.getByRole('timer')).toHaveTextContent('00:30');
        expect(screen.getByRole('timer')).toHaveAttribute('data-urgent', 'true');
        expect(screen.getByText(/还剩 30 秒以内/)).toBeVisible();
        expect(officeHubApi.action).not.toHaveBeenCalled();
    });
    it('restores actual persisted strokes without treating them as a published gallery image', () => {
        const d = draft({ strokes: STROKES, revision: 3, savedAt: NOW });
        render(<OfficeDrawingPanel view={overview(d)} busy={false} command={vi.fn()} refresh={vi.fn()} />);
        expect(screen.getByRole('img', { name: '绘画画布' }).querySelectorAll('polyline')).toHaveLength(1);
        expect(screen.queryByRole('img', { name: '同事的画作' })).not.toBeInTheDocument();
        expect(screen.getByText(/草稿已保存到服务器/)).toBeVisible();
        expect(screen.getByRole('button', { name: '领取绘画主题' })).toBeDisabled();
        expect(screen.getByText(/今日剩余/)).toHaveTextContent('2 / 3');
    });
    it('autosaves an immutable bounded snapshot with the exact server revision and a UUID', async () => {
        editor(); await draw();
        expect(officeHubApi.action).toHaveBeenCalledTimes(1);
        expect(officeHubApi.action).toHaveBeenCalledWith('drawing_save', { postId: 'draft-a', expectedRevision: 0, strokes: expect.any(Array) }, expect.stringMatching(/^[a-f0-9-]{36}$/));
        expect(screen.getByText(/草稿已保存到服务器/)).toBeVisible();
        await act(async () => vi.advanceTimersByTimeAsync(5000));
        expect(officeHubApi.action).toHaveBeenCalledTimes(1);
    });
    it('persists undo to an empty draft instead of resurrecting the old last stroke', async () => {
        editor(draft({ strokes: STROKES, revision: 1, savedAt: NOW }));
        fireEvent.click(screen.getByRole('button', { name: '撤销一笔' }));
        await act(async () => vi.advanceTimersByTimeAsync(250));
        expect(officeHubApi.action).toHaveBeenCalledWith('drawing_save', { postId: 'draft-a', expectedRevision: 1, strokes: [] }, expect.any(String));
    });
    it('treats PostgreSQL jsonb key reordering as the same drawing and never loops autosaves', async () => {
        vi.mocked(officeHubApi.action).mockImplementation(async (_action, data) => {
            const reordered = (data!.strokes as OfficeStroke[]).map(s => ({ width: s.width, color: s.color, points: s.points.map(p => ({ y: p.y, x: p.x })) }));
            return overview(draft({ strokes: reordered, revision: Number(data!.expectedRevision) + 1, savedAt: NOW }));
        });
        editor(); await draw(); await act(async () => vi.advanceTimersByTimeAsync(5000));
        expect(officeHubApi.action).toHaveBeenCalledTimes(1);
        expect(screen.getByText(/草稿已保存到服务器/)).toBeVisible();
        expect(screen.queryByText(/有笔画尚未确认保存/)).not.toBeInTheDocument();
    });
    it.each([false, true])('does not overwrite another tab when an original UUID replay returns a newer version (prior ACK observed=%s)', async observedAck => {
        vi.mocked(officeHubApi.action).mockRejectedValueOnce(new Error('结果未知'));
        const rendered = editor(); await draw();
        const original = vi.mocked(officeHubApi.action).mock.calls[0];
        if (observedAck) rendered.rerender(<OfficeDrawingEditor drawing={draft({ strokes: original[1]!.strokes as OfficeStroke[], revision: 1, savedAt: NOW })} serverTime={NOW} onSettled={vi.fn()} />);
        const peer = draft({ strokes: STROKES, revision: 2, savedAt: NOW });
        vi.mocked(officeHubApi.action).mockResolvedValueOnce(overview(peer));
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: '重试保存（原请求）' })); });
        expect(vi.mocked(officeHubApi.action).mock.calls[1]).toEqual(original);
        await act(async () => vi.advanceTimersByTimeAsync(5000));
        expect(officeHubApi.action).toHaveBeenCalledTimes(2);
        expect(screen.getByRole('alert')).toHaveTextContent('另一页面更新了草稿');
        expect(screen.getByRole('img', { name: '绘画画布' })).toHaveAttribute('aria-disabled', 'true');
        expect(screen.getByRole('button', { name: '放弃本页未保存笔画，读取服务器草稿' })).toBeVisible();
    });
    it('keeps drawing during an in-flight save then sends only the newer queued snapshot', async () => {
        const pending = deferred<OfficeHubOverview>(); vi.mocked(officeHubApi.action).mockReturnValueOnce(pending.promise);
        editor(); await draw();
        const first = vi.mocked(officeHubApi.action).mock.calls[0][1]!;
        await draw(); expect(officeHubApi.action).toHaveBeenCalledTimes(1);
        expect((first.strokes as OfficeStroke[])).toHaveLength(1);
        await act(async () => pending.resolve(overview(draft({ revision: 1, savedAt: NOW, strokes: first.strokes as OfficeStroke[] }))));
        await act(async () => vi.advanceTimersByTimeAsync(2000));
        const second = vi.mocked(officeHubApi.action).mock.calls[1][1]!;
        expect(second.expectedRevision).toBe(1); expect(second.strokes).toHaveLength(2);
    });
    it('retries a network-unknown save with the same ID and payload, not a fresh opportunity', async () => {
        vi.mocked(officeHubApi.action).mockRejectedValueOnce(new Error('网络中断'));
        editor(); await draw();
        expect(screen.getByRole('alert')).toHaveTextContent('未确认保存的笔画仍留在本页');
        expect(screen.getByRole('img', { name: '绘画画布' })).toHaveAttribute('aria-disabled', 'true');
        const before = vi.mocked(officeHubApi.action).mock.calls[0];
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: '重试保存（原请求）' })); });
        expect(vi.mocked(officeHubApi.action).mock.calls[1]).toEqual(before);
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
    it('does not overwrite another tab and requires explicit discard before loading its saved draft', async () => {
        vi.mocked(officeHubApi.action).mockRejectedValueOnce(new CommunityApiError(409, '版本冲突', { code: 'OFFICE_DRAWING_VERSION_CONFLICT' }));
        const newer = draft({ revision: 2, savedAt: NOW, strokes: STROKES });
        vi.mocked(officeHubApi.overview).mockResolvedValue(overview(newer));
        editor(); await draw();
        await act(async () => vi.advanceTimersByTimeAsync(5000));
        expect(officeHubApi.action).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('img', { name: '绘画画布' })).toHaveAttribute('aria-disabled', 'true');
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: '放弃本页未保存笔画，读取服务器草稿' })); });
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.getByRole('img', { name: '绘画画布' }).querySelector('polyline')).toHaveAttribute('points', '0,0 30,50');
    });
    it('bounds a hanging save and preserves its original immutable request for an explicit retry', async () => {
        vi.mocked(officeHubApi.action).mockReturnValueOnce(new Promise(() => {}));
        editor(); await draw();
        const request = vi.mocked(officeHubApi.action).mock.calls[0];
        await act(async () => vi.advanceTimersByTimeAsync(8000));
        expect(screen.getByRole('alert')).toHaveTextContent('结果尚未确认');
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: '重试保存（原请求）' })); });
        expect(vi.mocked(officeHubApi.action).mock.calls[1]).toEqual(request);
    });
    it('freezes at zero and queries authoritative auto-submission rather than posting a late snapshot', async () => {
        const completed = draft({ strokes: STROKES, status: 'published', submission: 'automatic', revision: 2, submittedAt: END });
        vi.mocked(officeHubApi.overview).mockResolvedValue(overview(completed, END));
        const settled = vi.fn(); editor(draft({ strokes: STROKES, revision: 1, savedAt: NOW }), '2026-09-12T02:01:59.000Z', settled);
        await act(async () => vi.advanceTimersByTimeAsync(1250));
        expect(screen.getByText('时间到，服务器已自动提交最后保存的画作。')).toBeVisible();
        expect(screen.queryByRole('img', { name: '绘画画布' })).not.toBeInTheDocument();
        expect(officeHubApi.action).not.toHaveBeenCalled(); expect(settled).toHaveBeenCalledTimes(1);
    });
    it('shows a blank terminal result and used quota instead of silently removing the task', () => {
        const view = overview(draft({ status: 'expired_empty', submission: 'automatic', submittedAt: END }));
        view.drawingWorkspace!.dailyUsed = 3; view.drawingWorkspace!.dailyRemaining = 0;
        render(<OfficeDrawingPanel view={view} busy={false} command={vi.fn()} refresh={vi.fn()} />);
        expect(screen.getByText(/本次空白结束/)).toBeVisible();
        expect(screen.getByRole('button', { name: '领取绘画主题' })).toBeDisabled();
        expect(screen.getByText(/今日剩余/)).toHaveTextContent('0 / 3');
        expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });
    it('does not claim the unsaved local tail was included after a failed final save', async () => {
        vi.mocked(officeHubApi.action).mockRejectedValueOnce(new Error('离线'));
        const completed = draft({ status: 'expired_empty', submission: 'automatic', revision: 1, submittedAt: END });
        vi.mocked(officeHubApi.overview).mockResolvedValue(overview(completed, END));
        editor(draft(), '2026-09-12T02:01:58.000Z'); await draw();
        await act(async () => vi.advanceTimersByTimeAsync(2250));
        expect(screen.getByText(/部分本地笔画未在截止前保存/)).toBeVisible();
        expect(screen.getByText(/本次空白结束/)).toBeVisible();
    });
    it('lets manual early submission publish once and disables further editing', async () => {
        const settled = vi.fn(); editor(draft({ strokes: STROKES, revision: 1, savedAt: NOW }), NOW, settled);
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: '提前提交到猜画墙' })); });
        expect(officeHubApi.action).toHaveBeenCalledWith('drawing_publish', { postId: 'draft-a', expectedRevision: 1, strokes: STROKES }, expect.any(String));
        expect(screen.getByText('你的画作已提交到猜画墙。')).toBeVisible();
        expect(settled).toHaveBeenCalledTimes(1);
        await act(async () => vi.advanceTimersByTimeAsync(130000)); expect(officeHubApi.action).toHaveBeenCalledTimes(1);
    });
    it('reads terminal state even while a final network request remains pending', async () => {
        vi.mocked(officeHubApi.action).mockReturnValue(new Promise(() => {}));
        vi.mocked(officeHubApi.overview).mockResolvedValue(overview(draft({ status: 'expired_empty', submission: 'automatic', revision: 1, submittedAt: END }), END));
        editor(draft(), '2026-09-12T02:01:58.000Z'); await draw();
        await act(async () => vi.advanceTimersByTimeAsync(2250)); expect(screen.getByText(/本次空白结束/)).toBeVisible();
    });
    it('ignores a delayed old-session response and never resends its save as the next account', async () => {
        const pending = deferred<OfficeHubOverview>(); vi.mocked(officeHubApi.action).mockReturnValueOnce(pending.promise);
        const rendered = editor(); await draw();
        setCommunitySessionTokens('synthetic-account-b'); rendered.unmount();
        editor(draft({ id: 'draft-b', word: '月报' }));
        await act(async () => pending.resolve(overview(draft({ status: 'published', word: '旧账号私密题', revision: 1 }))));
        await act(async () => vi.advanceTimersByTimeAsync(2500));
        expect(screen.queryByText(/旧账号私密题/)).not.toBeInTheDocument();
        expect(screen.getByText('月报')).toBeVisible(); expect(officeHubApi.action).toHaveBeenCalledTimes(1);
    });
    it('renders other players without the hidden word and sends normal guesses', async () => {
        const view = overview(); view.drawingWorkspace!.current = null;
        view.drawings = [draft({ id: 'other', mine: false, strokes: STROKES, status: 'published', word: null })];
        const command = vi.fn(); render(<OfficeDrawingPanel view={view} busy={false} command={command} refresh={vi.fn()} />);
        expect(screen.queryByText('键盘')).not.toBeInTheDocument();
        const form = screen.getByRole('textbox', { name: '你的答案' }).closest('form')!;
        fireEvent.change(within(form).getByRole('textbox'), { target: { value: '键盘' } });
        fireEvent.submit(form); expect(command).toHaveBeenCalledWith('drawing_guess', { postId: 'other', guess: '键盘' });
    });
    it('does not advertise autosave availability or start new tasks on an old server', () => {
        const view = overview(); delete view.drawingWorkspace;
        render(<OfficeDrawingPanel view={view} busy={false} command={vi.fn()} refresh={vi.fn()} />);
        expect(screen.getByRole('button', { name: '领取绘画主题' })).toBeDisabled();
        expect(screen.getByText(/当前服务器尚未提供自动保存状态/)).toBeVisible();
    });
});
