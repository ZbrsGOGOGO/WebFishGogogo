import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { communityFarmApi, communityProfileApi, type CommunityProfile } from '../../api/community';
import { setCommunitySessionTokens } from '../../api/community-http';
import { resetCommunityAuthStoreForTests, useCommunityAuthStore } from '../../app/store/community-auth-store';
import { TOWER_TEST_USER } from '../games/demon-tower/test-fixtures';
import { CommunityMyProfilePage } from './MyProfilePage';

vi.mock('../../app/community-nav', () => ({ COMMUNITY_FEATURE_FLAGS: { publicProfile: true, farm: true, socialVerification: false, communityProgressionEnabled: false } }));
vi.mock('./WorkspaceOverview', () => ({ WorkspaceOverview: () => <section aria-label="账户概览测试">账户概览独立读取</section> }));

const saved: CommunityProfile = { ...TOWER_TEST_USER, displayName: '已保存的同事', bio: '完整的原简介', avatarKey: 'green', battleProfession: 'developer' };
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; };
const openEditor = () => fireEvent.click(screen.getByRole('button', { name: '编辑公开资料' }));
const renderPage = () => render(<MemoryRouter><CommunityMyProfilePage /></MemoryRouter>);

describe('private profile overview and explicit editing', () => {
  beforeEach(() => {
    vi.restoreAllMocks(); resetCommunityAuthStoreForTests(); setCommunitySessionTokens('synthetic-profile-ui');
    useCommunityAuthStore.setState({ phase: 'active', sessionReady: true, user: saved });
    vi.spyOn(communityProfileApi, 'getMe').mockResolvedValue(saved);
    vi.spyOn(communityFarmApi, 'getOverview').mockRejectedValue(new Error('local fixture: farm unavailable'));
    vi.spyOn(communityProfileApi, 'updateProfile').mockResolvedValue(saved);
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('keeps the public card before account summaries and the editor collapsed until explicitly opened', async () => {
    const { container } = renderPage();
    expect(await screen.findByText(saved.bio!)).toBeVisible();
    const editor = container.querySelector('details');
    expect(editor).not.toHaveAttribute('open');
    const identity = screen.getByRole('region', { name: '个人名片' });
    expect(identity.compareDocumentPosition(screen.getByRole('region', { name: '账户概览测试' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Self-profile URLs intentionally redirect to /me; the card must not advertise a bouncing preview.
    expect(within(identity).getByRole('link', { name: '管理公开展示 →' })).toHaveAttribute('href', '/settings/privacy');
    openEditor(); expect(editor).toHaveAttribute('open');
    expect(screen.getByRole('textbox', { name: '简介' })).toHaveValue(saved.bio);
    expect(communityProfileApi.updateProfile).not.toHaveBeenCalled();
  });

  it('never replaces the saved avatar on the public card with an unsubmitted draft', async () => {
    renderPage(); await screen.findByText(saved.bio!); openEditor();
    fireEvent.click(screen.getByRole('button', { name: /云.*蓝色协作/ }));
    expect(screen.getByRole('region', { name: '个人名片' })).toHaveTextContent('芽');
    expect(screen.getByRole('region', { name: '个人名片' })).not.toHaveTextContent('云');
    expect(communityProfileApi.updateProfile).not.toHaveBeenCalled();
  });

  it('prevents saving until the full profile loads and enables a safe retry instead of clearing the original bio', async () => {
    vi.mocked(communityProfileApi.getMe).mockRejectedValueOnce(new Error('local fixture: profile offline'));
    renderPage(); expect(await screen.findByRole('button', { name: '重新读取资料' })).toBeVisible(); openEditor();
    expect(screen.getByRole('button', { name: '保存资料' })).toBeDisabled();
    fireEvent.submit(screen.getByRole('button', { name: '保存资料' }).closest('form')!);
    expect(communityProfileApi.updateProfile).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '重新读取资料' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '保存资料' })).not.toBeDisabled());
    expect(screen.getByRole('textbox', { name: '简介' })).toHaveValue(saved.bio);
    expect(communityProfileApi.updateProfile).not.toHaveBeenCalled();
  });

  it('locks rapid repeated saves and sends only the original editable fields', async () => {
    const receipt = deferred<CommunityProfile>(); vi.mocked(communityProfileApi.updateProfile).mockReturnValue(receipt.promise);
    renderPage(); await screen.findByText(saved.bio!); openEditor();
    fireEvent.change(screen.getByRole('textbox', { name: '昵称' }), { target: { value: '  新昵称  ' } });
    const form = screen.getByRole('button', { name: '保存资料' }).closest('form')!;
    fireEvent.submit(form); fireEvent.submit(form);
    expect(communityProfileApi.updateProfile).toHaveBeenCalledOnce();
    expect(communityProfileApi.updateProfile).toHaveBeenCalledWith({ displayName: '新昵称', bio: saved.bio, avatarKey: 'green', battleProfession: 'developer' });
    expect(screen.getByRole('textbox', { name: '简介' })).toBeDisabled();
    await act(async () => receipt.resolve({ ...saved, displayName: '新昵称' }));
    expect(await screen.findByText('主页资料已保存')).toBeVisible();
  });

  it('ignores a previous account response after switching accounts', async () => {
    const old = deferred<CommunityProfile>(); vi.mocked(communityProfileApi.getMe).mockReturnValueOnce(old.promise);
    renderPage(); const next = { ...saved, id: 'synthetic-b', publicId: 'synthetic-b', displayName: '新账号同事', bio: '新账号简介' };
    vi.mocked(communityProfileApi.getMe).mockResolvedValue(next);
    act(() => { setCommunitySessionTokens('synthetic-profile-b'); useCommunityAuthStore.setState({ user: next }); });
    expect(await screen.findByText('新账号简介')).toBeVisible();
    await act(async () => old.resolve({ ...saved, bio: '旧会话不应显示的简介' }));
    expect(screen.queryByText('旧会话不应显示的简介')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: '个人名片' })).toHaveTextContent('新账号同事');
  });

  it('keeps the draft and unlocks editing after a failed save so an explicit retry can succeed', async () => {
    vi.mocked(communityProfileApi.updateProfile).mockRejectedValueOnce(new Error('synthetic save offline'));
    renderPage(); await screen.findByText(saved.bio!); openEditor();
    fireEvent.change(screen.getByRole('textbox', { name: '简介' }), { target: { value: '尚未提交的新简介' } });
    fireEvent.submit(screen.getByRole('button', { name: '保存资料' }).closest('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent('synthetic save offline');
    expect(screen.getByRole('textbox', { name: '简介' })).toBeEnabled();
    expect(screen.getByRole('textbox', { name: '简介' })).toHaveValue('尚未提交的新简介');
    expect(within(screen.getByRole('region', { name: '个人名片' })).getByText(saved.bio!)).toBeVisible();
    vi.mocked(communityProfileApi.updateProfile).mockResolvedValue({ ...saved, bio: '尚未提交的新简介' });
    fireEvent.submit(screen.getByRole('button', { name: '保存资料' }).closest('form')!);
    expect(await screen.findByText('主页资料已保存')).toBeVisible();
    expect(communityProfileApi.updateProfile).toHaveBeenCalledTimes(2);
    expect(within(screen.getByRole('region', { name: '个人名片' })).getByText('尚未提交的新简介')).toBeVisible();
  });

  it('remounts on a new session even when the public account ID remains the same', async () => {
    const old = deferred<CommunityProfile>(); vi.mocked(communityProfileApi.getMe).mockReturnValueOnce(old.promise);
    renderPage();
    vi.mocked(communityProfileApi.getMe).mockResolvedValue({ ...saved, bio: '同号新会话资料' });
    act(() => { setCommunitySessionTokens('synthetic-profile-same-account-new-session'); useCommunityAuthStore.setState({ user: { ...saved } }); });
    expect(await within(screen.getByRole('region', { name: '个人名片' })).findByText('同号新会话资料')).toBeVisible();
    await act(async () => old.resolve({ ...saved, bio: '同号旧会话资料' }));
    expect(screen.queryByText('同号旧会话资料')).not.toBeInTheDocument();
    expect(communityProfileApi.getMe).toHaveBeenCalledTimes(2);
  });

  it('does not apply a late save receipt to a replacement login session', async () => {
    const receipt = deferred<CommunityProfile>(); vi.mocked(communityProfileApi.updateProfile).mockReturnValue(receipt.promise);
    renderPage(); await screen.findByText(saved.bio!); openEditor();
    fireEvent.submit(screen.getByRole('button', { name: '保存资料' }).closest('form')!);
    vi.mocked(communityProfileApi.getMe).mockResolvedValue({ ...saved, bio: '重登后的新资料' });
    act(() => { setCommunitySessionTokens('synthetic-profile-relogin'); useCommunityAuthStore.setState({ user: { ...saved } }); });
    expect(await within(screen.getByRole('region', { name: '个人名片' })).findByText('重登后的新资料')).toBeVisible();
    await act(async () => receipt.resolve({ ...saved, displayName: '旧保存回执昵称', bio: '旧保存回执简介' }));
    expect(useCommunityAuthStore.getState().user?.displayName).toBe(saved.displayName);
    expect(screen.queryByText('旧保存回执简介')).not.toBeInTheDocument();
    expect(screen.queryByText('主页资料已保存')).not.toBeInTheDocument();
  });
});
