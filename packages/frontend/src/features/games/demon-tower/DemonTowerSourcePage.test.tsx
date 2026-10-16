import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetCommunityAuthStoreForTests, useCommunityAuthStore } from '../../../app/store/community-auth-store';
import { useCommunityThemeStore } from '../../../app/store/community-theme-store';
import { GamePrivacyProvider } from '../GamePrivacyContext';
import { DemonTowerPage } from './DemonTowerPage';

const api = vi.hoisted(() => ({
  world: vi.fn(), progress: vi.fn(), saveProgress: vi.fn(), damage: vi.fn(), channel: vi.fn(), clue: vi.fn(),
  contribution: vi.fn(), friends: vi.fn(), battleProfile: vi.fn(), ranking: vi.fn(), settings: vi.fn(), stories: vi.fn(),
}));
vi.mock('../../../api/community-demon-tower-source', () => ({ communityDemonTowerSourceApi: api }));

const world = {
  server: { day: 1, pop: 2_000, lvAvg: 30, sourceVersion: '2fe1c88e' as const },
  layers: [{ layerId: 1, status: 'open' as const, bossHp: 1_200, bossMaxHp: 1_200, clues: 0, channel: 0, channelGoal: 280, bossName: '犼野', terrain: 'plain' as const, version: 1 }],
};

function show(route = '/games/demon-tower', toggleCover = vi.fn()) {
  return render(<MemoryRouter initialEntries={[route]}><GamePrivacyProvider value={{ covered: false, toggleCover }}><DemonTowerPage /></GamePrivacyProvider></MemoryRouter>);
}

function frame(): HTMLIFrameElement { return screen.getByTitle('九层妖塔源码版游戏画面'); }
function notify(data: Record<string, unknown>, overrides: Partial<MessageEventInit> = {}): void {
  const game = frame();
  const nonce = new URL(game.src).searchParams.get('bridge');
  act(() => window.dispatchEvent(new MessageEvent('message', {
    source: game.contentWindow,
    origin: 'null',
    data: { source: 'webfish-demon-tower-source-v1', nonce, ...data },
    ...overrides,
  })));
}

