import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceShortcuts, WorkspaceVisitTracker, readShortcuts } from './WorkspaceShortcuts';
import { WorkspaceOverview } from './WorkspaceOverview';
import { communityHttp } from '../../api/community-http';
import { resetCommunityAuthStoreForTests, useCommunityAuthStore } from '../../app/store/community-auth-store';
import { TOWER_TEST_USER } from '../games/demon-tower/test-fixtures';
vi.mock('../../app/store/community-wallet-store', () => ({ refreshCommunityWallet: vi.fn(async () => {}), useCommunityWalletStore: () => ({ ownerId: TOWER_TEST_USER.publicId, officeCoins: 500, status: 'ready' }) }));

describe('my workspace private summaries', () => {
  beforeEach(() => { localStorage.clear(); resetCommunityAuthStoreForTests(); useCommunityAuthStore.setState({ phase: 'active', user: TOWER_TEST_USER }); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });
  it('shows actual positive/negative daily flows separately and never substitutes missing income with a zero', async () => {
    vi.spyOn(communityHttp, 'get').mockResolvedValue({ date: '2026-09-10', income: '9007199254740993', spent: '30', serverTime: '2026-09-10T08:00:00Z', timeZone: 'Asia/Shanghai' });
    render(<MemoryRouter><WorkspaceOverview owner={TOWER_TEST_USER.publicId} /></MemoryRouter>);
    expect(await screen.findByText('+9,007,199,254,740,993')).toBeVisible();
    expect(within(screen.getByRole('region', { name: '今日支出' })).getByText('30')).toBeVisible();
    vi.mocked(communityHttp.get).mockRejectedValue(new Error('offline'));
    fireEvent.click(screen.getByRole('button', { name: '刷新概览' }));
    expect(await screen.findByRole('status')).toHaveTextContent('可能过期');
    expect(screen.getByText('+9,007,199,254,740,993')).toBeVisible();
  });
  it('saves only allowlisted routes without query content; supports favorites and per-account recent clearing', async () => {
    let go!: ReturnType<typeof useNavigate>;
    function Navigation() { go = useNavigate(); return null; }
    render(<MemoryRouter initialEntries={['/tools/timer?private=do-not-store']}><Navigation /><WorkspaceVisitTracker /><WorkspaceShortcuts owner={TOWER_TEST_USER.publicId} /></MemoryRouter>);
    expect(readShortcuts(TOWER_TEST_USER.publicId).recent).toEqual(['/tools/timer']);
    fireEvent.click(screen.getByLabelText('计算器'));
    expect(within(screen.getByRole('navigation', { name: '收藏工具' })).getByRole('link', { name: '计算器' })).toHaveAttribute('href', '/tools/calculator');
    act(() => go('/games/tank'));
    await waitFor(() => expect(readShortcuts(TOWER_TEST_USER.publicId).recent[0]).toBe('/games/tank'));
    expect(readShortcuts('another-account').recent).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: '清空最近使用' }));
    expect(readShortcuts(TOWER_TEST_USER.publicId)).toMatchObject({ recent: [], favorites: ['/tools/calculator'] });
    expect(JSON.stringify(localStorage)).not.toContain('do-not-store');
  });
});
