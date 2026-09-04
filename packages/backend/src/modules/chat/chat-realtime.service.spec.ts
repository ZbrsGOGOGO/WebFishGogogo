import { randomUUID } from 'node:crypto';

import { ChatRealtimeService } from './chat-realtime.service';
import type { ChatRealtimeEvent } from './chat.types';

describe('ChatRealtimeService event delivery', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv, LOCAL_DEV: 'false' };
    delete process.env.REDIS_URL;
    delete process.env.CHAT_LOCAL_MEMORY_BUS_ENABLED;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('parses private message and read events while rejecting malformed audiences', () => {
    const service = new ChatRealtimeService();
    const parseEvent = (
      service as unknown as { parseEvent(payload: string): ChatRealtimeEvent | null }
    ).parseEvent.bind(service);
    const participants = [randomUUID(), randomUUID()];
    const conversationId = randomUUID();

    expect(parseEvent(JSON.stringify({
      scope: 'direct',
      kind: 'created',
      conversationId,
      messageId: randomUUID(),
      participantIds: participants,
    }))).toMatchObject({ scope: 'direct', kind: 'created', participantIds: participants });
    expect(parseEvent(JSON.stringify({
      scope: 'direct',
      kind: 'read',
      conversationId,
      readerUserId: participants[0],
      lastReadSequence: 12,
      participantIds: participants,
    }))).toMatchObject({ scope: 'direct', kind: 'read', lastReadSequence: 12 });
    expect(parseEvent(JSON.stringify({
      scope: 'direct',
      kind: 'created',
      conversationId,
      messageId: randomUUID(),
      participantIds: [participants[0]],
    }))).toBeNull();
  });

  it('falls back to listeners on the current instance when Redis publish fails', async () => {
    const service = new ChatRealtimeService();
    const listener = jest.fn();
    service.subscribe(listener);
    const event: ChatRealtimeEvent = {
      scope: 'direct',
      kind: 'created',
      conversationId: randomUUID(),
      messageId: randomUUID(),
      participantIds: [randomUUID(), randomUUID()],
    };
    const publish = jest.fn().mockRejectedValue(new Error('redis unavailable'));
    const internals = service as unknown as {
      available: boolean;
      publisher: { publish: typeof publish };
    };
    internals.available = true;
    internals.publisher = { publish };

    await service.publish(event);

    expect(publish).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(event);
    expect(service.isAvailable()).toBe(false);
  });
});
