import { describe, expect, it, vi } from 'vitest';

import type { CommunityChatMessage } from '../../api/community';
import {
  collectCommunityChatMentionCandidates,
  canWithdrawCommunityChatMessage,
  communityChatBodyError,
  communityChatGapStart,
  loadCommunityChatGap,
  mergeCommunityChatMessages,
} from './chat-message-state';

function message(
  id: string,
  sequence: number,
  version = 1,
  publicId = 'user-1',
  visibility: CommunityChatMessage['visibility'] = 'visible',
): CommunityChatMessage {
  return {
    id,
    roomSlug: 'general',
    sequence,
    version,
    visibility,
    body: visibility === 'visible' ? `消息 ${id}` : null,
    author: { publicId, displayName: `用户 ${publicId}` },
    replyTo: null,
    mentionPublicIds: [],
    createdAt: '2026-08-22T10:00:00.000Z',
    updatedAt: '2026-08-22T10:00:00.000Z',
    permissions: { canWithdraw: false, withdrawUntil: null, canReport: true },
  };
}

describe('community chat message state', () => {
  it('deduplicates by message id and room sequence while keeping the newest version', () => {
    const result = mergeCommunityChatMessages(
      [message('m1', 1), message('old-at-two', 2)],
      [message('m1', 1, 2), message('new-at-two', 2, 1)],
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: 'm1', version: 2 });
    expect(result[1]).toMatchObject({ id: 'new-at-two', sequence: 2 });
  });

  it('validates pure text at 1–500 Unicode code points', () => {
    expect(communityChatBodyError('   ')).toMatch(/1–500/);
    expect(communityChatBodyError('🙂'.repeat(500))).toBeNull();
    expect(communityChatBodyError('🙂'.repeat(501))).toMatch(/最多 500/);
  });

  it('never exposes withdraw after the two-minute client window', () => {
    const item = message('m1', 1);
    item.createdAt = '2026-08-22T10:00:00.000Z';
    item.permissions = {
      canWithdraw: true,
      withdrawUntil: '2099-08-22T10:00:00.000Z',
      canReport: true,
    };
    expect(canWithdrawCommunityChatMessage(item, Date.parse('2026-08-22T10:01:59.000Z'))).toBe(true);
    expect(canWithdrawCommunityChatMessage(item, Date.parse('2026-08-22T10:02:00.000Z'))).toBe(false);
  });

  it('builds mention choices only from server-allowed friends', () => {
    const result = collectCommunityChatMentionCandidates(
      [
        { publicId: 'allowed', displayName: '服务端允许用户' },
        { publicId: 'self', displayName: '当前用户' },
      ],
      'self',
    );

    expect(result.map((item) => item.publicId)).toEqual(['allowed']);
  });

  it('follows after-sequence cursors until a reconnect gap is complete', async () => {
    const fetchPage = vi.fn()
      .mockResolvedValueOnce({
        items: [message('m11', 11), message('m12', 12)],
        latestSequence: 14, oldestSequence: 11, hasMoreBefore: false,
        hasMoreAfter: true, nextAfterSequence: 12,
      })
      .mockResolvedValueOnce({
        items: [message('m12', 12, 2), message('m13', 13), message('m14', 14)],
        latestSequence: 14, oldestSequence: 12, hasMoreBefore: false,
        hasMoreAfter: false,
      });

    const result = await loadCommunityChatGap('general', 10, fetchPage);

    expect(fetchPage).toHaveBeenNthCalledWith(1, 'general', { afterSequence: 10, limit: 100 });
    expect(fetchPage).toHaveBeenNthCalledWith(2, 'general', { afterSequence: 12, limit: 100 });
    expect(result.map((item) => item.sequence)).toEqual([11, 12, 13, 14]);
    expect(result.find((item) => item.id === 'm12')?.version).toBe(2);
    expect(communityChatGapStart({ latestSequence: 20, gapAfterSequence: 8 }, 15)).toBe(8);
    expect(communityChatGapStart({ latestSequence: 20 }, 15)).toBe(15);
    expect(communityChatGapStart({ latestSequence: 15 }, 15)).toBeNull();
  });
});