describe('九层妖塔 ZIP source wrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCommunityAuthStoreForTests();
    useCommunityAuthStore.setState({
      phase: 'active', sessionReady: true,
      user: { id: 'member-a', publicId: 'member-a', email: 'member@invalid.test', username: 'member-a', displayName: '测试道友', accountStatus: 'active', onboardingCompleted: true, socialVerificationStatus: 'unverified' },
    });
    useCommunityThemeStore.setState({ preference: 'light', resolved: 'light', storageUnavailable: false });
    api.progress.mockResolvedValue({ exists: true, version: 3, saveData: '{"level":9}', updatedAt: '2026-10-16T00:00:00.000Z' });
    api.world.mockResolvedValue(world);
    api.saveProgress.mockResolvedValue({ requestId: 'save-a', version: 4, replayed: false, updatedAt: '2026-10-16T00:00:00.000Z' });
    api.damage.mockResolvedValue({ requestId: 'damage-a', replayed: false, accepted: 10, unlockedLayer: null, layer: world.layers[0], profileVersion: 4, profileUpdatedAt: '2026-10-16T00:00:00.000Z' });
    api.channel.mockResolvedValue({ requestId: 'channel-a', replayed: false, accepted: 10, unlockedLayer: null, layer: world.layers[0], profileVersion: 4, profileUpdatedAt: '2026-10-16T00:00:00.000Z' });
    api.clue.mockResolvedValue({ requestId: 'clue-a', replayed: false, accepted: 1, unlockedLayer: null, layer: { ...world.layers[0], clues: 1 }, profileVersion: 4, profileUpdatedAt: '2026-10-16T00:00:00.000Z' });
    api.contribution.mockResolvedValue([]); api.friends.mockResolvedValue([]); api.ranking.mockResolvedValue([]);
    api.settings.mockResolvedValue([]); api.stories.mockResolvedValue([]);
  });

  it('uses an opaque sandbox and does not start the child before authenticated progress preflight', async () => {
    show(); const game = frame();
    expect(game).toHaveAttribute('sandbox', 'allow-scripts allow-modals');
    expect(game.getAttribute('sandbox')).not.toContain('allow-same-origin');
    expect(game.src).toContain('/games/demon-tower-source/index.html?bridge=');
    expect(screen.getByText(/塔内办公币为本玩法独立货币/)).toBeVisible();
    expect(api.progress).not.toHaveBeenCalled();

    const post = vi.spyOn(game.contentWindow!, 'postMessage');
    notify({ kind: 'ready' });
    await waitFor(() => expect(api.progress).toHaveBeenCalledOnce());
    await waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({ kind: 'init', displayName: '测试道友' }), '*'));
    expect(screen.getByText('正在核对联网档案…')).toBeVisible();
    notify({ kind: 'hydrated' });
    expect(screen.queryByText('正在核对联网档案…')).not.toBeInTheDocument();
  });

  it('rejects the wrong frame, origin and nonce, then serves only a valid whitelisted RPC', async () => {
    show(); const game = frame(); const post = vi.spyOn(game.contentWindow!, 'postMessage');
    notify({ kind: 'ready' }); await waitFor(() => expect(api.progress).toHaveBeenCalledOnce()); notify({ kind: 'hydrated' });
    post.mockClear();
    notify({ kind: 'request', id: 'wrong-origin', method: 'getServer', args: [] }, { origin: 'https://invalid.test' });
    notify({ kind: 'request', id: 'wrong-frame', method: 'getServer', args: [] }, { source: window });
    notify({ kind: 'request', id: 'wrong-nonce', method: 'getServer', args: [], nonce: 'wrong' });
    notify({ kind: 'request', id: 'extra-envelope-key', method: 'getServer', args: [], token: 'must-not-be-accepted' });
    expect(post).not.toHaveBeenCalled();
    notify({ kind: 'request', id: 'good', method: 'getServer', args: [] });
    await waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({ kind: 'response', id: 'good', ok: true, result: world.server }), '*'));
    notify({ kind: 'request', id: 'unsupported', method: 'readToken', args: [] });
    await waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({ kind: 'response', id: 'unsupported', ok: false }), '*'));
    const requestId = '00000000-0000-4000-8000-000000000001';
    notify({ kind: 'request', id: 'atomic', method: 'postDamage', args: [{ requestId, layerId: 1, damage: 10, expectedVersion: 3, saveData: '{"level":9}' }] });
    await waitFor(() => expect(api.damage).toHaveBeenCalledWith({ requestId, layerId: 1, amount: 10, expectedVersion: 3, saveData: '{"level":9}' }, expect.any(AbortSignal)));
    notify({ kind: 'request', id: 'clue', method: 'postClue', args: [{ requestId, layerId: 1, clues: 1, expectedVersion: 3, saveData: '{"level":9}' }] });
    await waitFor(() => expect(api.clue).toHaveBeenCalledWith({ requestId, layerId: 1, amount: 1, expectedVersion: 3, saveData: '{"level":9}' }, expect.any(AbortSignal)));
    notify({ kind: 'request', id: 'missing-id', method: 'postDamage', args: [{ layerId: 1, damage: 10, expectedVersion: 3, saveData: '{"level":9}' }] });
    await waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({ kind: 'response', id: 'missing-id', ok: false }), '*'));
  });

  it('bounds iframe resize, forwards theme without reloading, and proxies Escape to the workspace', async () => {
    const toggle = vi.fn(); show('/games/demon-tower?tab=rank', toggle); const game = frame();
    expect(new URL(game.src).searchParams.get('tab')).toBe('rank');
    const original = game;
    const post = vi.spyOn(game.contentWindow!, 'postMessage');
    notify({ kind: 'ready' }); await waitFor(() => expect(api.progress).toHaveBeenCalledOnce()); notify({ kind: 'hydrated' });
    notify({ kind: 'resize', height: 999_999 }); expect(game.style.height).toBe('16000px');
    notify({ kind: 'escape' }); expect(toggle).toHaveBeenCalledOnce();
    act(() => useCommunityThemeStore.setState({ resolved: 'dark' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({ kind: 'theme', theme: 'dark' }), '*'));
    expect(frame()).toBe(original);
  });

  it('performs a fresh child handshake when the account display name changes', async () => {
    show(); const first = frame(); const firstUrl = first.src;
    notify({ kind: 'ready' });
    await waitFor(() => expect(api.progress).toHaveBeenCalledOnce());
    act(() => useCommunityAuthStore.setState((state) => ({ user: state.user ? { ...state.user, displayName: '改名道友' } : state.user })));
    await waitFor(() => expect(frame()).not.toBe(first));
    expect(frame().src).not.toBe(firstUrl);
    const post = vi.spyOn(frame().contentWindow!, 'postMessage');
    notify({ kind: 'ready' });
    await waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({ kind: 'init', displayName: '改名道友' }), '*'));
  });
});
