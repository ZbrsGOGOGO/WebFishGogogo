import { fetchBilibiliTrending, fetchDoubanChart, TrendingNewsService } from './trending-news.service';
import { createLocalDevDataSource } from '../../../database/local-dev-datasource';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const html = (body: string, status = 200) => new Response(body, { status, headers: { 'content-type': 'text/html' } });
const film = (id: string, title: string, extra = '') => `<tr class="item"><td><a class="nbg" href="https://movie.douban.com/subject/${id}/" title="${title}"><img src="never-download-image"></a><p>never-save-synopsis</p><span class="rating_nums">8.1</span>${extra}</td></tr>`;
const chart = (rows: string) => `<h1>豆瓣电影排行榜</h1><h2>豆瓣新片榜 · · ·</h2>${rows}<h2>一周口碑榜</h2>${film('9999', 'Other chart')}`;

describe('public entertainment chart metadata', () => {
  afterEach(() => { delete process.env.FEATURE_EXPANDED_TRENDING_ENABLED; });
  it('keeps source Bilibili positions, fixes original hosts, drops invalid and duplicate entries', async () => {
    const fetcher = jest.fn().mockResolvedValue(json({ code: 0, data: { list: [
      { bvid: 'BV1234567890', title: 'Test &amp; title', stat: { view: 12345 }, pubdate: 123456 },
      { bvid: 'https://bad.example/', title: 'bad' },
      { bvid: 'BV1234567891', title: '&lt;script&gt;clean&lt;/script&gt;', stat: { view: -5 } },
      { bvid: 'BV1234567890', title: 'duplicate' },
    ] } })) as jest.MockedFunction<typeof fetch>;
    const rows = await fetchBilibiliTrending(fetcher);
    expect(rows.map(row => row.sourceRank)).toEqual([1, 3]);
    expect(rows[0]).toMatchObject({ sourceItemId: 'BV1234567890', originalUrl: 'https://www.bilibili.com/video/BV1234567890/', heatText: '12,345 次播放' });
    expect(rows[1]).toMatchObject({ title: 'clean', heatText: null });
    expect(fetcher).toHaveBeenCalledWith('https://api.bilibili.com/x/web-interface/ranking/v2?rid=0&type=all', expect.objectContaining({ redirect: 'manual' }));
  });
  it.each([-352, -412, -101])('treats Bilibili business denial %s as unavailable with no cookie/retry workaround', async code => {
    const fetcher = jest.fn().mockResolvedValue(json({ code, message: 'restricted' })) as jest.MockedFunction<typeof fetch>;
    await expect(fetchBilibiliTrending(fetcher)).rejects.toThrow('unavailable');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]?.headers).not.toHaveProperty('Cookie');
  });
  it('collects only explicitly labeled new-film chart rows, not adjacent lists/images/synopses', async () => {
    const fetcher = jest.fn().mockResolvedValue(html(chart(
      film('123', 'Test &amp; film') + film('124', '&lt;b&gt;Safe&lt;/b&gt;') + film('123', 'duplicate'),
    ))) as jest.MockedFunction<typeof fetch>;
    const rows = await fetchDoubanChart(fetcher);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ title: 'Test & film', originalUrl: 'https://movie.douban.com/subject/123/', sourceRank: 1, heatText: '8.1 分（豆瓣）' });
    expect(rows[1].title).toBe('Safe');
    expect(JSON.stringify(rows)).not.toMatch(/9999|Other chart|never-save|never-download/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not parse charts hidden inside scripts and comments', async () => {
    const fetcher = jest.fn().mockResolvedValue(html(`<script>${chart(film('123', 'fake'))}</script><!--${chart(film('124', 'comment'))}-->`)) as jest.MockedFunction<typeof fetch>;
    await expect(fetchDoubanChart(fetcher)).rejects.toThrow('section missing');
  });
  it.each([
    () => html('login', 302), () => html('forbidden', 403), () => json({ data: [] }),
    () => html('<h1>Chart structure changed</h1>'), () => html('x'.repeat(2_000_001)),
    () => html(chart(film('123', 'unsafe').replace('movie.douban.com/subject/123/', 'movie.douban.com.evil.example/subject/123/'))),
    () => html(chart(film('123', 'unsafe').replace('https://movie.douban.com/subject/123/', 'javascript:alert(1)'))),
  ])('fails closed on invalid public chart case %#', async response => {
    const fetcher = jest.fn().mockResolvedValue(response()) as jest.MockedFunction<typeof fetch>;
    await expect(fetchDoubanChart(fetcher)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('enables two new snapshots independently and preserves true prior data during restrictions', async () => {
    process.env.FEATURE_EXPANDED_TRENDING_ENABLED = 'true';
    const db = await createLocalDevDataSource();
    let denied = false;
    const fetcher = jest.fn(async (url: string | URL | Request) => {
      const host = new URL(String(url)).hostname;
      if (host === 'api.bilibili.com') return denied ? json({ code: -352 }) : json({ code: 0, data: { list: [{ bvid: 'BV1234567890', title: 'Real snapshot fixture' }] } });
      if (host === 'movie.douban.com') return html(chart(film('123', 'Film fixture')));
      return json({ unavailable: true }, 503);
    }) as jest.MockedFunction<typeof fetch>;
    try {
      const service = new TrendingNewsService(db, fetcher);
      expect((await service.refresh(new Date('2026-09-09T00:10:00Z'))).refreshedBoards).toEqual(['bilibili', 'douban']);
      let page = await service.listDaily(new Date('2026-09-09T01:00:00Z'));
      expect(page.boards.find(b => b.id === 'bilibili')).toMatchObject({ status: 'fresh', snapshotDate: '2026-09-09' });
      expect(page.boards.filter(b => b.status === 'external_only').map(b => b.id)).toEqual(['weibo', 'zhihu', 'douyin']);
      denied = true;
      await service.refresh(new Date('2026-09-10T00:10:00Z'));
      page = await service.listDaily(new Date('2026-09-10T01:00:00Z'));
      expect(page.boards.find(b => b.id === 'bilibili')).toMatchObject({ status: 'stale', snapshotDate: '2026-09-09' });
      expect(page.boards.find(b => b.id === 'douban')).toMatchObject({ status: 'fresh', snapshotDate: '2026-09-10' });
      const calls = fetcher.mock.calls.length;
      await service.refresh(new Date('2026-09-10T00:25:00Z'));
      expect(fetcher.mock.calls.slice(calls).some(([url]) => String(url).includes('api.bilibili.com'))).toBe(false);
    } finally { await db.destroy(); }
  });
});
