import { describe, expect, it, vi } from 'vitest';

import {
  CommunityChatConnection,
  acquireCommunityChatConnection,
  communityChatReconnectDelay,
  resolveCommunityChatWebSocketUrl,
  releaseCommunityChatConnection,
  resetCommunityChatConnectionForTests,
} from './community-chat-connection';
import { parseCommunityChatServerEvent } from './chat-protocol';

class FakeSocket {
  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  sent: string[] = [];

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

  remoteClose(code = 1006): void {
    this.readyState = 3;
    this.onclose?.({ code, reason: 'remote close' } as CloseEvent);
  }
}

async function nextMicrotask(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('CommunityChatConnection', () => {
  it('shares one connection instance across consumers in the same browser tab', () => {
    resetCommunityChatConnectionForTests();
    const first = acquireCommunityChatConnection();
    const second = acquireCommunityChatConnection();
    expect(second).toBe(first);
    releaseCommunityChatConnection(first);
    releaseCommunityChatConnection(second);
    resetCommunityChatConnectionForTests();
  });

  it('builds the fixed WebSocket URL without query credentials', () => {
    expect(resolveCommunityChatWebSocketUrl(
      'https://chat.example.test/api?accessToken=must-not-survive',
      'https://site.example.test',
    )).toBe('wss://chat.example.test/ws/chat');
  });

  it('gets one REST ticket, authenticates in the first frame and subscribes after authentication', async () => {
    const sockets: FakeSocket[] = [];
    const ticketProvider = vi.fn().mockResolvedValue({
      ticket: 'single-use-ticket',
      expiresAt: '2026-08-22T10:01:00.000Z',
      protocolVersion: 1 as const,
    });
    const client = new CommunityChatConnection({
      ticketProvider,
      websocketUrl: () => 'wss://example.test/ws/chat',
      socketFactory: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
    });
    client.subscribeRoom('developer', 7);
    client.connect();
    await nextMicrotask();

    expect(ticketProvider).toHaveBeenCalledTimes(1);
    expect(sockets).toHaveLength(1);
    sockets[0].open();
    expect(JSON.parse(sockets[0].sent[0])).toMatchObject({
      type: 'chat.authenticate',
      protocolVersion: 1,
      ticket: 'single-use-ticket',
    });
    expect(sockets[0].sent[0]).not.toContain('Bearer');

    sockets[0].receive({
      type: 'chat.authenticated', protocolVersion: 1,
      sessionId: 'session-1', serverTime: '2026-08-22T10:00:00.000Z',
    });
    expect(JSON.parse(sockets[0].sent[1])).toMatchObject({
      type: 'chat.subscribe', roomSlug: 'developer', afterSequence: 7,
    });
    sockets[0].receive({
      type: 'chat.ready', protocolVersion: 1,
      rooms: [{ roomSlug: 'developer', latestSequence: 7 }],
    });
    client.sendMessage({
      requestId: 'request-1',
      clientMessageId: 'client-message-1',
      roomSlug: 'developer',
      body: '真实消息',
      mentionPublicIds: ['public-2'],
    });
    expect(JSON.parse(sockets[0].sent.at(-1)!)).toEqual({
      type: 'chat.send', protocolVersion: 1, requestId: 'request-1',
      clientMessageId: 'client-message-1', roomSlug: 'developer',
      body: '真实消息', mentionPublicIds: ['public-2'],
    });
    client.disconnect();
  });

  it('backs off exponentially and gets a fresh ticket after a remote disconnect', async () => {
    const sockets: FakeSocket[] = [];
    let reconnectCallback: (() => void) | undefined;
    let reconnectDelay = 0;
    const ticketProvider = vi.fn().mockResolvedValue({
      ticket: 'ticket', expiresAt: '2026-08-22T10:01:00.000Z', protocolVersion: 1 as const,
    });
    const client = new CommunityChatConnection({
      ticketProvider,
      random: () => 0,
      websocketUrl: () => 'wss://example.test/ws/chat',
      socketFactory: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      schedule: (callback, delay) => {
        reconnectCallback = callback;
        reconnectDelay = delay;
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
      cancelSchedule: vi.fn(),
    });
    client.connect();
    await nextMicrotask();
    sockets[0].open();
    sockets[0].receive({ type: 'chat.authenticated', protocolVersion: 1, sessionId: 's', serverTime: 'now' });
    sockets[0].receive({ type: 'chat.ready', protocolVersion: 1, rooms: [] });
    sockets[0].remoteClose();

    expect(client.getSnapshot().status).toBe('reconnecting');
    expect(reconnectDelay).toBe(800);
    reconnectCallback?.();
    await nextMicrotask();
    expect(ticketProvider).toHaveBeenCalledTimes(2);
    expect(sockets).toHaveLength(2);
    client.disconnect();
  });

  it('becomes ready without a public room and sends private messages on the authenticated user stream', async () => {
    const sockets: FakeSocket[] = [];
    const client = new CommunityChatConnection({
      ticketProvider: vi.fn().mockResolvedValue({
        ticket: 'direct-ticket', expiresAt: '2099-01-01T00:00:00.000Z', protocolVersion: 1 as const,
      }),
      websocketUrl: () => 'wss://example.test/ws/chat',
      socketFactory: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
    });
    client.connect();
    await nextMicrotask();
    sockets[0].open();
    sockets[0].receive({
      type: 'chat.authenticated', protocolVersion: 1,
      sessionId: 'session-direct', serverTime: 'now',
    });

    expect(client.getSnapshot().status).toBe('ready');
    client.sendDirectMessage({
      requestId: 'request-direct',
      clientMessageId: 'client-direct',
      conversationId: 'conversation-1',
      body: '只发给好友',
    });
    expect(JSON.parse(sockets[0].sent.at(-1)!)).toEqual({
      type: 'chat.direct.send', protocolVersion: 1,
      requestId: 'request-direct', clientMessageId: 'client-direct',
      conversationId: 'conversation-1', body: '只发给好友',
    });
    client.disconnect();
  });

  it('caps exponential reconnect delay and ignores malformed protocol frames', () => {
    expect(communityChatReconnectDelay(20, () => 0.5)).toBe(30_000);
    expect(parseCommunityChatServerEvent('{bad json')).toBeNull();
    expect(parseCommunityChatServerEvent({ type: 'chat.ready', protocolVersion: 2, rooms: [] })).toBeNull();
    expect(parseCommunityChatServerEvent({ type: 'chat.presence', protocolVersion: 1, roomSlug: 'general', presenceBand: '937-online' })).toBeNull();
    expect(parseCommunityChatServerEvent({
      type: 'chat.direct.message.created',
      protocolVersion: 1,
      message: {
        id: 'm1', conversationId: 'c1', sequence: 1, version: 1,
        visibility: 'visible', body: '你好',
        author: { publicId: 'p1', displayName: '同事' },
        replyTo: null,
        createdAt: 'now', updatedAt: 'now',
        permissions: { canWithdraw: false, withdrawUntil: null, canReport: true },
      },
    })?.type).toBe('chat.direct.message.created');
  });
});
