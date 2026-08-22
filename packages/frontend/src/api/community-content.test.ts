import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { communityContentApi } from './community-content';
import { resetCommunityHttpForTests, setCommunitySessionTokens } from './community-http';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('community content mutation contracts', () => {
  beforeEach(() => {
    resetCommunityHttpForTests();
    setCommunitySessionTokens('token');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetCommunityHttpForTests();
  });

  it('sends expectedVersion, If-Match and idempotency key when editing', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: 'version conflict', currentVersion: 8 }, 409));
    vi.stubGlobal('fetch', fetchMock);
    await expect(communityContentApi.updatePost('p-1', {
      type: 'experience', channel: 'general', title: '这是一个有效标题', body: '这是满足最小长度限制的正文内容，用于验证版本更新请求。', tags: ['测试'], bodyFormat: 'plain_text',
    }, 7, 'edit-key')).rejects.toMatchObject({ status: 409 });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get('If-Match')).toBe('"7"');
    expect(headers.get('Idempotency-Key')).toBe('edit-key');
    expect(JSON.parse(String(init.body)).expectedVersion).toBe(7);
  });

  it('never refreshes or replays bookmark writes after 401', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: 'expired' }, 401));
    vi.stubGlobal('fetch', fetchMock);
    await expect(communityContentApi.setBookmark('p-1', true)).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/v1/auth/refresh'))).toBe(false);
  });
});
