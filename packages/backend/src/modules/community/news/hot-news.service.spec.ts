import {
  HotNewsService,
  isDailyHotNewsDue,
  nextDailyHotNewsRefresh,
  parseHotNewsRss,
  shanghaiServiceDate,
} from './hot-news.service';
import type { DataSource } from 'typeorm';
import { createLocalDevDataSource } from '../../../database/local-dev-datasource';

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
    </channel></rss>`;
    expect(parseHotNewsRss(xml, ['xinhuanet.com'])).toEqual([{
      headline: '官方热点 & 更新',
      originalUrl: 'https://www.xinhuanet.com/a/1',
      originalPublishedAt: new Date('2026-08-23T00:00:00.000Z'),
    }]);
  });

  it('persists one completed daily refresh and does not run it twice', async () => {
    const dataSource: DataSource = await createLocalDevDataSource();
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      const publisherUrl = url.includes('chinanews')
        ? 'https://www.chinanews.com.cn/cj/2026/08-23/example.shtml'
        : 'http://www.news.cn/politics/2026-08/23/example.htm';
      const source = url.includes('chinanews') ? '中新' : '新华';
      return new Response(`<rss><channel><item><title>${source}热点</title><link>${publisherUrl}</link><pubDate>Sun, 23 Aug 2026 01:00:00 GMT</pubDate></item></channel></rss>`);
    });
    try {
      const service = new HotNewsService(dataSource);
      await expect(service.refresh(new Date('2026-08-23T00:00:00.000Z')))
        .resolves.toMatchObject({ refreshed: true, itemCount: 2 });
      await expect(service.refresh(new Date('2026-08-23T01:00:00.000Z')))
        .resolves.toMatchObject({ refreshed: false, itemCount: 2 });
      const page = await service.listDaily();
      expect(page.serviceDate).toBe('2026-08-23');
      expect(page.items.map((item) => item.headline).sort()).toEqual(['中新热点', '新华热点'].sort());
    } finally {
      fetchMock.mockRestore();
      await dataSource.destroy();
    }
  });
});
