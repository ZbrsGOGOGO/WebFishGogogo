import type { DataSource } from 'typeorm';

import {
  TrendingNewsBoardRun,
  TrendingNewsItemRecord,
} from '../../../database/entities';
import { createLocalDevDataSource } from '../../../database/local-dev-datasource';
import {
  EXTERNAL_TRENDING_BOARDS,
  INTERNAL_TRENDING_BOARDS,
  TrendingNewsService,
  fetchGitHubRising,
  fetchBaiduTrending,
  fetchHackerNews,
  fetchStackOverflow,
  isDailyTrendingNewsDue,
  nextDailyTrendingNewsRefresh,
  shanghaiTrendingServiceDate,
} from './trending-news.service';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function sourceFetch(tag: string, failHost?: string): jest.MockedFunction<typeof fetch> {
  return jest.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    expect(init?.redirect).toBe('manual');
    if (url.hostname === failHost) return jsonResponse({ error: 'temporary' }, 503);
    if (url.hostname === 'top.baidu.com') return new Response(`<!--s-data:${JSON.stringify({ data: { cards: [{ content:
      Array.from({ length: 10 }, (_, index) => ({ index, word: `${tag} 百度 ${index}`, rawUrl: `https://www.baidu.com/s?wd=${tag}-${index}`, hotScore: '1234' })) }] } })}-->`, { headers: { 'content-type': 'text/html' } });
    if (url.pathname.endsWith('/topstories.json')) {
      return jsonResponse(Array.from({ length: 10 }, (_, index) => index + 1));
    }
    if (url.hostname === 'hacker-news.firebaseio.com') {
      const id = Number(url.pathname.match(/\/item\/(\d+)\.json$/)?.[1]);
      return jsonResponse({
        id,
        type: 'story',
        title: `${tag} HN ${id}`,
        score: 100 - id,
        time: 1_788_739_200 + id,
      });
    }
    if (url.hostname === 'api.stackexchange.com') {
      return jsonResponse({
        items: Array.from({ length: 10 }, (_, index) => ({
          question_id: 100 + index,
          title: index === 0 ? `${tag} &lt;script&gt;safe&lt;/script&gt;` : `${tag} Stack ${index}`,
          link: `https://stackoverflow.com/questions/${100 + index}/safe-question`,
          score: 20 - index,
          creation_date: 1_788_739_200 + index,
        })),
        quota_remaining: 299,
      });
    }
    if (url.hostname === 'api.github.com') {
      return jsonResponse({
        incomplete_results: false,
        items: Array.from({ length: 10 }, (_, index) => ({
          id: 200 + index,
          full_name: `${tag}/repo-${index}`,
          html_url: `https://github.com/${tag}/repo-${index}`,
          stargazers_count: 500 - index,
          created_at: `2026-09-0${Math.min(index + 1, 9)}T00:00:00.000Z`,
        })),
      });
    }
    throw new Error(`unexpected URL ${url}`);
  }) as jest.MockedFunction<typeof fetch>;
}

