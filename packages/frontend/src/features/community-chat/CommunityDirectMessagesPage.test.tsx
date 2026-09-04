import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  resetCommunityAuthStoreForTests,
  useCommunityAuthStore,
} from '../../app/store/community-auth-store';
import {
  communityChatApi,
  communityDirectMessagesApi,
  type CommunityDirectConversation,
  type CommunityDirectConversationPage,
  type CommunityDirectMessage,
  type CommunityDirectMessagePage,
} from '../../api/community';
import { CommunityDirectMessagesPage } from './CommunityDirectMessagesPage';
import { resetCommunityChatConnectionForTests } from './community-chat-connection';

class DirectFakeSocket {
  static instances: DirectFakeSocket[] = [];
  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  sent: string[] = [];

  constructor() { DirectFakeSocket.instances.push(this); }
  send(data: string): void { this.sent.push(data); }
  close(): void { this.readyState = 3; }
  open(): void { this.readyState = 1; this.onopen?.(new Event('open')); }
  receive(value: unknown): void {
    this.onmessage?.({ data: JSON.stringify(value) } as MessageEvent);
  }
  remoteClose(code = 1006): void {
    this.readyState = 3;
    this.onclose?.({ code, reason: 'remote close' } as CloseEvent);
  }
}

const conversation: CommunityDirectConversation = {
  id: 'conversation-1',
  friend: {
    publicId: 'friend-public-id', username: 'xiaoli', displayName: '小李', avatarKey: 'green',
  },
  latestSequence: 0,
  lastMessage: null,
  unreadCount: 1,
  canSend: true,
  updatedAt: '2026-09-04T10:00:00.000Z',
};

function conversationView(
  id: string,
  displayName: string,
  overrides: Partial<CommunityDirectConversation> = {},
): CommunityDirectConversation {
  return {
    id,
    friend: {
      publicId: `${id}-friend`,
      username: `${id}-user`,
      displayName,
      avatarKey: 'green',
    },
    latestSequence: 0,
    lastMessage: null,
    unreadCount: 0,
    canSend: true,
    updatedAt: '2026-09-04T10:00:00.000Z',
    ...overrides,
  };
}

function directMessage(
  clientMessageId: string,
  overrides: Partial<CommunityDirectMessage> = {},
): CommunityDirectMessage {
  return {
    id: 'direct-message-1', conversationId: conversation.id,
    clientMessageId, sequence: 1, version: 1,
    visibility: 'visible', body: '下班后一起喝咖啡',
    author: { publicId: 'my-public-id', displayName: '我' },
    replyTo: null,
    createdAt: '2026-09-04T10:01:00.000Z',
    updatedAt: '2026-09-04T10:01:00.000Z',
    permissions: { canWithdraw: true, withdrawUntil: '2099-01-01T00:00:00.000Z', canReport: false },
    ...overrides,
  };
}

