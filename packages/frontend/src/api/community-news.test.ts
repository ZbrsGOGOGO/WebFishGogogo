import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  communityNewsApi,
  resetCommunityHttpForTests,
  setCommunitySessionTokens,
} from './community';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('community news REST contract', () => {
  beforeEach(() => {
    resetCommunityHttpForTests();
    setCommunitySessionTokens('memory-access-token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetCommunityHttpForTests();
  });

  it('uses only the public feed filters accepted by the news controller', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      feed: 'for_you',
      personalized: true,
      items: [],
      nextCursor: null,
    }));
    vi.stubGlobal('fetch', fetchMock);

    await communityNewsApi.list({
      feed: 'for_you',
      profession: 'developer',
      topic: 'typescript',
      cursor: 'cursor-1',
    });

    expect(String(fetchMock.mock.calls[0][0])).toMatch(
      /\/v1\/news\?feed=for_you&profession=developer&topic=typescript&cursor=cursor-1$/,
    );
  });

  it('sends negative feedback once with an idempotency key and never refreshes a 401 write', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ code: 'UNAUTHORIZED' }, 401));
    vi.stubGlobal('fetch', fetchMock);

    await expect(communityNewsApi.giveNegativeFeedback(
      'article/1',
      'not_interested',
      'news-feedback:test',
    )).rejects.toMatchObject({ status: 401 });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/v1\/news\/article%2F1\/negative-feedback$/);
    expect(new Headers(init.headers).get('Idempotency-Key')).toBe('news-feedback:test');
    expect(JSON.parse(String(init.body))).toEqual({ reason: 'not_interested' });
  });

  it('updates preferences with the body version, If-Match and idempotency key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      personalizationEnabled: true,
      topicPreferences: ['typescript'],
      selectedProfession: 'developer',
      version: 4,
    }));
    vi.stubGlobal('fetch', fetchMock);

    await communityNewsApi.updatePreferences({
      personalizationEnabled: true,
      topicPreferences: ['typescript'],
      expectedVersion: 3,
    }, 'news-preferences:test');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get('If-Match')).toBe('"3"');
    expect(headers.get('Idempotency-Key')).toBe('news-preferences:test');
    expect(JSON.parse(String(init.body))).toEqual({
      personalizationEnabled: true,
      topicPreferences: ['typescript'],
      expectedVersion: 3,
    });
  });

  it('sends admin revision and publish commands to the exact versioned paths', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ id: 'news-1' })));
    vi.stubGlobal('fetch', fetchMock);
    const revision = {
      sourceId: '11111111-1111-4111-8111-111111111111',
      originalTitle: '原始标题',
      summary: '这是一段仅用于站内导读的原创摘要，内容长度满足要求，并且不会镜像转载来源网站的整篇文章。',
      originalUrl: 'https://example.com/news/1',
      originalPublishedAt: '2026-08-20T08:00:00.000Z',
      professionTags: ['developer'] as Array<'developer'>,
      topicTags: ['typescript'],
      correctionNote: null,
    };

    await communityNewsApi.reviseDraft('news/1', revision, 6, 'news-revise:test');
    await communityNewsApi.publishArticle('news/1', '已核验来源与摘要，可以发布。', 7, 'news-publish:test');

    const [reviseUrl, reviseInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(reviseUrl).toMatch(/\/v1\/admin\/news\/articles\/news%2F1$/);
    expect(reviseInit.method).toBe('PATCH');
    expect(new Headers(reviseInit.headers).get('If-Match')).toBe('"6"');
    expect(JSON.parse(String(reviseInit.body)).expectedVersion).toBe(6);

    const [publishUrl, publishInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(publishUrl).toMatch(/\/v1\/admin\/news\/articles\/news%2F1\/publish$/);
    expect(publishInit.method).toBe('POST');
    expect(JSON.parse(String(publishInit.body))).toEqual({
      reason: '已核验来源与摘要，可以发布。',
      expectedVersion: 7,
    });
  });
});
