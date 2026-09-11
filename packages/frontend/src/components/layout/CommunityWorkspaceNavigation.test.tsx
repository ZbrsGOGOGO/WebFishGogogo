import { useEffect, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommunityDirectoryTrigger, CommunitySidebarLinks, CommunityWorkspaceNavigationProvider } from './CommunityWorkspaceNavigation';
import { communityNavigationStorageKey, defaultCommunityNavigationPreferences, writeCommunityNavigationPreferences } from '../../app/store/community-navigation-preferences';
import { useCommunityAuthStore, resetCommunityAuthStoreForTests } from '../../app/store/community-auth-store';
import { setCommunitySessionTokens } from '../../api/community-http';
import type { CommunityAuthUser } from '../../api/community';
import { CommunityGameWorkspaceLayout } from '../../features/games/rooms/CommunityGameWorkspaceLayout';
import { useGamePrivacy } from '../../features/games/GamePrivacyContext';
import { PublicToolsPage } from '../../features/tools/PublicToolsPage';

const access = vi.hoisted(() => ({ allowed: false }));
vi.mock('../../features/development/development-access', async importOriginal => {
  const actual = await importOriginal<typeof import('../../features/development/development-access')>();
  return { ...actual, useDevelopmentAccessState: () => ({ status: access.allowed ? 'allowed' : 'denied', access: access.allowed ? { enabled: true, role: 'contributor' } : null, subjectPublicId: 'nav-a', reload: () => undefined }) };
});
vi.mock('../../app/store/community-wallet-store', () => ({ synchronizeCommunityWalletSession: vi.fn(), refreshCommunityWallet: vi.fn(), useCommunityWalletStore: () => ({ ownerId: 'nav-a', officeCoins: 100, status: 'ready' }) }));
vi.mock('../../app/community-nav', async importOriginal => {
  const actual = await importOriginal<typeof import('../../app/community-nav')>();
  return { ...actual, COMMUNITY_FEATURE_FLAGS: { ...actual.COMMUNITY_FEATURE_FLAGS, community: true, moderation: true, news: true, newsAdmin: true }, COMMUNITY_SYSTEM_NAV: actual.COMMUNITY_SYSTEM_NAV.map(item => ({ ...item, enabled: item.id !== 'feed' })) };
});

const USER: CommunityAuthUser = { id: 'nav-a', publicId: 'nav-a', email: 'a@example.test', displayName: '导航测试', accountStatus: 'active', onboardingCompleted: true, socialVerificationStatus: 'verified' };
const mount = vi.fn();
function StatefulContent() {
  const [value, setValue] = useState('');
  const privacy = useGamePrivacy();
  useEffect(() => { mount(); }, []);
  return <section aria-label="持久内容"><input aria-label="测试草稿" value={value} onChange={event => setValue(event.target.value)} /><output aria-label="游戏暂停输入">{String(privacy.covered)}</output></section>;
}
function NormalShell() { return <><CommunityDirectoryTrigger /><aside aria-label="我的工作台"><CommunitySidebarLinks /></aside><Outlet /></>; }
function renderNav(path = '/') {
  return render(<MemoryRouter initialEntries={[path]}><CommunityWorkspaceNavigationProvider><Routes>
    <Route element={<NormalShell />}><Route path="/tools/:toolId?" element={<PublicToolsPage embedded />} /><Route path="*" element={<StatefulContent />} /></Route>
    <Route path="/games" element={<CommunityGameWorkspaceLayout />}><Route path="test" element={<StatefulContent />} /></Route>
  </Routes></CommunityWorkspaceNavigationProvider></MemoryRouter>);
}
function side() { return within(screen.getByRole('navigation', { name: '全部系统' })); }
function settings() { fireEvent.click(screen.getByRole('button', { name: '目录设置' })); return within(screen.getByRole('dialog', { name: '目录设置' })); }
function close() { fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '关闭' })); }

