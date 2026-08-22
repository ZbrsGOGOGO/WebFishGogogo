import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createClient } from 'redis';

import type { ChatRoomSlug } from '../../database/entities/chat.entity';
import type {
  ChatPresenceBand,
  ChatRealtimeEvent,
} from './chat.types';

const CHAT_CHANNEL = 'zbrs:community:chat:events:v1';
const PRESENCE_TTL_MS = 75_000;
const PRESENCE_KEY_TTL_SECONDS = 180;

type EventListener = (event: ChatRealtimeEvent) => void | Promise<void>;
type RedisClient = ReturnType<typeof createClient>;

@Injectable()
export class ChatRealtimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChatRealtimeService.name);
  private readonly listeners = new Set<EventListener>();
  private readonly memoryPresence = new Map<string, Map<string, number>>();
  private publisher: RedisClient | null = null;
  private subscriber: RedisClient | null = null;
  private available = false;
  private stopping = false;
  private connecting = false;
  private reconnectAttempt = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private readonly memoryMode =
    process.env.LOCAL_DEV === 'true' &&
    process.env.CHAT_LOCAL_MEMORY_BUS_ENABLED === 'true';

  async onModuleInit(): Promise<void> {
    if (this.memoryMode) {
      this.available = true;
      return;
    }
    const url = process.env.REDIS_URL;
    if (!url) return;

    await this.connectRedis(url);
  }

  private async connectRedis(url: string): Promise<void> {
    if (this.stopping || this.connecting || this.memoryMode) return;
    this.connecting = true;
    await this.closeRedisClients();

    const client = createClient({
      url,
      socket: { connectTimeout: 2_000, reconnectStrategy: false },
    });
    const subscriber = client.duplicate();
    client.on('error', () => this.handleRedisFailure());
    subscriber.on('error', () => this.handleRedisFailure());
    try {
      await Promise.all([client.connect(), subscriber.connect()]);
      await subscriber.subscribe(CHAT_CHANNEL, (payload) => {
        const event = this.parseEvent(payload);
        if (event) void this.emit(event);
      });
      this.publisher = client;
      this.subscriber = subscriber;
      this.available = true;
      this.reconnectAttempt = 0;
    } catch {
      this.logger.warn('Chat Redis unavailable; realtime writes are fail-closed.');
      await Promise.allSettled([client.disconnect(), subscriber.disconnect()]);
      this.scheduleReconnect();
    } finally {
      this.connecting = false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    this.available = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    await this.closeRedisClients();
  }

  isAvailable(): boolean {
    return this.available;
  }

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async publish(event: ChatRealtimeEvent): Promise<void> {
    if (!this.available) return;
    if (this.memoryMode) {
      await this.emit(event);
      return;
    }
    try {
      await this.publisher?.publish(CHAT_CHANNEL, JSON.stringify(event));
    } catch {
      this.handleRedisFailure();
    }
  }

  async touchPresence(roomSlug: ChatRoomSlug, connectionId: string): Promise<void> {
    return this.touchPresenceBatch(roomSlug, [connectionId]);
  }

  async touchPresenceBatch(
    roomSlug: ChatRoomSlug,
    connectionIds: readonly string[],
  ): Promise<void> {
    if (!this.available) return;
    if (connectionIds.length === 0) return;
    const now = Date.now();
    if (this.memoryMode) {
      const room = this.memoryPresence.get(roomSlug) ?? new Map<string, number>();
      for (const connectionId of connectionIds) room.set(connectionId, now);
      this.pruneMemory(room, now);
      this.memoryPresence.set(roomSlug, room);
      return;
    }
    const key = this.presenceKey(roomSlug);
    try {
      await this.publisher?.multi()
        .zRemRangeByScore(key, 0, now - PRESENCE_TTL_MS)
        .zAdd(
          key,
          connectionIds.map((connectionId) => ({ score: now, value: connectionId })),
        )
        .expire(key, PRESENCE_KEY_TTL_SECONDS)
        .exec();
    } catch {
      this.handleRedisFailure();
    }
  }

  async removePresence(roomSlug: ChatRoomSlug, connectionId: string): Promise<void> {
    if (!this.available) return;
    if (this.memoryMode) {
      this.memoryPresence.get(roomSlug)?.delete(connectionId);
      return;
    }
    try {
      await this.publisher?.zRem(this.presenceKey(roomSlug), connectionId);
    } catch {
      this.handleRedisFailure();
    }
  }

  async presenceBand(roomSlug: ChatRoomSlug): Promise<ChatPresenceBand> {
    if (!this.available) return 'unavailable';
    const now = Date.now();
    let count: number;
    if (this.memoryMode) {
      const room = this.memoryPresence.get(roomSlug) ?? new Map<string, number>();
      this.pruneMemory(room, now);
      count = room.size;
    } else {
      const key = this.presenceKey(roomSlug);
      try {
        await this.publisher?.zRemRangeByScore(key, 0, now - PRESENCE_TTL_MS);
        count = (await this.publisher?.zCard(key)) ?? 0;
      } catch {
        this.handleRedisFailure();
        return 'unavailable';
      }
    }
    if (count < 5) return 'quiet';
    if (count < 20) return 'active';
    if (count < 80) return 'busy';
    return 'very_busy';
  }

  private async emit(event: ChatRealtimeEvent): Promise<void> {
    await Promise.allSettled([...this.listeners].map((listener) => listener(event)));
  }

  private parseEvent(payload: string): ChatRealtimeEvent | null {
    try {
      const value = JSON.parse(payload) as Partial<ChatRealtimeEvent>;
      if (
        (value.kind === 'created' || value.kind === 'updated') &&
        typeof value.roomSlug === 'string' &&
        typeof value.messageId === 'string'
      ) {
        return value as ChatRealtimeEvent;
      }
    } catch {
      // An invalid pub/sub payload is ignored and never logged.
    }
    return null;
  }

  private presenceKey(roomSlug: ChatRoomSlug): string {
    return `zbrs:community:chat:presence:${roomSlug}`;
  }

  private pruneMemory(room: Map<string, number>, now: number): void {
    for (const [member, seenAt] of room) {
      if (seenAt < now - PRESENCE_TTL_MS) room.delete(member);
    }
  }

  private markUnavailable(): void {
    if (this.available) {
      this.logger.warn('Chat Redis connection lost; realtime writes are fail-closed.');
    }
    this.available = false;
  }

  private handleRedisFailure(): void {
    this.markUnavailable();
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (
      this.stopping ||
      this.memoryMode ||
      !process.env.REDIS_URL ||
      this.reconnectTimer
    ) {
      return;
    }
    const delay = Math.min(1_000 * 2 ** this.reconnectAttempt, 30_000);
    this.reconnectAttempt = Math.min(this.reconnectAttempt + 1, 5);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connectRedis(process.env.REDIS_URL!);
    }, delay);
    this.reconnectTimer.unref?.();
  }

  private async closeRedisClients(): Promise<void> {
    const clients = [this.subscriber, this.publisher].filter(
      (client): client is RedisClient => client !== null,
    );
    this.subscriber = null;
    this.publisher = null;
    await Promise.allSettled(
      clients.map(async (client) => {
        if (client.isOpen) await client.disconnect();
      }),
    );
  }
}
