import { Injectable } from '@nestjs/common';

import { ChatException, chatException } from './chat.errors';
import type { ChatModerationResult } from './chat.types';

const MODERATION_TIMEOUT_MS = 3_000;

@Injectable()
export class ChatModerationService {
  private unavailableUntil = 0;

  isAvailable(): boolean {
    if (this.isLocalAdapter()) return true;
    return (
      this.endpoint() !== null &&
      this.hasProductionCredential() &&
      Date.now() >= this.unavailableUntil
    );
  }

  async moderate(input: {
    messageId: string;
    roomSlug: string;
    authorPublicId: string;
    body: string;
  }): Promise<ChatModerationResult> {
    if (this.isLocalAdapter()) {
      return {
        decision: 'allow',
        provider: 'local-deterministic-v1',
        reference: input.messageId,
      };
    }

    const endpoint = this.endpoint();
    if (!endpoint || !this.hasProductionCredential()) {
      throw chatException(
        'CHAT_ROOM_READ_ONLY',
        '消息审核服务不可用，聊天室暂时只读。',
        503,
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), MODERATION_TIMEOUT_MS);
    timeout.unref?.();
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${process.env.CHAT_MODERATION_API_TOKEN!}`,
        },
        body: JSON.stringify({
          messageId: input.messageId,
          roomSlug: input.roomSlug,
          authorPublicId: input.authorPublicId,
          text: input.body,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        this.tripCircuit();
        throw chatException(
          'CHAT_ROOM_READ_ONLY',
          '消息审核服务不可用，聊天室暂时只读。',
          503,
        );
      }
      const value = (await response.json()) as {
        decision?: unknown;
        reference?: unknown;
        provider?: unknown;
      };
      if (!['allow', 'reject', 'review'].includes(String(value.decision))) {
        this.tripCircuit();
        throw chatException(
          'CHAT_ROOM_READ_ONLY',
          '消息审核服务返回了无效结果，聊天室暂时只读。',
          503,
        );
      }
      this.unavailableUntil = 0;
      return {
        decision: value.decision as ChatModerationResult['decision'],
        provider:
          typeof value.provider === 'string' && value.provider.length <= 64
            ? value.provider
            : 'https-adapter-v1',
        reference:
          typeof value.reference === 'string' && value.reference.length <= 160
            ? value.reference
            : null,
      };
    } catch (error) {
      if (error instanceof ChatException) throw error;
      this.tripCircuit();
      throw chatException(
        'CHAT_ROOM_READ_ONLY',
        '消息审核服务不可用，聊天室暂时只读。',
        503,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private isLocalAdapter(): boolean {
    return (
      process.env.LOCAL_DEV === 'true' &&
      process.env.CHAT_LOCAL_MODERATION_ENABLED === 'true'
    );
  }

  private endpoint(): string | null {
    const raw = process.env.CHAT_MODERATION_ENDPOINT;
    if (!raw) return null;
    try {
      const url = new URL(raw);
      return url.protocol === 'https:' && !url.username && !url.password
        ? url.toString()
        : null;
    } catch {
      return null;
    }
  }

  private hasProductionCredential(): boolean {
    const token = process.env.CHAT_MODERATION_API_TOKEN;
    return Boolean(token && Buffer.byteLength(token, 'utf8') >= 24);
  }

  private tripCircuit(): void {
    this.unavailableUntil = Date.now() + 30_000;
  }
}