describe('daily trending news', () => {
  it('reads only Baidu public ranked metadata, drops pinned/unsafe entries and never evaluates scripts', async () => {
    const content = [
      { index: 0, word: '置顶内容', isTop: true, rawUrl: 'https://www.baidu.com/s?wd=pinned' },
      { index: 0, word: '公开榜单一', rawUrl: 'https://www.baidu.com/s?wd=one', hotScore: '5000', desc: '正文不得保存', img: 'private-image' },
      { index: 1, word: '非法地址', rawUrl: 'https://www.baidu.com.evil.example/s?wd=bad' },
      { index: 2, word: '&lt;b&gt;公开榜单二&lt;/b&gt;', rawUrl: 'https://www.baidu.com/s?wd=two', hotScore: 'bad' },
      { index: 3, word: '公开榜单一', rawUrl: 'https://www.baidu.com/s?wd=duplicate' },
    ];
    const fetcher = jest.fn().mockResolvedValue(new Response(`<script>throw 'never execute'</script><!--s-data:${JSON.stringify({ data: { cards: [{ content }] } })}-->`, { headers: { 'content-type': 'text/html; charset=utf-8' } })) as jest.MockedFunction<typeof fetch>;
    const rows = await fetchBaiduTrending(fetcher);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.sourceRank)).toEqual([1, 3]);
    expect(rows[1]).toMatchObject({ title: '公开榜单二', heatText: null, publishedAt: null });
    expect(rows[0].sourceItemId).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(rows)).not.toMatch(/正文不得保存|private-image|never execute/);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]).toEqual(['https://top.baidu.com/board?tab=realtime', expect.objectContaining({ redirect: 'manual', signal: expect.any(AbortSignal) })]);
  });

  it.each([
    [302, 'text/html', '<html>login</html>'], [403, 'text/html', 'blocked'],
    [200, 'application/json', '{}'], [200, 'text/html', '<html>no supported state</html>'],
    [200, 'text/html', '<!--s-data:{"data":{"cards":[]}}-->'],
    [200, 'text/html', 'x'.repeat(2_000_001)],
  ])('fails closed on blocked, changed or oversized Baidu responses %#', async (status, type, body) => {
    const fetcher = jest.fn().mockResolvedValue(new Response(body, { status, headers: { 'content-type': type } })) as jest.MockedFunction<typeof fetch>;
    await expect(fetchBaiduTrending(fetcher)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('keeps the last Baidu snapshot on upstream restrictions without pretending it refreshed', async () => {
    const dataSource = await createLocalDevDataSource();
    try {
      await new TrendingNewsService(dataSource, sourceFetch('old')).refresh(new Date('2026-09-08T00:10:00Z'));
      const service = new TrendingNewsService(dataSource, sourceFetch('new', 'top.baidu.com'));
      await service.refresh(new Date('2026-09-09T00:10:00Z'));
      const board = (await service.listDaily(new Date('2026-09-09T01:00:00Z'))).boards.find((row) => row.id === 'baidu');
      expect(board).toMatchObject({ status: 'stale', snapshotDate: '2026-09-08' });
      expect(board?.items.every((row) => row.title.startsWith('old'))).toBe(true);
    } finally { await dataSource.destroy(); }
  });

  it('uses the fixed Beijing 08:10 daily boundary', () => {
    expect(shanghaiTrendingServiceDate(new Date('2026-09-08T00:09:59.000Z'))).toBe('2026-09-08');
    expect(isDailyTrendingNewsDue(new Date('2026-09-08T00:09:59.000Z'))).toBe(false);
    expect(isDailyTrendingNewsDue(new Date('2026-09-08T00:10:00.000Z'))).toBe(true);
    expect(nextDailyTrendingNewsRefresh(new Date('2026-09-08T00:10:00.000Z')).toISOString())
      .toBe('2026-09-09T00:10:00.000Z');
  });

  it('parses only bounded title/rank metadata from the three documented APIs', async () => {
    const fetcher = sourceFetch('safe');
    const [hn, stack, github] = await Promise.all([
      fetchHackerNews(fetcher),
      fetchStackOverflow(fetcher),
      fetchGitHubRising('2026-09-08', fetcher),
    ]);

    expect(hn).toHaveLength(10);
    expect(hn[0]).toMatchObject({
      title: 'safe HN 1',
      originalUrl: 'https://news.ycombinator.com/item?id=1',
      heatText: '99 分',
    });
    expect(stack).toHaveLength(10);
    expect(stack[0].title).toBe('safe safe');
    expect(stack[0].originalUrl).toMatch(/^https:\/\/stackoverflow\.com\/questions\//);
    expect(github).toHaveLength(10);
    expect(github[0]).toMatchObject({ title: 'safe/repo-0', heatText: '★ 500' });
    expect(fetcher.mock.calls.every(([, init]) => init?.redirect === 'manual')).toBe(true);
    expect(fetcher.mock.calls.every(([url]) => !String(url).includes('/body'))).toBe(true);
  });

  it('preserves official rank gaps when invalid HN positions are filtered', async () => {
    const fetcher = jest.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/topstories.json')) return jsonResponse([11, 12, 13, 14]);
      const id = Number(url.pathname.match(/\/item\/(\d+)\.json$/)?.[1]);
      if (id === 11 || id === 13) return jsonResponse({ id, type: 'story', dead: true });
      return jsonResponse({ id, type: 'story', title: `safe ${id}`, score: id, time: 1_788_739_200 });
    }) as jest.MockedFunction<typeof fetch>;
    const items = await fetchHackerNews(fetcher);
    expect(items.map((item) => item.sourceRank)).toEqual([2, 4]);
  });

  it('rejects Stack backoff error payloads and incomplete GitHub searches', async () => {
    const stackFetcher = jest.fn().mockResolvedValue(jsonResponse({
      error_id: 502,
      error_name: 'throttle_violation',
      backoff: 172800,
      quota_remaining: 0,
    })) as jest.MockedFunction<typeof fetch>;
    await expect(fetchStackOverflow(stackFetcher)).rejects.toThrow('quota exhausted');

    const githubFetcher = jest.fn().mockResolvedValue(jsonResponse({
      incomplete_results: true,
      items: [{
        id: 1, full_name: 'safe/repo', html_url: 'https://github.com/safe/repo',
        stargazers_count: 50, created_at: '2026-09-08T00:00:00.000Z',
      }],
    })) as jest.MockedFunction<typeof fetch>;
    await expect(fetchGitHubRising('2026-09-08', githubFetcher))
      .rejects.toThrow('incomplete search results');
  });

  it('stores each board independently and returns honest internal/external statuses', async () => {
    const dataSource = await createLocalDevDataSource();
    try {
      const service = new TrendingNewsService(dataSource, sourceFetch('day1'));
      await expect(service.refresh(new Date('2026-09-08T00:10:00.000Z'))).resolves.toEqual({
        refreshedBoards: ['hacker_news', 'stackoverflow', 'github_rising', 'baidu'],
        itemCount: 40,
      });
      const page = await service.listDaily(new Date('2026-09-08T01:00:00.000Z'));
      expect(page.schedule).toBe('每天 08:10（北京时间）');
      expect(page.serviceDate).toBe('2026-09-08');
      expect(page.boards.slice(0, 4).map((board) => [board.id, board.status, board.items.length]))
        .toEqual(INTERNAL_TRENDING_BOARDS.map((board) => [board.id, 'fresh', 10]));
      expect(page.boards.slice(4).map((board) => [board.id, board.status, board.items.length]))
        .toEqual(EXTERNAL_TRENDING_BOARDS.map((board) => [board.id, 'external_only', 0]));
      expect(await dataSource.getRepository(TrendingNewsBoardRun).count()).toBe(4);
      expect(await dataSource.getRepository(TrendingNewsItemRecord).count()).toBe(40);
    } finally {
      await dataSource.destroy();
    }
  });

  it('keeps the prior real snapshot for one failed board while other boards advance', async () => {
    const dataSource = await createLocalDevDataSource();
    try {
      const dayOne = new TrendingNewsService(dataSource, sourceFetch('day1'));
      await dayOne.refresh(new Date('2026-09-08T00:10:00.000Z'));
      const dayTwo = new TrendingNewsService(
        dataSource,
        sourceFetch('day2', 'api.stackexchange.com'),
      );
      await expect(dayTwo.refresh(new Date('2026-09-09T00:10:00.000Z'))).resolves.toEqual({
        refreshedBoards: ['hacker_news', 'github_rising', 'baidu'],
        itemCount: 30,
      });

      const page = await dayTwo.listDaily(new Date('2026-09-09T01:00:00.000Z'));
      expect(page.boards.slice(0, 3).map((board) => [board.id, board.status, board.snapshotDate]))
        .toEqual([
          ['hacker_news', 'fresh', '2026-09-09'],
          ['stackoverflow', 'stale', '2026-09-08'],
          ['github_rising', 'fresh', '2026-09-09'],
        ]);
      expect(page.boards[1].items[0].title).toContain('day1');
      expect(page.boards[0].items[0].title).toContain('day2');
      expect(await dataSource.getRepository(TrendingNewsItemRecord).count()).toBe(70);
    } finally {
      await dataSource.destroy();
    }
  });

  it('rejects a partially rate-limited HN refresh and persists its retry delay', async () => {
    const dataSource = await createLocalDevDataSource();
    try {
      await new TrendingNewsService(dataSource, sourceFetch('day1'))
        .refresh(new Date('2026-09-08T00:10:00.000Z'));
      const base = sourceFetch('day2');
      const fetcher = jest.fn((input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(String(input));
        if (url.hostname === 'hacker-news.firebaseio.com' && url.pathname.endsWith('/item/4.json')) {
          return Promise.resolve(new Response(JSON.stringify({ error: 'slow down' }), {
            status: 429,
            headers: { 'Content-Type': 'application/json', 'Retry-After': '172800' },
          }));
        }
        return base(input, init);
      }) as jest.MockedFunction<typeof fetch>;
      const service = new TrendingNewsService(dataSource, fetcher);
      await expect(service.refresh(new Date('2026-09-09T00:10:00.000Z'))).resolves.toEqual({
        refreshedBoards: ['stackoverflow', 'github_rising', 'baidu'],
        itemCount: 30,
      });
      const page = await service.listDaily(new Date('2026-09-09T01:00:00.000Z'));
      expect(page.boards[0]).toMatchObject({
        id: 'hacker_news', status: 'stale', snapshotDate: '2026-09-08',
      });
      expect(page.boards[0].items.every((item) => item.title.includes('day1'))).toBe(true);
      const failed = await dataSource.getRepository(TrendingNewsBoardRun).findOneByOrFail({
        serviceDate: '2026-09-09', boardId: 'hacker_news',
      });
      expect(failed.status).toBe('failed');
      expect(failed.retryNotBefore?.toISOString()).toBe('2026-09-11T00:10:00.000Z');
      expect(await dataSource.getRepository(TrendingNewsItemRecord).count({
        where: { serviceDate: '2026-09-09', boardId: 'hacker_news' },
      })).toBe(0);
    } finally {
      await dataSource.destroy();
    }
  });

  it('honors a successful Stack backoff across service dates without another request', async () => {
    const dataSource = await createLocalDevDataSource();
    try {
      const base = sourceFetch('day1');
      const backedOff = jest.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const response = await base(input, init);
        if (new URL(String(input)).hostname !== 'api.stackexchange.com') return response;
        const body = await response.json() as Record<string, unknown>;
        return jsonResponse({ ...body, backoff: 172800 });
      }) as jest.MockedFunction<typeof fetch>;
      await new TrendingNewsService(dataSource, backedOff)
        .refresh(new Date('2026-09-08T00:10:00.000Z'));
      const first = await dataSource.getRepository(TrendingNewsBoardRun).findOneByOrFail({
        serviceDate: '2026-09-08', boardId: 'stackoverflow',
      });
      expect(first.status).toBe('completed');
      expect(first.retryNotBefore?.toISOString()).toBe('2026-09-10T00:10:00.000Z');

      const nextFetch = sourceFetch('day2');
      await expect(new TrendingNewsService(dataSource, nextFetch)
        .refresh(new Date('2026-09-09T00:10:00.000Z'))).resolves.toEqual({
        refreshedBoards: ['hacker_news', 'github_rising', 'baidu'],
        itemCount: 30,
      });
      expect(nextFetch.mock.calls.some(([input]) =>
        new URL(String(input)).hostname === 'api.stackexchange.com',
      )).toBe(false);
      await expect(dataSource.getRepository(TrendingNewsBoardRun).findOneBy({
        serviceDate: '2026-09-09', boardId: 'stackoverflow',
      })).resolves.toBeNull();
    } finally {
      await dataSource.destroy();
    }
  });

  it('lets only one replica win each new board-date insert', async () => {
    const dataSource = await createLocalDevDataSource();
    const fetcher = sourceFetch('winner');
    try {
      const services = [
        new TrendingNewsService(dataSource, fetcher),
        new TrendingNewsService(dataSource, fetcher),
      ];
      const results = await Promise.all(
        services.map((service) => service.refresh(new Date('2026-09-08T00:10:00.000Z'))),
      );
      expect(results.reduce((count, result) => count + result.refreshedBoards.length, 0)).toBe(4);
      expect(await dataSource.getRepository(TrendingNewsBoardRun).count()).toBe(4);
      expect(await dataSource.getRepository(TrendingNewsItemRecord).count()).toBe(40);
    } finally {
      await dataSource.destroy();
    }
  });

  it('does not let an expired worker publish over a newer lease owner', async () => {
    const dataSource: DataSource = await createLocalDevDataSource();
    let releaseOld!: () => void;
    const oldGate = new Promise<void>((resolve) => { releaseOld = resolve; });
    const oldBase = sourceFetch('old');
    const oldFetcher = jest.fn(async (input: string | URL | Request, init?: RequestInit) => {
      await oldGate;
      return oldBase(input, init);
    }) as jest.MockedFunction<typeof fetch>;
    const oldService = new TrendingNewsService(dataSource, oldFetcher);
    const newService = new TrendingNewsService(dataSource, sourceFetch('new'));
    const oldRefresh = oldService.refresh(new Date('2026-09-08T00:10:00.000Z'));
    try {
      for (let attempt = 0; attempt < 30; attempt += 1) {
        if (await dataSource.getRepository(TrendingNewsBoardRun).count() >= 2) break;
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      await newService.refresh(new Date('2026-09-08T00:21:00.000Z'));
      releaseOld();
      await oldRefresh;

      const page = await newService.listDaily(new Date('2026-09-08T01:00:00.000Z'));
      expect(page.boards.slice(0, 3).every((board) =>
        board.items.every((item) => item.title.includes('new')),
      )).toBe(true);
    } finally {
      releaseOld();
      await oldRefresh.catch(() => undefined);
      await dataSource.destroy();
    }
  });
});
