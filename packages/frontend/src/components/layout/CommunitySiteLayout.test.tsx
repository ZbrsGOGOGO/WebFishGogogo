import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const chatConnectionHarness = vi.hoisted(() => {
  type Listener = (event: unknown) => void;
  const listeners = new Set<Listener>();
  const connection = {
    addListener: vi.fn((listener: Listener) => {
      listeners.add(listener);
      listener({
        kind: 'state',
        snapshot: { status: 'idle', reconnectAttempt: 0, lastError: null },
      });
      return () => listeners.delete(listener);
    }),
    connect: vi.fn(),
  };
  const acquire = vi.fn(() => connection);
  const release = vi.fn();
  return {
    acquire,
    release,
    connection,
    emit(event: unknown) {
      for (const listener of listeners) listener(event);
    },
    listenerCount() {
      return listeners.size;
    },
    reset() {
      listeners.clear();
      acquire.mockClear();
      release.mockClear();
      connection.addListener.mockClear();
      connection.connect.mockClear();
    },
  };
});

vi.mock('../../features/community-chat/community-chat-connection', () => ({
  acquireCommunityChatConnection: chatConnectionHarness.acquire,
  releaseCommunityChatConnection: chatConnectionHarness.release,
}));

vi.mock('../../app/community-nav', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../app/community-nav')>();
  return {
    ...actual,
    COMMUNITY_FEATURE_FLAGS: {
      ...actual.COMMUNITY_FEATURE_FLAGS,
      chat: true,
      friends: true,
    },
    COMMUNITY_SYSTEM_NAV: actual.COMMUNITY_SYSTEM_NAV.map((item) =>
      ['community', 'messages', 'friends'].includes(item.id)
        ? { ...item, enabled: true }
        : item,
    ),
  };
});

import {
  communityDirectMessagesApi,
  communityFarmApi,
  type CommunityFarmOverview,
  type CommunityAuthUser,
  type CommunityDirectConversationPage,
} from '../../api/community';
import {
  resetCommunityAuthStoreForTests,
  useCommunityAuthStore,
} from '../../app/store/community-auth-store';
import { CommunitySiteLayout } from './CommunitySiteLayout';
import { beginCommunityWalletObservation, finishCommunityWalletObservation, publishCommunityWalletOverview, resetCommunityWalletStoreForTests } from '../../app/store/community-wallet-store';

const ACTIVE_USER: CommunityAuthUser = {
  id: 'user-1',
  publicId: 'public-1',
  email: 'user@example.com',
  username: 'worker',
  displayName: '小张',
  accountStatus: 'active',
  onboardingCompleted: true,
  socialVerificationStatus: 'verified',
};

function conversationPage(totalUnread: number): CommunityDirectConversationPage {
  return { items: [], totalUnread, nextCursor: null };
}