describe('community workspace navigation preferences and shared shells', () => {
  beforeEach(() => {
    cleanup(); vi.restoreAllMocks(); localStorage.clear(); resetCommunityAuthStoreForTests(); access.allowed = false; mount.mockClear();
    useCommunityAuthStore.setState({ phase: 'active', user: USER, sessionReady: true, restoreSession: vi.fn(async () => undefined) });
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); resetCommunityAuthStoreForTests(); });

  it('saves visibility and order explicitly, keeping hidden links recoverable and fixed controls present', () => {
    renderNav();
    let edit = settings();
    expect(edit.getByText(/不跨设备同步/)).toBeInTheDocument();
    fireEvent.click(edit.getByRole('checkbox', { name: '工具' }));
    fireEvent.click(edit.getByRole('button', { name: '上移小游戏' }));
    expect(side().getByRole('link', { name: '工具' })).toBeInTheDocument();
    fireEvent.click(edit.getByRole('button', { name: '保存目录' }));
    expect(side().queryByRole('link', { name: '工具' })).not.toBeInTheDocument();
    const saved = JSON.parse(localStorage.getItem(communityNavigationStorageKey(USER.publicId))!);
    expect(saved.hidden).toEqual(['tools']);
    expect(saved.order.indexOf('games')).toBeLessThan(saved.order.indexOf('farm'));
    close(); fireEvent.click(screen.getByRole('button', { name: '浏览全部栏目' }));
    expect(within(screen.getByRole('dialog')).getByRole('link', { name: '工具' })).toHaveAttribute('href', '/tools');
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: '目录设置' })).toBeInTheDocument();
  });

  it('can hide every optional item and restore only this account navigation defaults', () => {
    localStorage.setItem('webfish:workspace:v1:nav-a', 'unrelated');
    localStorage.setItem(communityNavigationStorageKey('nav-b'), 'other');
    renderNav(); const edit = settings();
    edit.getAllByRole('checkbox').forEach(checkbox => fireEvent.click(checkbox));
    fireEvent.click(edit.getByRole('button', { name: '保存目录' })); close();
    expect(side().queryAllByRole('link')).toHaveLength(0);
    expect(screen.getByText('已隐藏全部可选栏目，可从下方找回。')).toBeInTheDocument();
    const reopen = settings(); fireEvent.click(reopen.getByRole('button', { name: '恢复默认' }));
    expect(side().getByRole('link', { name: '工具' })).toBeInTheDocument();
    expect(localStorage.getItem(communityNavigationStorageKey(USER.publicId))).toBeNull();
    expect(localStorage.getItem(communityNavigationStorageKey('nav-b'))).toBe('other');
    expect(localStorage.getItem('webfish:workspace:v1:nav-a')).toBe('unrelated');
  });

  it('cancels unsaved changes, closes on route changes, and keeps mounted content during edits', () => {
    renderNav(); const input = screen.getByLabelText('测试草稿'); fireEvent.change(input, { target: { value: '保留' } });
    const edit = settings(); fireEvent.click(edit.getByRole('checkbox', { name: '工具' }));
    fireEvent.click(edit.getByRole('button', { name: '取消编辑' }));
    expect(side().getByRole('link', { name: '工具' })).toBeInTheDocument(); expect(input).toHaveValue('保留'); expect(mount).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '浏览全部栏目' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('link', { name: '工具' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '11 款轻量工具' })).toBeInTheDocument();
  });

  it('loads preferences by account and immediately drops old editor on account switch', () => {
    writeCommunityNavigationPreferences('nav-b', { ...defaultCommunityNavigationPreferences(), hidden: ['games'] });
    renderNav(); const edit = settings(); fireEvent.click(edit.getByRole('checkbox', { name: '工具' }));
    act(() => useCommunityAuthStore.setState({ user: { ...USER, id: 'nav-b', publicId: 'nav-b' } }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(side().queryByRole('link', { name: '小游戏' })).not.toBeInTheDocument();
    expect(side().getByRole('link', { name: '工具' })).toBeInTheDocument();
    expect(localStorage.getItem(communityNavigationStorageKey('nav-a'))).toBeNull();
  });

  it('discards a draft at an explicit new session even for the same account', () => {
    renderNav(); const edit = settings(); fireEvent.click(edit.getByRole('checkbox', { name: '工具' }));
    act(() => { setCommunitySessionTokens(null); useCommunityAuthStore.setState({ loading: false }); });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(settings().getByRole('checkbox', { name: '工具' })).toBeChecked();
    expect(localStorage.getItem(communityNavigationStorageKey('nav-a'))).toBeNull();
  });

  it('synchronizes the current account across tabs, ignores others, and blocks stale draft overwrites', () => {
    renderNav(); const edit = settings(); fireEvent.click(edit.getByRole('checkbox', { name: '工具' }));
    localStorage.setItem(communityNavigationStorageKey('nav-b'), JSON.stringify({ ...defaultCommunityNavigationPreferences(), hidden: ['games'] }));
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: communityNavigationStorageKey('nav-b') })));
    expect(side().getByRole('link', { name: '小游戏' })).toBeInTheDocument();
    localStorage.setItem(communityNavigationStorageKey('nav-a'), JSON.stringify({ ...defaultCommunityNavigationPreferences(), hidden: ['games'] }));
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: communityNavigationStorageKey('nav-a') })));
    expect(side().queryByRole('link', { name: '小游戏' })).not.toBeInTheDocument();
    expect(edit.getByRole('button', { name: '保存目录' })).toBeDisabled();
    fireEvent.click(edit.getByRole('button', { name: '载入最新设置' }));
    expect(edit.getByRole('checkbox', { name: '工具' })).toBeChecked();
    expect(edit.getByRole('checkbox', { name: '小游戏' })).not.toBeChecked();
    expect(edit.getByRole('button', { name: '保存目录' })).toBeEnabled();
  });

  it('catches a competing change even before its storage event arrives', () => {
    renderNav(); const edit = settings();
    localStorage.setItem(communityNavigationStorageKey('nav-a'), JSON.stringify({ ...defaultCommunityNavigationPreferences(), hidden: ['games'] }));
    fireEvent.click(edit.getByRole('button', { name: '保存目录' }));
    expect(edit.getByRole('button', { name: '载入最新设置' })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(communityNavigationStorageKey('nav-a'))!).hidden).toEqual(['games']);
  });

  it('falls back safely on malformed cache without overwriting unreadable preferences', () => {
    localStorage.setItem(communityNavigationStorageKey('nav-a'), '{bad'); renderNav();
    const edit = settings(); expect(edit.getByText(/目录偏好未能读取/)).toBeInTheDocument();
    fireEvent.click(edit.getByRole('checkbox', { name: '工具' }));
    fireEvent.click(edit.getByRole('button', { name: '保存目录' }));
    expect(edit.getByText(/未覆盖已有设置/)).toBeInTheDocument();
    expect(localStorage.getItem(communityNavigationStorageKey('nav-a'))).toBe('{bad');
    fireEvent.click(edit.getByRole('button', { name: '恢复默认' }));
    expect(localStorage.getItem(communityNavigationStorageKey('nav-a'))).toBeNull();
    expect(side().getByRole('link', { name: '工具' })).toBeInTheDocument();
  });

  it('falls back to accessible defaults when the browser denies writes', () => {
    renderNav(); const edit = settings(); fireEvent.click(edit.getByRole('checkbox', { name: '工具' }));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    fireEvent.click(edit.getByRole('button', { name: '保存目录' }));
    expect(edit.getByText(/浏览器未允许保存/)).toBeInTheDocument();
    expect(side().getByRole('link', { name: '工具' })).toBeInTheDocument();
  });

  it('contains storage getter failures during cross-tab refresh without overwriting previous settings', () => {
    const realStorage = window.localStorage;
    realStorage.setItem(communityNavigationStorageKey('nav-a'), JSON.stringify({ ...defaultCommunityNavigationPreferences(), hidden: ['games'] }));
    renderNav();
    const getter = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError'); });
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: communityNavigationStorageKey('nav-a'), storageArea: realStorage })));
    expect(side().getByRole('link', { name: '小游戏' })).toBeInTheDocument();
    const edit = settings(); fireEvent.click(edit.getByRole('button', { name: '保存目录' }));
    expect(edit.getByText(/未覆盖已有设置/)).toBeInTheDocument();
    getter.mockRestore();
    expect(JSON.parse(realStorage.getItem(communityNavigationStorageKey('nav-a'))!).hidden).toEqual(['games']);
  });

  it('keeps keyboard focus in settings and closes before global shortcuts', () => {
    renderNav(); const trigger = screen.getByRole('button', { name: '目录设置' }); trigger.focus();
    fireEvent.click(trigger); const edit = within(screen.getByRole('dialog', { name: '目录设置' }));
    const first = edit.getByRole('button', { name: '关闭' }); expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true }); expect(edit.getByRole('button', { name: '保存目录' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' }); expect(first).toHaveFocus();
    const shortcut = vi.fn(); window.addEventListener('keydown', shortcut);
    fireEvent.keyDown(first, { key: 'Escape' });
    expect(shortcut).not.toHaveBeenCalled(); expect(trigger).toHaveFocus(); expect(document.body.style.overflow).toBe('');
    window.removeEventListener('keydown', shortcut);
  });

  it('does not customize guest preferences or expose disabled/admin/development entries from cache', () => {
    localStorage.setItem(communityNavigationStorageKey('nav-a'), JSON.stringify({ version: 1, order: ['development', 'moderation', 'feed', 'tools'], hidden: [] }));
    renderNav(); expect(side().queryByRole('link', { name: '投喂' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '浏览全部栏目' }));
    let dialog = within(screen.getByRole('dialog'));
    expect(dialog.queryByRole('link', { name: '开发协作' })).not.toBeInTheDocument(); expect(dialog.queryByRole('link', { name: '审核台' })).not.toBeInTheDocument();
    act(() => useCommunityAuthStore.setState({ phase: 'guest', user: null }));
    expect(screen.queryByRole('button', { name: '目录设置' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '浏览全部栏目' })); dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByRole('link', { name: '登录账号' })).toBeInTheDocument();
  });

  it('updates real management roles and development permission without taking them from preferences', () => {
    access.allowed = true; renderNav(); expect(side().getByRole('link', { name: '开发协作' })).toBeInTheDocument();
    act(() => useCommunityAuthStore.setState({ user: { ...USER, roles: ['admin'] } }));
    fireEvent.click(screen.getByRole('button', { name: '浏览全部栏目' }));
    expect(within(screen.getByRole('dialog')).getByRole('link', { name: '审核台' })).toBeInTheDocument();
    access.allowed = false;
    act(() => useCommunityAuthStore.setState({ user: { ...USER, roles: [] } }));
    expect(within(screen.getByRole('dialog')).queryByRole('link', { name: '审核台' })).not.toBeInTheDocument();
    expect(side().queryByRole('link', { name: '开发协作' })).not.toBeInTheDocument();
  });

  it('keeps a mounted game and its draft when collapsing, editing or temporarily covering input', () => {
    renderNav('/games/test'); const input = screen.getByLabelText('测试草稿'); fireEvent.change(input, { target: { value: '不会重开' } });
    fireEvent.click(screen.getByRole('button', { name: '收起侧目录' }));
    expect(screen.queryByRole('navigation', { name: '全部系统' })).not.toBeInTheDocument();
    expect(input).toHaveValue('不会重开'); expect(mount).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '浏览全部栏目' }));
    expect(screen.getByLabelText('游戏暂停输入')).toHaveTextContent('true');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('游戏暂停输入')).toHaveTextContent('false');
    expect(screen.getByRole('button', { name: /便签遮罩/ })).toHaveAttribute('aria-pressed', 'false');
    expect(input).toHaveValue('不会重开'); expect(mount).toHaveBeenCalledTimes(1);
  });

  it('hides the full rail during the privacy cover, preserves notes, and handles Escape in layer order', () => {
    renderNav('/games/test'); fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('navigation', { name: '全部系统' })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: '工作台导航' })).not.toBeInTheDocument();
    const notes = screen.getByRole('textbox', { name: '便签内容' }); fireEvent.change(notes, { target: { value: '会议待办' } });
    fireEvent.click(screen.getByRole('button', { name: '浏览全部栏目' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(notes).toHaveValue('会议待办');
    expect(screen.getByRole('button', { name: /返回工作区/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(window, { key: 'Escape' }); expect(screen.getByRole('navigation', { name: '全部系统' })).toBeInTheDocument(); expect(mount).toHaveBeenCalledTimes(1);
  });

  it('keeps local tool filters and runner input mounted when only the directory changes', async () => {
    renderNav('/tools/json-formatter');
    const input = await screen.findByLabelText('JSON 文本'); fireEvent.change(input, { target: { value: '{"keep":true}' } });
    fireEvent.click(screen.getByRole('button', { name: '浏览全部栏目' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByLabelText('JSON 文本')).toBe(input); expect(input).toHaveValue('{"keep":true}');
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.click(within(screen.getByRole('dialog', { name: 'JSON 格式化' })).getByRole('button', { name: '关闭' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(document.body.style.overflow).toBe('');
  });

  it('does not leave body scrolling locked when directory navigation closes a local tool', async () => {
    renderNav('/tools/json-formatter'); await screen.findByLabelText('JSON 文本');
    fireEvent.click(screen.getByRole('button', { name: '浏览全部栏目' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: '全部栏目' })).getByRole('link', { name: '首页' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(document.body.style.overflow).toBe('');
  });
});
