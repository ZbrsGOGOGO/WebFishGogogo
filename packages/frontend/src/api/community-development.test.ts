import { beforeEach, describe, expect, it, vi } from 'vitest';

import { communityDevelopmentApi } from './community-development';
import { communityHttp } from './community-http';

describe('communityDevelopmentApi', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('uses the private development paths and exact paging query', async () => {
    const get = vi.spyOn(communityHttp, 'get').mockResolvedValue({});

    await communityDevelopmentApi.getAccess();
    await communityDevelopmentApi.listRequests('needs_info', 3);
    await communityDevelopmentApi.getRequest('request / 1');
    await communityDevelopmentApi.downloadAttachment('request / 1', 'file / 2');
    await communityDevelopmentApi.exportReview();

    expect(get).toHaveBeenNthCalledWith(1, '/v1/development/access');
    expect(get).toHaveBeenNthCalledWith(2, '/v1/development/requests', {
      query: { status: 'needs_info', page: 3 },
    });
    expect(get).toHaveBeenNthCalledWith(3, '/v1/development/requests/request%20%2F%201');
    expect(get).toHaveBeenNthCalledWith(
      4,
      '/v1/development/requests/request%20%2F%201/attachments/file%20%2F%202/content',
      { responseType: 'blob' },
    );
    expect(get).toHaveBeenNthCalledWith(5, '/v1/development/review-export', {
      query: { status: undefined },
    });
  });

  it('sends expectedVersion and never opts writes into automatic replay', async () => {
    const post = vi.spyOn(communityHttp, 'post').mockResolvedValue({});
    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' });

    await communityDevelopmentApi.addComment('request-1', '补充', 4);
    await communityDevelopmentApi.decideRequest('request-1', 'accepted', '纳入迭代', 5);
    await communityDevelopmentApi.uploadAttachment('request-1', file, 6);

    expect(post).toHaveBeenNthCalledWith(
      1,
      '/v1/development/requests/request-1/comments',
      { body: '补充', expectedVersion: 4 },
      { retryAfterRefresh: false },
    );
    expect(post).toHaveBeenNthCalledWith(
      2,
      '/v1/development/requests/request-1/decision',
      { status: 'accepted', note: '纳入迭代', expectedVersion: 5 },
      { retryAfterRefresh: false },
    );
    const form = post.mock.calls[2]?.[1];
    expect(form).toBeInstanceOf(FormData);
    expect((form as FormData).get('file')).toBe(file);
    expect((form as FormData).get('expectedVersion')).toBe('6');
    expect(post.mock.calls[2]?.[2]).toEqual({ retryAfterRefresh: false });
  });
});