function farmBalance(officeCoins: number, second = 10): CommunityFarmOverview {
  return { serverTime: `2026-09-08T01:00:${second}.000Z`, growth: { officeCoins } } as CommunityFarmOverview;
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<CommunitySiteLayout />}>
          <Route path="/" element={<p>工作台内容</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('CommunitySiteLayout private-message connection and unread badge', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    chatConnectionHarness.reset();
    resetCommunityAuthStoreForTests();
    resetCommunityWalletStoreForTests();
    useCommunityAuthStore.setState({
      phase: 'active',
      sessionReady: true,
      user: ACTIVE_USER,
    });
    vi.spyOn(communityDirectMessagesApi, 'listConversations').mockResolvedValue(
      conversationPage(3),
    );
    vi.spyOn(communityFarmApi, 'getOverview').mockResolvedValue(farmBalance(620));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    resetCommunityAuthStoreForTests();
    chatConnectionHarness.reset();
  });

  it('acquires one persistent connection and renders the initial total unread count', async () => {
    renderLayout();

    await waitFor(() => {
      expect(screen.getAllByRole('link', { name: '私人消息，3 条未读' }).length)
        .toBeGreaterThan(0);
    });
    expect(chatConnectionHarness.acquire).toHaveBeenCalledTimes(1);
    expect(chatConnectionHarness.connection.connect).toHaveBeenCalledTimes(1);
    expect(chatConnectionHarness.connection.addListener).toHaveBeenCalledTimes(1);
    expect(communityDirectMessagesApi.listConversations).toHaveBeenCalledTimes(1);
  });

  it('refreshes the authoritative unread total for direct-message and read events', async () => {
    vi.mocked(communityDirectMessagesApi.listConversations)
      .mockResolvedValueOnce(conversationPage(2))
      .mockResolvedValueOnce(conversationPage(5))
      .mockResolvedValueOnce(conversationPage(0));
    renderLayout();
    await screen.findAllByRole('link', { name: '私人消息，2 条未读' });

    act(() => chatConnectionHarness.emit({
      kind: 'protocol',
      event: { type: 'chat.direct.message.created' },
    }));
    await screen.findAllByRole('link', { name: '私人消息，5 条未读' });

    act(() => chatConnectionHarness.emit({
      kind: 'protocol',
      event: { type: 'chat.direct.read.updated' },
    }));
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /私人消息，\d+ 条未读/ }))
        .not.toBeInTheDocument();
    });
    expect(communityDirectMessagesApi.listConversations).toHaveBeenCalledTimes(3);
  });

  it('keeps the latest unread refresh when concurrent responses finish out of order', async () => {
    const olderRefresh = deferred<CommunityDirectConversationPage>();
    const newerRefresh = deferred<CommunityDirectConversationPage>();
    vi.mocked(communityDirectMessagesApi.listConversations)
      .mockResolvedValueOnce(conversationPage(4))
      .mockReturnValueOnce(olderRefresh.promise)
      .mockReturnValueOnce(newerRefresh.promise);
    renderLayout();
    await screen.findAllByRole('link', { name: '私人消息，4 条未读' });

    act(() => chatConnectionHarness.emit({
      kind: 'protocol',
      event: { type: 'chat.direct.message.created' },
    }));
    act(() => chatConnectionHarness.emit({
      kind: 'protocol',
      event: { type: 'chat.direct.read.updated' },
    }));
    expect(communityDirectMessagesApi.listConversations).toHaveBeenCalledTimes(3);

    await act(async () => {
      newerRefresh.resolve(conversationPage(0));
      await newerRefresh.promise;
    });
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /私人消息，\d+ 条未读/ }))
        .not.toBeInTheDocument();
    });

    await act(async () => {
      olderRefresh.resolve(conversationPage(9));
      await olderRefresh.promise;
    });
    expect(screen.queryByRole('link', { name: '私人消息，9 条未读' }))
      .not.toBeInTheDocument();
  });

  it('releases the listener and connection when logout changes the account to guest', async () => {
    const logout = vi.fn(async () => {
      useCommunityAuthStore.setState({ phase: 'guest', user: null });
    });
    useCommunityAuthStore.setState({ logout });
    renderLayout();
    await screen.findAllByRole('link', { name: '私人消息，3 条未读' });
    expect(chatConnectionHarness.listenerCount()).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: '退出' }));

    await waitFor(() => expect(chatConnectionHarness.release).toHaveBeenCalledTimes(1));
    expect(logout).toHaveBeenCalledTimes(1);
    expect(chatConnectionHarness.listenerCount()).toBe(0);
    expect(screen.queryByRole('link', { name: /私人消息，\d+ 条未读/ }))
      .not.toBeInTheDocument();
    expect(chatConnectionHarness.acquire).toHaveBeenCalledTimes(1);
  });

  it('does not acquire a chat connection for a guest', () => {
    useCommunityAuthStore.setState({ phase: 'guest', user: null });
    renderLayout();

    expect(chatConnectionHarness.acquire).not.toHaveBeenCalled();
    expect(communityDirectMessagesApi.listConversations).not.toHaveBeenCalled();
    expect(communityFarmApi.getOverview).not.toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: /办公币/ })).not.toBeInTheDocument();
  });

  it('shows a prominent real-balance link to the farm and synchronizes a farm mutation', async () => {
    renderLayout();
    expect(await screen.findByRole('link', { name: '办公币 620，查看农场余额与收益' })).toHaveAttribute('href', '/farm');
    act(() => {
      const mutation = beginCommunityWalletObservation('mutation');
      publishCommunityWalletOverview(mutation, farmBalance(420, 20));
      finishCommunityWalletObservation(mutation);
    });
    expect(screen.getByRole('link', { name: '办公币 420，查看农场余额与收益' })).toBeInTheDocument();
  });

  it('refreshes the server balance on focus without scheduled polling', async () => {
    vi.mocked(communityFarmApi.getOverview).mockResolvedValueOnce(farmBalance(620)).mockResolvedValue(farmBalance(710, 20));
    renderLayout();
    await screen.findByRole('link', { name: '办公币 620，查看农场余额与收益' });
    fireEvent.focus(window);
    expect(await screen.findByRole('link', { name: '办公币 710，查看农场余额与收益' })).toBeInTheDocument();
    expect(communityFarmApi.getOverview).toHaveBeenCalledTimes(2);
  });

  it('labels an unavailable balance without showing a fabricated zero or default 500', async () => {
    vi.mocked(communityFarmApi.getOverview).mockRejectedValue(new Error('offline'));
    renderLayout();
    const wallet = await screen.findByRole('link', { name: '办公币 余额未同步，查看农场余额与收益' });
    expect(wallet).not.toHaveTextContent('500');
    expect(wallet).not.toHaveTextContent('0');
  });

  it('retains the last trusted amount with an unsynced label when refreshing fails', async () => {
    vi.mocked(communityFarmApi.getOverview).mockResolvedValueOnce(farmBalance(620)).mockRejectedValue(new Error('offline'));
    renderLayout();
    await screen.findByRole('link', { name: '办公币 620，查看农场余额与收益' });
    fireEvent.focus(window);
    expect(await screen.findByRole('link', { name: '办公币 620，待同步，查看农场余额与收益' })).toBeInTheDocument();
  });

  it('removes the wallet immediately when the active session becomes restricted', async () => {
    renderLayout();
    await screen.findByRole('link', { name: '办公币 620，查看农场余额与收益' });
    act(() => useCommunityAuthStore.setState({ phase: 'suspended' }));
    expect(screen.queryByRole('link', { name: /办公币/ })).not.toBeInTheDocument();
  });
});