function directMessagePage(
  items: CommunityDirectMessage[],
  overrides: Partial<CommunityDirectMessagePage> = {},
): CommunityDirectMessagePage {
  return {
    items,
    latestSequence: items.at(-1)?.sequence ?? 0,
    oldestSequence: items[0]?.sequence ?? null,
    hasMoreBefore: false,
    hasMoreAfter: false,
    ...overrides,
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('CommunityDirectMessagesPage', () => {
  beforeEach(() => {
    DirectFakeSocket.instances = [];
    resetCommunityChatConnectionForTests();
    resetCommunityAuthStoreForTests();
    useCommunityAuthStore.setState({
      phase: 'active', sessionReady: true,
      user: {
        id: 'internal-user-id', publicId: 'my-public-id', username: 'me',
        email: 'account@users.invalid', displayName: '我', accountStatus: 'active',
        onboardingCompleted: true, socialVerificationStatus: 'unverified',
      },
    });
    vi.stubGlobal('WebSocket', DirectFakeSocket);
    vi.spyOn(communityDirectMessagesApi, 'listConversations').mockResolvedValue({
      items: [conversation], totalUnread: 1, nextCursor: null,
    });
    vi.spyOn(communityDirectMessagesApi, 'listMessages').mockResolvedValue({
      items: [], latestSequence: 0, oldestSequence: null, hasMoreBefore: false,
    });
    vi.spyOn(communityDirectMessagesApi, 'markRead').mockResolvedValue({
      conversationId: conversation.id, lastReadSequence: 0, unreadCount: 0,
    });
    vi.spyOn(communityChatApi, 'createSocketTicket').mockResolvedValue({
      ticket: 'direct-ticket', expiresAt: '2099-01-01T00:00:00.000Z', protocolVersion: 1,
    });
  });

  afterEach(() => {
    act(() => resetCommunityChatConnectionForTests());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('sends over WebSocket and replaces the optimistic item with the targeted realtime message', async () => {
    render(
      <MemoryRouter initialEntries={['/messages/conversation-1']}>
        <Routes>
          <Route path="/messages/:conversationId" element={<CommunityDirectMessagesPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect((await screen.findAllByText('小李')).length).toBeGreaterThan(0);
    await waitFor(() => expect(DirectFakeSocket.instances).toHaveLength(1));
    const socket = DirectFakeSocket.instances[0];
    act(() => {
      socket.open();
      socket.receive({
        type: 'chat.authenticated', protocolVersion: 1,
        sessionId: 'session-1', serverTime: 'now',
      });
    });
    expect(await screen.findByText('实时在线')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: '消息' }), {
      target: { value: '下班后一起喝咖啡' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));
    const sent = socket.sent.map((frame) => JSON.parse(frame)).find((frame) => frame.type === 'chat.direct.send');
    expect(sent).toMatchObject({
      conversationId: conversation.id,
      body: '下班后一起喝咖啡',
    });
    expect(screen.getByText('发送中…')).toBeInTheDocument();

    act(() => {
      socket.receive({
        type: 'chat.ack', protocolVersion: 1, action: 'direct-send',
        requestId: sent.requestId, clientMessageId: sent.clientMessageId,
        conversationId: conversation.id, messageId: 'direct-message-1',
        sequence: 1, serverTime: 'now',
      });
      socket.receive({
        type: 'chat.direct.message.created', protocolVersion: 1,
        message: directMessage(sent.clientMessageId),
      });
    });

    expect((await screen.findAllByText('下班后一起喝咖啡')).length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.queryByText('已送达')).not.toBeInTheDocument());
  });

  it('reconciles a committed send from REST when the realtime message event is lost', async () => {
    let committedClientMessageId: string | undefined;
    vi.mocked(communityDirectMessagesApi.listMessages).mockImplementation(async (_id, options = {}) => {
      if (committedClientMessageId && options.afterSequence === 0) {
        return {
          items: [directMessage(committedClientMessageId)],
          latestSequence: 1,
          oldestSequence: 1,
          hasMoreBefore: false,
          hasMoreAfter: false,
        };
      }
      return { items: [], latestSequence: 0, oldestSequence: null, hasMoreBefore: false };
    });
    render(
      <MemoryRouter initialEntries={['/messages/conversation-1']}>
        <Routes>
          <Route path="/messages/:conversationId" element={<CommunityDirectMessagesPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findAllByText('小李');
    const socket = DirectFakeSocket.instances[0];
    act(() => {
      socket.open();
      socket.receive({
        type: 'chat.authenticated', protocolVersion: 1,
        sessionId: 'session-1', serverTime: 'now',
      });
    });
    await screen.findByText('实时在线');
    fireEvent.change(screen.getByRole('textbox', { name: '消息' }), {
      target: { value: '下班后一起喝咖啡' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));
    const sent = socket.sent.map((frame) => JSON.parse(frame)).find((frame) => frame.type === 'chat.direct.send');
    committedClientMessageId = sent.clientMessageId;

    act(() => socket.receive({
      type: 'chat.ack', protocolVersion: 1, action: 'direct-send',
      requestId: sent.requestId, clientMessageId: sent.clientMessageId,
      conversationId: conversation.id, messageId: 'direct-message-1',
      sequence: 1, serverTime: 'now',
    }));

    await waitFor(() => expect(screen.queryByText('已送达')).not.toBeInTheDocument());
    expect(screen.getAllByText('下班后一起喝咖啡')).toHaveLength(1);
    expect(communityDirectMessagesApi.listMessages).toHaveBeenCalledWith(
      conversation.id,
      expect.objectContaining({ afterSequence: 0 }),
    );
  });

  it('fills the private-message gap after a reconnect', async () => {
    let serveGap = false;
    vi.mocked(communityDirectMessagesApi.listMessages).mockImplementation(async (_id, options = {}) => {
      if (serveGap && options.afterSequence === 0) {
        return {
          items: [directMessage('remote-client-message')],
          latestSequence: 1,
          oldestSequence: 1,
          hasMoreBefore: false,
          hasMoreAfter: false,
        };
      }
      return { items: [], latestSequence: 0, oldestSequence: null, hasMoreBefore: false };
    });
    render(
      <MemoryRouter initialEntries={['/messages/conversation-1']}>
        <Routes>
          <Route path="/messages/:conversationId" element={<CommunityDirectMessagesPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findAllByText('小李');
    const firstSocket = DirectFakeSocket.instances[0];
    act(() => {
      firstSocket.open();
      firstSocket.receive({
        type: 'chat.authenticated', protocolVersion: 1,
        sessionId: 'session-1', serverTime: 'now',
      });
    });
    await screen.findByText('实时在线');
    serveGap = true;
    act(() => firstSocket.remoteClose());

    await waitFor(() => expect(DirectFakeSocket.instances).toHaveLength(2), { timeout: 2_000 });
    const secondSocket = DirectFakeSocket.instances[1];
    act(() => {
      secondSocket.open();
      secondSocket.receive({
        type: 'chat.authenticated', protocolVersion: 1,
        sessionId: 'session-2', serverTime: 'now',
      });
    });

    expect(await screen.findByText('下班后一起喝咖啡')).toBeInTheDocument();
    expect(communityDirectMessagesApi.listMessages).toHaveBeenCalledWith(
      conversation.id,
      expect.objectContaining({ afterSequence: 0 }),
    );
  });

  it('does not let stale recovery or older-history responses pollute a newly selected conversation', async () => {
    const firstConversation = conversationView('conversation-1', '一号同事', {
      latestSequence: 2,
    });
    const secondConversation = conversationView('conversation-2', '二号同事', {
      latestSequence: 1,
    });
    const firstRecent = directMessage('first-recent', {
      id: 'first-recent',
      conversationId: firstConversation.id,
      sequence: 2,
      body: '一号最近消息',
    });
    const secondMessage = directMessage('second-message', {
      id: 'second-message',
      conversationId: secondConversation.id,
      sequence: 1,
      body: '二号会话消息',
    });
    const olderRequest = deferred<CommunityDirectMessagePage>();
    const recoveryRequest = deferred<CommunityDirectMessagePage>();

    vi.mocked(communityDirectMessagesApi.listConversations).mockResolvedValue({
      items: [firstConversation, secondConversation], totalUnread: 0, nextCursor: null,
    });
    vi.mocked(communityDirectMessagesApi.listMessages).mockImplementation((id, options = {}) => {
      if (id === firstConversation.id && options.beforeSequence === 2) {
        return olderRequest.promise;
      }
      if (id === firstConversation.id && options.afterSequence === 2) {
        return recoveryRequest.promise;
      }
      if (id === firstConversation.id && options.limit === 50) {
        return Promise.resolve(directMessagePage([firstRecent], { hasMoreBefore: true }));
      }
      if (id === secondConversation.id && options.limit === 50) {
        return Promise.resolve(directMessagePage([secondMessage]));
      }
      return Promise.resolve(directMessagePage([]));
    });

    render(
      <MemoryRouter initialEntries={['/messages/conversation-1']}>
        <Routes>
          <Route path="/messages/:conversationId" element={<CommunityDirectMessagesPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('一号最近消息')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '加载更早消息' }));
    await waitFor(() => expect(communityDirectMessagesApi.listMessages).toHaveBeenCalledWith(
      firstConversation.id,
      expect.objectContaining({ beforeSequence: 2 }),
    ));

    const socket = DirectFakeSocket.instances[0];
    act(() => {
      socket.open();
      socket.receive({
        type: 'chat.authenticated', protocolVersion: 1,
        sessionId: 'session-1', serverTime: 'now',
      });
    });
    await waitFor(() => expect(communityDirectMessagesApi.listMessages).toHaveBeenCalledWith(
      firstConversation.id,
      expect.objectContaining({ afterSequence: 2 }),
    ));

    fireEvent.click(screen.getByRole('link', { name: /二号同事/ }));
    expect(await screen.findByText('二号会话消息')).toBeInTheDocument();

    await act(async () => {
      olderRequest.resolve(directMessagePage([
        directMessage('first-older', {
          id: 'first-older', conversationId: firstConversation.id,
          sequence: 1, body: '迟到的一号旧消息',
        }),
      ]));
      recoveryRequest.resolve(directMessagePage([
        directMessage('first-gap', {
          id: 'first-gap', conversationId: firstConversation.id,
          sequence: 3, body: '迟到的一号补洞消息',
        }),
      ]));
      await Promise.resolve();
    });

    expect(screen.getByText('二号会话消息')).toBeInTheDocument();
    expect(screen.queryByText('迟到的一号旧消息')).not.toBeInTheDocument();
    expect(screen.queryByText('迟到的一号补洞消息')).not.toBeInTheDocument();
  });

  it('finds a deep-linked conversation on the second page and can load later pages', async () => {
    const firstPageConversation = conversationView('conversation-1', '第一页同事');
    const deepLinkedConversation = conversationView('conversation-31', '第二页目标同事');
    const thirdPageConversation = conversationView('conversation-61', '第三页同事');
    vi.mocked(communityDirectMessagesApi.listConversations).mockImplementation(
      async (cursor): Promise<CommunityDirectConversationPage> => {
        if (cursor === 'cursor-page-2') {
          return {
            items: [deepLinkedConversation], totalUnread: 0, nextCursor: 'cursor-page-3',
          };
        }
        if (cursor === 'cursor-page-3') {
          return { items: [thirdPageConversation], totalUnread: 0, nextCursor: null };
        }
        return {
          items: [firstPageConversation], totalUnread: 0, nextCursor: 'cursor-page-2',
        };
      },
    );

    render(
      <MemoryRouter initialEntries={['/messages/conversation-31']}>
        <Routes>
          <Route path="/messages/:conversationId" element={<CommunityDirectMessagesPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect((await screen.findAllByText('第二页目标同事')).length).toBeGreaterThan(0);
    expect(communityDirectMessagesApi.listConversations).toHaveBeenCalledWith('cursor-page-2');
    const composer = screen.getByRole('textbox', { name: '消息' });
    expect(composer).not.toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '加载更多会话' }));
    expect(await screen.findByText('第三页同事')).toBeInTheDocument();
    expect(communityDirectMessagesApi.listConversations).toHaveBeenCalledWith('cursor-page-3');
  });

  it('does not let an initial conversation-list response overwrite a concurrently opened chat', async () => {
    const initialList = deferred<CommunityDirectConversationPage>();
    const opened = conversationView('conversation-opened', '新打开的同事');
    let listCallCount = 0;
    vi.mocked(communityDirectMessagesApi.listConversations).mockImplementation(() => {
      listCallCount += 1;
      return listCallCount === 1
        ? initialList.promise
        : Promise.resolve({ items: [opened], totalUnread: 0, nextCursor: null });
    });
    vi.spyOn(communityDirectMessagesApi, 'openConversation').mockResolvedValue(opened);

    render(
      <MemoryRouter initialEntries={['/messages/with/new-friend']}>
        <Routes>
          <Route path="/messages/with/:friendPublicId" element={<CommunityDirectMessagesPage />} />
          <Route path="/messages/:conversationId" element={<CommunityDirectMessagesPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect((await screen.findAllByText('新打开的同事')).length).toBeGreaterThan(0);
    await act(async () => {
      initialList.resolve({ items: [], totalUnread: 0, nextCursor: null });
      await Promise.resolve();
    });

    expect(screen.getAllByText('新打开的同事').length).toBeGreaterThan(0);
    expect(screen.getByRole('textbox', { name: '消息' })).not.toBeDisabled();
  });

  it('does not mark incoming messages read while scrolled up or while the tab is hidden', async () => {
    vi.mocked(communityDirectMessagesApi.listMessages).mockResolvedValue(directMessagePage([]));
    render(
      <MemoryRouter initialEntries={['/messages/conversation-1']}>
        <Routes>
          <Route path="/messages/:conversationId" element={<CommunityDirectMessagesPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findAllByText('小李');
    const socket = DirectFakeSocket.instances[0];
    act(() => {
      socket.open();
      socket.receive({
        type: 'chat.authenticated', protocolVersion: 1,
        sessionId: 'session-1', serverTime: 'now',
      });
    });
    await waitFor(() => expect(communityDirectMessagesApi.listMessages).toHaveBeenCalledWith(
      conversation.id,
      { limit: 200 },
    ));
    vi.mocked(communityDirectMessagesApi.markRead).mockClear();

    const scroller = screen.getByLabelText('消息记录');
    Object.defineProperties(scroller, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 1_000 },
      scrollTop: { configurable: true, value: 0, writable: true },
    });
    act(() => socket.receive({
      type: 'chat.direct.message.created', protocolVersion: 1,
      message: directMessage('remote-scrolled-up', {
        id: 'remote-scrolled-up', sequence: 1, body: '上翻时收到的消息',
        author: { publicId: 'friend-public-id', displayName: '小李' },
        permissions: { canWithdraw: false, withdrawUntil: null, canReport: true },
      }),
    }));
    expect(await screen.findByText('上翻时收到的消息')).toBeInTheDocument();
    expect(communityDirectMessagesApi.markRead).not.toHaveBeenCalled();
    expect(socket.sent.map((frame) => JSON.parse(frame)).some(
      (frame) => frame.type === 'chat.direct.read',
    )).toBe(false);

    Object.defineProperty(scroller, 'scrollTop', { configurable: true, value: 900, writable: true });
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => socket.receive({
      type: 'chat.direct.message.created', protocolVersion: 1,
      message: directMessage('remote-hidden', {
        id: 'remote-hidden', sequence: 2, body: '后台收到的消息',
        author: { publicId: 'friend-public-id', displayName: '小李' },
        permissions: { canWithdraw: false, withdrawUntil: null, canReport: true },
      }),
    }));
    expect(await screen.findByText('后台收到的消息')).toBeInTheDocument();
    expect(communityDirectMessagesApi.markRead).not.toHaveBeenCalled();
    expect(socket.sent.map((frame) => JSON.parse(frame)).some(
      (frame) => frame.type === 'chat.direct.read',
    )).toBe(false);
  });

  it('refreshes the latest message versions after reconnect and applies a missed withdrawal', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const visible = directMessage('withdrawn-during-gap', {
      id: 'withdrawn-during-gap', sequence: 1, version: 1, body: '即将被撤回的消息',
      author: { publicId: 'friend-public-id', displayName: '小李' },
      permissions: { canWithdraw: false, withdrawUntil: null, canReport: true },
    });
    const withdrawn = directMessage('withdrawn-during-gap', {
      ...visible,
      version: 2,
      visibility: 'withdrawn_placeholder',
      body: null,
      permissions: { canWithdraw: false, withdrawUntil: null, canReport: false },
    });
    let serveWithdrawn = false;
    vi.mocked(communityDirectMessagesApi.listMessages).mockImplementation((_id, options = {}) => {
      if (options.limit === 50) return Promise.resolve(directMessagePage([visible]));
      if (options.afterSequence === 1) {
        return Promise.resolve(directMessagePage([], { latestSequence: 1 }));
      }
      if (options.limit === 200) {
        return Promise.resolve(directMessagePage([serveWithdrawn ? withdrawn : visible]));
      }
      return Promise.resolve(directMessagePage([]));
    });

    render(
      <MemoryRouter initialEntries={['/messages/conversation-1']}>
        <Routes>
          <Route path="/messages/:conversationId" element={<CommunityDirectMessagesPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('即将被撤回的消息')).toBeInTheDocument();
    const firstSocket = DirectFakeSocket.instances[0];
    act(() => {
      firstSocket.open();
      firstSocket.receive({
        type: 'chat.authenticated', protocolVersion: 1,
        sessionId: 'session-1', serverTime: 'now',
      });
    });
    await waitFor(() => expect(communityDirectMessagesApi.listMessages).toHaveBeenCalledWith(
      conversation.id,
      { limit: 200 },
    ));

    serveWithdrawn = true;
    act(() => firstSocket.remoteClose());
    await waitFor(() => expect(DirectFakeSocket.instances).toHaveLength(2), { timeout: 2_000 });
    const secondSocket = DirectFakeSocket.instances[1];
    act(() => {
      secondSocket.open();
      secondSocket.receive({
        type: 'chat.authenticated', protocolVersion: 1,
        sessionId: 'session-2', serverTime: 'now',
      });
    });

    expect(await screen.findByText('这条消息已撤回')).toBeInTheDocument();
    expect(screen.queryByText('即将被撤回的消息')).not.toBeInTheDocument();
  });
});
