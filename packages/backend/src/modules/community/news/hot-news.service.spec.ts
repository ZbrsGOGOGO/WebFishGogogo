import type { DataSource } from 'typeorm';

import {
  HotNewsHeadline,
  HotNewsRefreshRun,
} from '../../../database/entities';
import { createLocalDevDataSource } from '../../../database/local-dev-datasource';
import {
  HOT_NEWS_CATEGORIES,
  HotNewsService,
  isDailyHotNewsDue,
  nextDailyHotNewsRefresh,
  parseHotNewsRss,
  shanghaiServiceDate,
} from './hot-news.service';

const FEED_CATEGORY_BY_FILE: Record<string, string> = {
  'importnews.xml': 'general',
  'china.xml': 'domestic',
  'world.xml': 'world',
  'society.xml': 'society',
  'finance.xml': 'finance',
  'culture.xml': 'culture',
  'sports.xml': 'sports',
};

function feedCategory(input: string | URL | Request): string {
  const file = new URL(String(input)).pathname.split('/').at(-1) ?? '';
  return FEED_CATEGORY_BY_FILE[file] ?? 'unknown';
}

function rssResponse(
  category: string,
  count = 1,
  publishedAt = new Date('2026-08-23T00:00:00.000Z'),
): Response {
  const items = Array.from({ length: count }, (_, index) => `
    <item>
      <title>${category} 热点 ${index + 1}</title>
      <link>https://www.chinanews.com.cn/${category}/2026/08-23/${index + 1}.shtml</link>
      <pubDate>${new Date(publishedAt.getTime() - index * 1_000).toUTCString()}</pubDate>
      <description>正文不应进入结果</description>
    </item>`).join('');
  return new Response(`<rss><channel>${items}</channel></rss>`, {
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  });
}

