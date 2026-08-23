import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  COMMUNITY_CHAT_ROOM_DEFINITIONS,
  communityChatApi,
  type CommunityChatMessage,
  type CommunityChatRoom,
} from '../../api/community';
import { resetCommunityChatConnectionForTests } from './community-chat-connection';
import { CommunityChatLobbyPage } from './CommunityChatLobbyPage';
import { CommunityChatRoomPage } from './CommunityChatRoomPage';

const rooms: CommunityChatRoom[] = COMMUNITY_CHAT_ROOM_DEFINITIONS.map((definition, index) => ({
  slug: definition.slug,
  name: definition.name,
  description: definition.shortDescription,
  readOnly: index === 1,
  closed: index === 5,
  slowModeSeconds: index === 0 ? 5 : 0,
  retryAfterSeconds: null,
  presenceBand: index === 2 ? 'busy' : 'active',
  latestSequence: 0,
  mentionCandidates: [{ publicId: 'public-2', displayName: '小李' }],
}));

class BrowserFakeSocket {
  static instances: BrowserFakeSocket[] = [];
  readonly url: string;
  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  sent: string[] = [];

  constructor(url: string) {
    this.url = url;
    BrowserFakeSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(code = 1000, reason = ''): void {
    this.readyState = 3;
    this.onclose?.({ code, reason } as CloseEvent);
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }

  receive(value: unknown): void {
    this.onmessage?.({ data: JSON.stringify(value) } as MessageEvent);
  }
}

function serverMessage(clientMessageId: string): CommunityChatMessage {
  return {
    id: 'message-1',
    clientMessageId,
    roomSlug: 'general',
    sequence: 1,
    version: 1,
    visibility: 'visible',
    body: '这是一条真实服务端消息',
    author: { publicId: 'public-1', displayName: '当前用户' },
    replyTo: null,
    mentionPublicIds: [],
    createdAt: '2026-08-22T10:00:00.000Z',
    updatedAt: '2026-08-22T10:00:00.000Z',
    permissions: {
      canWithdraw: true,
      withdrawUntil: '2099-08-22T10:02:00.000Z',
      canReport: true,
    },
  };
}

describe('community fixed chat pages', () => {
  beforeEach(() => {
    BrowserFakeSocket.instances = [];
    resetCommunityChatConnectionForTests();
    vi.spyOn(communityChatApi, 'listRooms').mockResolvedValue({
      items: rooms,
      serverTime: '2026-08-22T10:00:00.000Z',
      onlineCount: 937,
    } as never);
  });

  afterEach(() => {
    act(() => resetCommunityChatConnectionForTests());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows all six fixed rooms with approximate activity but ignores an exact online count', async () => {
    render(<MemoryRouter><CommunityChatLobbyPage /></MemoryRouter>);

    expect(await screen.findByRole('region', { name: '六个固定聊天室' })).toBeInTheDocument();
    for (const definition of COMMUNITY_CHAT_ROOM_DEFINITIONS) {
      expect(screen.getByText(definition.name)).toBeInTheDocument();
    }
    expect(screen.getAllByText('有人交流').length).toBeGreaterThan(0);
    expect(screen.queryByText(/937/)).not.toBeInTheDocument();
    expect(screen.getByText('已关闭')).toBeInTheDocument();
    expect(screen.getByText('只读')).toBeInTheDocument();
  });

  it('keeps pending, failed and acknowledged delivery distinct and retries with one clientMessageId', async () => {
    vi.stubGlobal('WebSocket', BrowserFakeSocket);
    vi.spyOn(communityChatApi, 'listMessages').mockResolvedValue({
      items: [], latestSequence: 0, oldestSequence: null, hasMoreBefore: false,
    });
    vi.spyOn(communityChatApi, 'createSocketTicket').mockResolvedValue({
      ticket: 'single-use-ticket', expiresAt: '2099-08-22T10:01:00.000Z', protocolVersion: 1,
    });

    render(
      <MemoryRouter initialEntries={['/community/chat/general']}>
        <Routes>
          <Route path="/community/chat/:roomSlug" element={<CommunityChatRoomPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('textbox', { name: '消息内容' })).toBeInTheDocument();
    await waitFor(() => expect(BrowserFakeSocket.instances).toHaveLength(1));
    const socket = BrowserFakeSocket.instances[0];
    expect(socket.url).toMatch(/\/ws\/chat$/);
    expect(socket.url).not.toContain('ticket');
    act(() => {
      socket.open();
      socket.receive({
        type: 'chat.authenticated', protocolVersion: 1,
        sessionId: 'session-1', serverTime: '2026-08-22T10:00:00.000Z',
      });
      socket.receive({
        type: 'chat.ready', protocolVersion: 1,
        rooms: [{ roomSlug: 'general', latestSequence: 0 }],
      });
    });
    expect(await screen.findByText('在线')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: '消息内容' }), {
      target: { value: '这是一条真实服务端消息' },
    });
    await waitFor(() => expect(screen.getByRole('button', { name: '发送消息' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '发送消息' }));

    expect(screen.getByText('发送中')).toBeInTheDocument();
    const firstSend = socket.sent.map((frame) => JSON.parse(frame)).find((frame) => frame.type === 'chat.send');
    expect(firstSend).toMatchObject({
      roomSlug: 'general', body: '这是一条真实服务端消息', protocolVersion: 1,
    });
    act(() => {
      socket.receive({
        type: 'chat.error', protocolVersion: 1, code: 'CHAT_SLOW_MODE',
        message: '请稍后重试', requestId: firstSend.requestId,
        clientMessageId: firstSend.clientMessageId, roomSlug: 'general', retryAfterSeconds: 0,
      });
    });
    expect(await screen.findByText('发送失败：请稍后重试')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '重新发送' }));
    const sendFrames = socket.sent.map((frame) => JSON.parse(frame)).filter((frame) => frame.type === 'chat.send');
    expect(sendFrames).toHaveLength(2);
    expect(sendFrames[1].clientMessageId).toBe(firstSend.clientMessageId);

    act(() => {
      socket.receive({
        type: 'chat.ack', protocolVersion: 1, action: 'send',
        requestId: sendFrames[1].requestId, clientMessageId: firstSend.clientMessageId,
        messageId: 'message-1', sequence: 1, serverTime: '2026-08-22T10:00:01.000Z',
      });
    });
    expect(await screen.findByText('已发送')).toBeInTheDocument();
    act(() => {
      socket.receive({ type: 'chat.message.created', protocolVersion: 1, message: serverMessage(firstSend.clientMessageId) });
    });
    expect(await screen.findByText('这是一条真实服务端消息')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('region', { name: '待发送消息' })).not.toBeInTheDocument());
  });
});
