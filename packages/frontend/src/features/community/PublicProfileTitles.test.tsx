import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommunityPublicProfile } from '../../api/community-profile';
import { communityProfileApi } from '../../api/community-profile';
import { communityRelationshipsApi } from '../../api/community-relationships';
import { setCommunitySessionTokens } from '../../api/community-http';
import { resetCommunityAuthStoreForTests, useCommunityAuthStore } from '../../app/store/community-auth-store';
import { TOWER_TEST_USER } from '../games/demon-tower/test-fixtures';
import { CommunityPublicProfilePage } from './PublicProfilePage';
vi.mock('../../app/community-nav', () => ({ COMMUNITY_FEATURE_FLAGS: { friends: true, feed: true, chat: true, farm: true, socialVerification: false } }));
const profile = (extra: Partial<CommunityPublicProfile> = {}): CommunityPublicProfile => ({ publicId: 'synthetic-profile-other', displayName: '档案同事', avatarKey: 'green', battleProfession: 'developer', equippedTitle: { key: 'farm_first', label: '工位园丁' }, relationship: { status: 'none', canRequest: false, canFeed: false, canEncouragePlant: false, canBlock: false }, ...extra });
const show = () => render(<MemoryRouter initialEntries={['/users/synthetic-profile-other']}><Routes><Route path="/users/:publicId" element={<CommunityPublicProfilePage />} /></Routes></MemoryRouter>);
describe('public profile title privacy projection', () => {
  beforeEach(() => { vi.restoreAllMocks(); resetCommunityAuthStoreForTests(); setCommunitySessionTokens('synthetic-public-a'); useCommunityAuthStore.setState({ phase: 'active', user: TOWER_TEST_USER, sessionReady: true }); vi.spyOn(communityProfileApi, 'getPublic').mockResolvedValue(profile()); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });
  it('shows opted-in public suffix but not a private honors collection', async () => {
    show(); expect(await screen.findByLabelText('佩戴称号：工位园丁')).toBeVisible(); expect(screen.getByText('荣誉可见范围由该用户控制。')).toBeVisible();
    expect(screen.queryByText('绿意常驻')).toBeNull();
  });
  it('renders accessible collection badges and handles legacy text entries safely', async () => {
    vi.mocked(communityProfileApi.getPublic).mockResolvedValue(profile({ equippedTitle: null, honors: [{ key: 'farm_25', label: '绿意常驻' }, '旧版纪念'] }));
    show(); expect(await screen.findByLabelText('称号：绿意常驻')).toBeVisible(); expect(screen.getByText('旧版纪念')).toBeVisible(); expect(screen.queryByText('[object Object]')).toBeNull();
  });
  it('does not reveal a suffix when the returned profile is blocked or unavailable', async () => {
    vi.mocked(communityProfileApi.getPublic).mockResolvedValue(profile({ relationship: { ...profile().relationship, status: 'blocked_by_me' } }));
    show(); await screen.findByRole('heading', { level: 1, name: '档案同事' }); expect(screen.queryByText('工位园丁')).toBeNull();
  });
  it('clears the old title, honors and friend actions after blocking even when the refreshed profile is unavailable', async () => {
    let rejectRefresh!: (reason: Error) => void;
    vi.mocked(communityProfileApi.getPublic).mockResolvedValueOnce(profile({
      honors: [{ key: 'farm_25', label: '绿意常驻' }],
      relationship: { ...profile().relationship, status: 'friend', canBlock: true, canFeed: true },
    })).mockReturnValueOnce(new Promise((_resolve, reject) => { rejectRefresh = reject; }));
    vi.spyOn(communityRelationshipsApi, 'block').mockResolvedValue({ status: 'blocked_by_me' });
    show();
    expect(await screen.findByLabelText('佩戴称号：工位园丁')).toBeVisible();
    expect(screen.getByLabelText('称号：绿意常驻')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '拉黑' }));
    fireEvent.click(screen.getByRole('button', { name: '确认拉黑' }));
    await waitFor(() => expect(communityProfileApi.getPublic).toHaveBeenCalledTimes(2));
    expect(screen.queryByLabelText('佩戴称号：工位园丁')).toBeNull();
    expect(screen.queryByLabelText('称号：绿意常驻')).toBeNull();
    expect(screen.queryByRole('button', { name: '送咖啡' })).toBeNull();
    await act(async () => { rejectRefresh(new Error('没有找到对应的用户或记录')); await Promise.resolve(); });
    expect(await screen.findByRole('alert')).toHaveTextContent('没有找到对应的用户或记录');
    expect(screen.queryByText('档案同事')).toBeNull();
    expect(screen.queryByLabelText('佩戴称号：工位园丁')).toBeNull();
    expect(screen.getByRole('button', { name: '重新加载' })).toBeVisible();
  });
  it('cannot paint the previous viewers private honors after an account switch', async () => {
    let resolve!: (value: CommunityPublicProfile) => void;
    vi.mocked(communityProfileApi.getPublic).mockReturnValueOnce(new Promise((yes) => { resolve = yes; })).mockResolvedValue(profile({ displayName: '新会话可见' }));
    show(); await waitFor(() => expect(communityProfileApi.getPublic).toHaveBeenCalledOnce());
    act(() => { setCommunitySessionTokens('synthetic-public-b'); useCommunityAuthStore.setState({ user: { ...TOWER_TEST_USER, publicId: 'viewer-b' } }); });
    await screen.findByRole('heading', { level: 1, name: '新会话可见' });
    await act(async () => { resolve(profile({ displayName: '旧会话私密', honors: ['仅旧好友可见'] })); await Promise.resolve(); });
    expect(screen.queryByText('仅旧好友可见')).toBeNull(); expect(screen.queryByText('旧会话私密')).toBeNull();
  });
});