describe('daily hot-news rules', () => {
  it('uses the fixed China Standard Time 08:00 boundary', () => {
    expect(shanghaiServiceDate(new Date('2026-08-22T16:00:00.000Z'))).toBe('2026-08-23');
    expect(isDailyHotNewsDue(new Date('2026-08-22T23:59:59.000Z'))).toBe(false);
    expect(isDailyHotNewsDue(new Date('2026-08-23T00:00:00.000Z'))).toBe(true);
    expect(nextDailyHotNewsRefresh(new Date('2026-08-23T00:00:00.000Z')).toISOString())
      .toBe('2026-08-24T00:00:00.000Z');
  });

  it('extracts only title and allow-listed publisher links from RSS', () => {
    const xml = `<?xml version="1.0"?><rss><channel>
      <item><title><![CDATA[ 官方热点 &amp; 更新 ]]></title><link>http://www.xinhuanet.com/a/1?utm_source=test</link><pubDate>Sun, 23 Aug 2026 00:00:00 GMT</pubDate><description>正文不应进入结果</description></item>
      <item><title>伪造来源</title><link>https://evil.example/a/2</link></item>
      <item><title>无日期旧闻</title><link>https://www.xinhuanet.com/a/3</link></item>
      <item><title>异常&#999999999;字符</title><link>https://www.xinhuanet.com/a/4</link><pubDate>Sun, 23 Aug 2026 00:00:00 GMT</pubDate></item>
    </channel></rss>`;
    expect(parseHotNewsRss(xml, ['xinhuanet.com'])).toEqual([
      {
        headline: '官方热点 & 更新',
        originalUrl: 'https://www.xinhuanet.com/a/1',
        originalPublishedAt: new Date('2026-08-23T00:00:00.000Z'),
      },
      {
        headline: '异常 字符',
        originalUrl: 'https://www.xinhuanet.com/a/4',
        originalPublishedAt: new Date('2026-08-23T00:00:00.000Z'),
      },
    ]);
  });

  it('persists categorized feeds once with bounded parallel requests', async () => {
    const dataSource: DataSource = await createLocalDevDataSource();
    let activeRequests = 0;
    let maxActiveRequests = 0;
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      activeRequests += 1;
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
      await Promise.resolve();
      activeRequests -= 1;
      return rssResponse(feedCategory(input));
    });
    try {
      const service = new HotNewsService(dataSource);
      await expect(service.refresh(new Date('2026-08-23T00:00:00.000Z')))
        .resolves.toEqual({ refreshed: true, itemCount: 7 });
      await expect(service.refresh(new Date('2026-08-23T01:00:00.000Z')))
        .resolves.toEqual({ refreshed: false, itemCount: 7 });

      const page = await service.listDaily(new Date('2026-08-23T01:00:00.000Z'));
      expect(page.serviceDate).toBe('2026-08-23');
      expect(page.categories).toEqual(HOT_NEWS_CATEGORIES.map((category) => ({
        ...category,
        count: 1,
      })));
      expect(page.items.map((item) => item.category).sort())
        .toEqual(HOT_NEWS_CATEGORIES.map((category) => category.id).sort());
      expect(fetchMock).toHaveBeenCalledTimes(7);
      expect(maxActiveRequests).toBeLessThanOrEqual(3);
      expect(maxActiveRequests).toBeGreaterThan(1);
      expect(fetchMock.mock.calls.every(([, init]) => init?.redirect === 'manual')).toBe(true);
    } finally {
      fetchMock.mockRestore();
      await dataSource.destroy();
    }
  });

  it('reserves eight fresh headlines for every category before the total cap', async () => {
    const dataSource: DataSource = await createLocalDevDataSource();
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (input) =>
      rssResponse(feedCategory(input), 10));
    try {
      const service = new HotNewsService(dataSource);
      await expect(service.refresh(new Date('2026-08-23T00:00:00.000Z')))
        .resolves.toEqual({ refreshed: true, itemCount: 56 });
      const page = await service.listDaily(new Date('2026-08-23T01:00:00.000Z'));
      expect(page.items).toHaveLength(56);
      expect(page.categories.map((category) => category.count))
        .toEqual([8, 8, 8, 8, 8, 8, 8]);
      expect(await dataSource.getRepository(HotNewsHeadline).count()).toBe(56);
    } finally {
      fetchMock.mockRestore();
      await dataSource.destroy();
    }
  });

  it('keeps a completed legacy snapshot on failed upgrade, then replaces it once safely', async () => {
    const dataSource: DataSource = await createLocalDevDataSource();
    const serviceDate = '2026-08-23';
    const completedAt = new Date('2026-08-23T00:00:01.000Z');
    await dataSource.getRepository(HotNewsRefreshRun).save(
      dataSource.getRepository(HotNewsRefreshRun).create({
        serviceDate,
        status: 'completed',
        itemCount: 1,
        lastError: null,
        startedAt: new Date('2026-08-23T00:00:00.000Z'),
        completedAt,
        leaseExpiresAt: new Date('2026-08-23T00:10:00.000Z'),
      }),
    );
    const legacy = await dataSource.getRepository(HotNewsHeadline).save(
      dataSource.getRepository(HotNewsHeadline).create({
        serviceDate,
        sourceKey: 'chinanews-important',
        sourceName: '中国新闻网',
        headline: '升级前的真实标题',
        originalUrl: 'https://www.chinanews.com.cn/legacy/1.shtml',
        originalPublishedAt: new Date('2026-08-23T00:00:00.000Z'),
        rank: 1,
        fingerprint: 'a'.repeat(64),
      }),
    );
    let releaseFailedFetches!: () => void;
    const failedFetchGate = new Promise<void>((resolve) => {
      releaseFailedFetches = resolve;
    });
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async () => {
      await failedFetchGate;
      throw new Error('network unavailable');
    });
    try {
      const service = new HotNewsService(dataSource);
      const pendingUpgrade = service.refresh(new Date('2026-08-23T00:02:00.000Z'));
      for (let attempt = 0; attempt < 20 && fetchMock.mock.calls.length < 3; attempt += 1) {
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      expect(fetchMock.mock.calls).toHaveLength(3);
      await expect(service.listDaily(new Date('2026-08-23T00:02:30.000Z')))
        .resolves.toMatchObject({
          serviceDate,
          updatedAt: completedAt.toISOString(),
          items: [expect.objectContaining({ headline: '升级前的真实标题' })],
        });
      expect(await dataSource.getRepository(HotNewsRefreshRun).findOneByOrFail({ serviceDate }))
        .toMatchObject({ status: 'running', completedAt });
      releaseFailedFetches();
      await expect(pendingUpgrade)
        .resolves.toEqual({ refreshed: false, itemCount: 1 });
      expect(await dataSource.getRepository(HotNewsRefreshRun).findOneByOrFail({ serviceDate }))
        .toMatchObject({ status: 'completed', itemCount: 1, completedAt });
      expect(await dataSource.getRepository(HotNewsHeadline).findOneByOrFail({ id: legacy.id }))
        .toMatchObject({ headline: '升级前的真实标题' });
      await expect(service.listDaily(new Date('2026-08-23T00:03:00.000Z')))
        .resolves.toMatchObject({
          serviceDate,
          items: [expect.objectContaining({
            category: 'general',
            headline: '升级前的真实标题',
          })],
        });

      fetchMock.mockImplementation(async (input) => rssResponse(
        feedCategory(input),
        1,
        new Date('2026-08-23T00:03:00.000Z'),
      ));
      await expect(service.refresh(new Date('2026-08-23T00:04:00.000Z')))
        .resolves.toEqual({ refreshed: true, itemCount: 7 });
      expect(await dataSource.getRepository(HotNewsHeadline).exist({ where: { id: legacy.id } }))
        .toBe(false);
      const callsAfterUpgrade = fetchMock.mock.calls.length;
      await expect(service.refresh(new Date('2026-08-23T00:05:00.000Z')))
        .resolves.toEqual({ refreshed: false, itemCount: 7 });
      expect(fetchMock).toHaveBeenCalledTimes(callsAfterUpgrade);
    } finally {
      fetchMock.mockRestore();
      await dataSource.destroy();
    }
  });

  it('does not replace a legacy snapshot with a partial category refresh', async () => {
    const dataSource: DataSource = await createLocalDevDataSource();
    const serviceDate = '2026-08-23';
    await dataSource.getRepository(HotNewsRefreshRun).save(
      dataSource.getRepository(HotNewsRefreshRun).create({
        serviceDate,
        status: 'completed',
        itemCount: 1,
        lastError: null,
        startedAt: new Date('2026-08-23T00:00:00.000Z'),
        completedAt: new Date('2026-08-23T00:00:01.000Z'),
        leaseExpiresAt: new Date('2026-08-23T00:10:00.000Z'),
      }),
    );
    await dataSource.getRepository(HotNewsHeadline).save(
      dataSource.getRepository(HotNewsHeadline).create({
        serviceDate,
        sourceKey: 'chinanews-scroll',
        sourceName: '中国新闻网',
        headline: '原有完整快照',
        originalUrl: 'https://www.chinanews.com.cn/legacy/partial.shtml',
        originalPublishedAt: new Date('2026-08-23T00:00:00.000Z'),
        rank: 1,
        fingerprint: 'b'.repeat(64),
      }),
    );
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (input) =>
      feedCategory(input) === 'finance'
        ? rssResponse('finance')
        : Promise.reject(new Error('source unavailable')));
    try {
      const service = new HotNewsService(dataSource);
      await expect(service.refresh(new Date('2026-08-23T00:02:00.000Z')))
        .resolves.toEqual({ refreshed: false, itemCount: 1 });
      expect(await dataSource.getRepository(HotNewsHeadline).find())
        .toEqual([expect.objectContaining({ headline: '原有完整快照' })]);
    } finally {
      fetchMock.mockRestore();
      await dataSource.destroy();
    }
  });

  it('rejects oversized XML responses without following redirects', async () => {
    const dataSource: DataSource = await createLocalDevDataSource();
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (_input, init) => {
      expect(init?.redirect).toBe('manual');
      return new Response('<rss/>', {
        status: 200,
        headers: {
          'Content-Type': 'text/xml',
          'Content-Length': '2000001',
        },
      });
    });
    try {
      const service = new HotNewsService(dataSource);
      await expect(service.refresh(new Date('2026-08-23T00:00:00.000Z')))
        .resolves.toEqual({ refreshed: false, itemCount: 0 });
      expect(await dataSource.getRepository(HotNewsHeadline).count()).toBe(0);
      expect(await dataSource.getRepository(HotNewsRefreshRun).findOneByOrFail({
        serviceDate: '2026-08-23',
      })).toMatchObject({ status: 'failed', itemCount: 0 });
    } finally {
      fetchMock.mockRestore();
      await dataSource.destroy();
    }
  });
});
