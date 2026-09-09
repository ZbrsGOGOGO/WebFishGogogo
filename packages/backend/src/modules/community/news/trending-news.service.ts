import { createHash, randomUUID } from 'node:crypto';

import type {
  TrendingNewsBoard,
  TrendingNewsBoardGroup,
  TrendingNewsBoardId,
  TrendingNewsItem,
  TrendingNewsSnapshot,
} from '@stealth-reader/shared';
import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  Optional,
} from '@nestjs/common';
import { DataSource, LessThanOrEqual, MoreThan } from 'typeorm';

import {
  TrendingNewsBoardRun,
  TrendingNewsItemRecord,
} from '../../../database/entities/trending-news.entity';

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1_000;
const REFRESH_HOUR = 8;
const REFRESH_MINUTE = 10;
const REFRESH_INTERVAL_MS = 5 * 60 * 1_000;
const REFRESH_LEASE_MS = 10 * 60 * 1_000;
const FAILED_RETRY_MS = 15 * 60 * 1_000;
const MAX_JSON_BYTES = 2_000_000;
const MAX_ITEMS_PER_BOARD = 10;
const BOARD_FETCH_CONCURRENCY = 2;
const HN_ITEM_FETCH_CONCURRENCY = 4;
const MAX_UPSTREAM_BACKOFF_MS = 7 * 24 * 60 * 60 * 1_000;

export const TRENDING_NEWS_FETCH = Symbol('TRENDING_NEWS_FETCH');

type InternalBoardId = TrendingNewsBoardId;

interface InternalBoardConfig {
  id: InternalBoardId;
  label: string;
  group: TrendingNewsBoardGroup;
  sourceUrl: string;
  note: string;
}

interface ExternalBoardConfig {
  id: TrendingNewsBoardId;
  label: string;
  group: TrendingNewsBoardGroup;
  sourceUrl: string;
  note: string;
}

interface CollectedTrendingItem {
  sourceItemId: string;
  sourceRank: number;
  title: string;
  originalUrl: string | null;
  heatText: string | null;
  publishedAt: Date | null;
}

interface CollectedBoardSnapshot {
  items: CollectedTrendingItem[];
  retryAfterMs: number | null;
  retryAtMs: number | null;
}

interface OfficialJsonResult {
  body: unknown;
  retryAfterMs: number | null;
  retryAtMs: number | null;
  quotaRemaining: number | null;
}

interface RefreshClaim {
  token: string;
  startedAt: Date;
}

class UpstreamRetryError extends Error {
  constructor(
    message: string,
    readonly retryAfterMs: number | null,
    readonly retryAtMs: number | null,
  ) {
    super(message);
  }
}

/**
 * The first three sources expose documented public JSON APIs. Baidu uses only
 * the public board's embedded JSON (not a documented API). Never evaluate page
 * scripts, forward cookies, follow redirects or retrieve linked article bodies.
 *
 * Hacker News: https://github.com/HackerNews/API
 * Stack Exchange: https://api.stackexchange.com/docs/questions
 * GitHub Search: https://docs.github.com/en/rest/search/search
 */
export const INTERNAL_TRENDING_BOARDS: readonly InternalBoardConfig[] = [
  {
    id: 'hacker_news',
    label: 'Hacker News 热门',
    group: 'technology',
    sourceUrl: 'https://news.ycombinator.com/',
    note: '每日记录官方 API 热门故事排名；本站不抓取链接正文。无效条目被安全过滤后，原名次可能留空。',
  },
  {
    id: 'stackoverflow',
    label: 'Stack Overflow 热门问题',
    group: 'technology',
    sourceUrl: 'https://stackoverflow.com/questions?tab=Hot',
    note: '每日记录 Stack Exchange 官方 API 的 hot 排序；安全过滤后保留原名次。',
  },
  {
    id: 'github_rising',
    label: 'GitHub 本周新星项目',
    group: 'technology',
    sourceUrl: 'https://github.com/search?type=repositories',
    note: '依 GitHub 官方 Search API 统计近 7 日新建且 Star 较高的仓库，不冒称 GitHub Trending；过滤后保留原名次。',
  },
  {
    id: 'baidu', label: '百度热搜', group: 'social',
    sourceUrl: 'https://top.baidu.com/board?tab=realtime',
    note: '每日读取百度公开榜单页面中的标题、排名与热度，非官方开放 API；不保存摘要、图片或新闻正文。来源结构变化时保留最近快照并标记更新失败。',
  },
] as const;

/** Public metadata, not an authenticated scraping proxy. Released independently. */
export const EXPANDED_TRENDING_BOARDS: readonly InternalBoardConfig[] = [
  { id: 'bilibili', label: '哔哩哔哩全站榜', group: 'entertainment',
    sourceUrl: 'https://www.bilibili.com/v/popular/rank/all',
    note: '每日记录公开全站榜的标题、顺序和播放数，不抓取视频或评论。平台风控时保留上次真实快照，播放数不是跨平台热度。' },
  { id: 'douban', label: '豆瓣新片榜', group: 'entertainment',
    sourceUrl: 'https://movie.douban.com/chart',
    note: '每日记录公开电影排行榜内“豆瓣新片榜”的顺序、片名及评分；不混入口碑榜、票房榜或 TOP250，不复制影评、剧照或简介。' },
];

function activeInternalBoards(): readonly InternalBoardConfig[] {
  return process.env.FEATURE_EXPANDED_TRENDING_ENABLED === 'true'
    ? [...INTERNAL_TRENDING_BOARDS, ...EXPANDED_TRENDING_BOARDS]
    : INTERNAL_TRENDING_BOARDS;
}

export const EXTERNAL_TRENDING_BOARDS: readonly ExternalBoardConfig[] = [
  {
    id: 'weibo', label: '微博热搜', group: 'social',
    sourceUrl: 'https://s.weibo.com/top/summary?cate=realtimehot',
    note: '公开网页接口当前拒绝无登录访问，本站未抓取或伪造榜单。',
  },
  {
    id: 'zhihu', label: '知乎热榜', group: 'social',
    sourceUrl: 'https://www.zhihu.com/hot',
    note: '公开网页接口当前需要授权，本站未抓取或伪造榜单。',
  },
  {
    id: 'bilibili', label: '哔哩哔哩排行榜', group: 'entertainment',
    sourceUrl: 'https://www.bilibili.com/v/popular/rank/all',
    note: '公开网页数据接口当前触发风控，仅保留官方入口。',
  },
  {
    id: 'douyin', label: '抖音热点', group: 'entertainment',
    sourceUrl: 'https://www.douyin.com/hot',
    note: '暂无经核验的稳定官方开放数据合同，仅保留官方入口。',
  },
  {
    id: 'douban', label: '豆瓣电影排行榜', group: 'entertainment',
    sourceUrl: 'https://movie.douban.com/chart',
    note: '暂无经核验的稳定官方开放数据合同，仅保留官方入口。',
  },
] as const;

export function shanghaiTrendingServiceDate(now: Date): string {
  return new Date(now.getTime() + SHANGHAI_OFFSET_MS).toISOString().slice(0, 10);
}

export function isDailyTrendingNewsDue(now: Date): boolean {
  const local = new Date(now.getTime() + SHANGHAI_OFFSET_MS);
  return local.getUTCHours() > REFRESH_HOUR ||
    (local.getUTCHours() === REFRESH_HOUR && local.getUTCMinutes() >= REFRESH_MINUTE);
}

export function nextDailyTrendingNewsRefresh(now: Date): Date {
  const local = new Date(now.getTime() + SHANGHAI_OFFSET_MS);
  const nextLocal = new Date(local);
  nextLocal.setUTCHours(REFRESH_HOUR, REFRESH_MINUTE, 0, 0);
  if (nextLocal.getTime() <= local.getTime()) nextLocal.setUTCDate(nextLocal.getUTCDate() + 1);
  return new Date(nextLocal.getTime() - SHANGHAI_OFFSET_MS);
}

function expectedTrendingServiceDate(now: Date): string {
  if (isDailyTrendingNewsDue(now)) return shanghaiTrendingServiceDate(now);
  return shanghaiTrendingServiceDate(new Date(now.getTime() - 24 * 60 * 60 * 1_000));
}

@Injectable()
export class TrendingNewsService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(TrendingNewsService.name);
  private timer?: ReturnType<typeof setInterval>;
  private tickRunning = false;
  private readonly fetcher: typeof fetch;

  constructor(
    private readonly dataSource: DataSource,
    @Optional() @Inject(TRENDING_NEWS_FETCH) fetcher?: typeof fetch,
  ) {
    this.fetcher = fetcher ?? globalThis.fetch.bind(globalThis);
  }

  onApplicationBootstrap(): void {
    if (
      process.env.FEATURE_NEWS_AUTO_REFRESH_ENABLED !== 'true' ||
      process.env.FEATURE_COMMUNITY_NEWS_ENABLED !== 'true'
    ) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), REFRESH_INTERVAL_MS);
    this.timer.unref?.();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async listDaily(now = new Date()): Promise<TrendingNewsSnapshot> {
    const expectedDate = expectedTrendingServiceDate(now);
    const boards = await Promise.all(
      activeInternalBoards().map((board) => this.listBoard(board, expectedDate)),
    );
    const completedBoards = boards.filter((board) => board.snapshotDate !== null);
    const serviceDate = completedBoards
      .map((board) => board.snapshotDate as string)
      .sort()
      .at(-1) ?? null;
    const updatedAt = completedBoards
      .map((board) => board.updatedAt as string)
      .sort()
      .at(-1) ?? null;
    return {
      serviceDate,
      updatedAt,
      nextUpdateAt: nextDailyTrendingNewsRefresh(now).toISOString(),
      schedule: '每天 08:10（北京时间）',
      boards: [
        ...boards,
        ...EXTERNAL_TRENDING_BOARDS.filter((board) => !activeInternalBoards().some((internal) => internal.id === board.id)).map((board): TrendingNewsBoard => ({
          ...board,
          status: 'external_only',
          snapshotDate: null,
          updatedAt: null,
          items: [],
        })),
      ],
    };
  }

  /** Public for deterministic operational and lease-race tests. */
  async refresh(now = new Date()): Promise<{ refreshedBoards: InternalBoardId[]; itemCount: number }> {
    const configuredBoards = activeInternalBoards();
    const results = await mapWithConcurrency(
      configuredBoards,
      BOARD_FETCH_CONCURRENCY,
      (board) => this.refreshBoard(board, now),
    );
    return {
      refreshedBoards: configuredBoards
        .filter((_, index) => results[index].refreshed)
        .map((board) => board.id),
      itemCount: results.reduce((total, result) => total + result.itemCount, 0),
    };
  }

  private async listBoard(
    board: InternalBoardConfig,
    expectedDate: string,
  ): Promise<TrendingNewsBoard> {
    const runRepo = this.dataSource.getRepository(TrendingNewsBoardRun);
    const itemRepo = this.dataSource.getRepository(TrendingNewsItemRecord);
    const candidates = await runRepo.find({
      where: {
        boardId: board.id,
        serviceDate: LessThanOrEqual(expectedDate),
        status: 'completed',
      },
      order: { serviceDate: 'DESC' },
      take: 7,
    });
    for (const run of candidates) {
      const records = await itemRepo.find({
        where: { serviceDate: run.serviceDate, boardId: board.id },
        order: { rank: 'ASC' },
        take: MAX_ITEMS_PER_BOARD,
      });
      if (records.length === 0) continue;
      return {
        ...board,
        status: run.serviceDate === expectedDate ? 'fresh' : 'stale',
        snapshotDate: run.serviceDate,
        updatedAt: run.completedAt?.toISOString() ?? null,
        note: run.serviceDate === expectedDate
          ? board.note
          : `今日同步未完成，仍显示 ${run.serviceDate} 的上次真实快照。`,
        items: records.map(mapRecord),
      };
    }
    return {
      ...board,
      status: 'unavailable',
      snapshotDate: null,
      updatedAt: null,
      note: '暂未取得该官方数据源的有效快照，本站不会伪造排名。',
      items: [],
    };
  }

  private async refreshBoard(
    board: InternalBoardConfig,
    now: Date,
  ): Promise<{ refreshed: boolean; itemCount: number }> {
    const serviceDate = shanghaiTrendingServiceDate(now);
    let claim: RefreshClaim | null;
    try {
      claim = await this.claimRun(serviceDate, board.id, now);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      return { refreshed: false, itemCount: 0 };
    }
    if (!claim) {
      const run = await this.dataSource.getRepository(TrendingNewsBoardRun)
        .findOneBy({ serviceDate, boardId: board.id });
      return { refreshed: false, itemCount: run?.itemCount ?? 0 };
    }

    try {
      const fetched = await this.fetchBoard(board.id, serviceDate);
      const items = fetched.items;
      if (items.length === 0) throw new Error('official board returned no usable items');
      const committed = await this.dataSource.transaction(async (manager) => {
        const runRepo = manager.getRepository(TrendingNewsBoardRun);
        const run = await runRepo.findOne({
          where: { serviceDate, boardId: board.id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!run || !ownsLease(run, claim)) return false;
        const itemRepo = manager.getRepository(TrendingNewsItemRecord);
        await itemRepo.delete({ serviceDate, boardId: board.id });
        await itemRepo.insert(items.map((item) => itemRepo.create({
          serviceDate,
          boardId: board.id,
          sourceItemId: item.sourceItemId,
          rank: item.sourceRank,
          title: item.title,
          originalUrl: item.originalUrl,
          heatText: item.heatText,
          publishedAt: item.publishedAt,
        })));
        run.status = 'completed';
        run.itemCount = items.length;
        run.lastError = null;
        run.completedAt = now;
        run.retryNotBefore = directiveRetryNotBefore(fetched, now);
        await runRepo.save(run);
        return true;
      });
      return committed
        ? { refreshed: true, itemCount: items.length }
        : { refreshed: false, itemCount: 0 };
    } catch (error) {
      await this.failRun(serviceDate, board.id, claim, now, error);
      this.logger.warn(`trending board ${board.id} failed: ${safeError(error)}`);
      return { refreshed: false, itemCount: 0 };
    }
  }

  private async claimRun(
    serviceDate: string,
    boardId: InternalBoardId,
    now: Date,
  ): Promise<RefreshClaim | null> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(TrendingNewsBoardRun);
      const existing = await repo.findOne({
        where: { serviceDate, boardId },
        lock: { mode: 'pessimistic_write' },
      });
      if (existing?.status === 'completed') return null;
      if (existing?.retryNotBefore && existing.retryNotBefore > now) return null;
      const priorBackoff = await repo.findOne({
        where: { boardId, retryNotBefore: MoreThan(now) },
        order: { retryNotBefore: 'DESC' },
      });
      if (priorBackoff) return null;
      if (existing && existing.leaseExpiresAt > now) return null;
      const token = randomUUID();
      const run = existing ?? repo.create({ serviceDate, boardId });
      run.status = 'running';
      run.itemCount = 0;
      run.lastError = `lease:${token}`;
      run.startedAt = now;
      run.completedAt = null;
      run.leaseExpiresAt = new Date(now.getTime() + REFRESH_LEASE_MS);
      run.retryNotBefore = null;
      if (existing) await repo.save(run);
      else await repo.insert(run);
      return { token, startedAt: now };
    });
  }

  private async failRun(
    serviceDate: string,
    boardId: InternalBoardId,
    claim: RefreshClaim,
    now: Date,
    error: unknown,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(TrendingNewsBoardRun);
      const run = await repo.findOne({
        where: { serviceDate, boardId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!run || !ownsLease(run, claim)) return;
      run.status = 'failed';
      run.itemCount = 0;
      run.lastError = safeError(error).slice(0, 200);
      run.completedAt = null;
      run.retryNotBefore = retryNotBefore(error, now);
      run.leaseExpiresAt = run.retryNotBefore;
      await repo.save(run);
    });
  }

  private async fetchBoard(
    boardId: InternalBoardId,
    serviceDate: string,
  ): Promise<CollectedBoardSnapshot> {
    switch (boardId) {
      case 'hacker_news': return collectHackerNews(this.fetcher);
      case 'stackoverflow': return collectStackOverflow(this.fetcher);
      case 'github_rising': return collectGitHubRising(serviceDate, this.fetcher);
      case 'baidu': return { items: await fetchBaiduTrending(this.fetcher), retryAfterMs: null, retryAtMs: null };
      case 'bilibili': return collectBilibili(this.fetcher);
      case 'douban': return collectDouban(this.fetcher);
      default: throw new Error('Source requires an authorized data connection');
    }
  }

  private async tick(): Promise<void> {
    if (this.tickRunning) return;
    const now = new Date();
    if (!isDailyTrendingNewsDue(now)) return;
    this.tickRunning = true;
    try {
      await this.refresh(now);
    } catch (error) {
      this.logger.error(`daily trending tick failed: ${safeError(error)}`);
    } finally {
      this.tickRunning = false;
    }
  }
}

export async function fetchHackerNews(
  fetcher: typeof fetch = globalThis.fetch,
): Promise<CollectedTrendingItem[]> {
  return (await collectHackerNews(fetcher)).items;
}

async function collectHackerNews(fetcher: typeof fetch): Promise<CollectedBoardSnapshot> {
  const top = await fetchOfficialJson(
    'https://hacker-news.firebaseio.com/v0/topstories.json',
    ['hacker-news.firebaseio.com'],
    {},
    fetcher,
  );
  if (!Array.isArray(top.body)) throw new Error('Hacker News topstories was not an array');
  const candidates = top.body.slice(0, 20).flatMap((id, index) =>
    Number.isSafeInteger(id) && Number(id) > 0
      ? [{ id: Number(id), sourceRank: index + 1 }]
      : [],
  );
  const records = await mapWithConcurrencyFailFast(
    candidates,
    HN_ITEM_FETCH_CONCURRENCY,
    async ({ id, sourceRank }): Promise<{
      item: CollectedTrendingItem | null;
      directive: Pick<OfficialJsonResult, 'retryAfterMs' | 'retryAtMs'>;
    }> => {
      const result = await fetchOfficialJson(
        `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
        ['hacker-news.firebaseio.com'],
        {},
        fetcher,
      );
      const raw = result.body;
      if (!isRecord(raw) || raw.type !== 'story' || raw.deleted || raw.dead) {
        return { item: null, directive: result };
      }
      const title = cleanExternalTitle(raw.title);
      if (!title) return { item: null, directive: result };
      return {
        item: {
          sourceItemId: String(id),
          sourceRank,
          title,
          originalUrl: `https://news.ycombinator.com/item?id=${id}`,
          heatText: positiveInteger(raw.score) === null ? null : `${positiveInteger(raw.score)} 分`,
          publishedAt: unixDate(raw.time),
        },
        directive: result,
      };
    },
  );
  return {
    items: uniqueItems(records.map((record) => record.item).filter(isCollectedItem))
      .slice(0, MAX_ITEMS_PER_BOARD),
    ...mergeRetryDirectives([top, ...records.map((record) => record.directive)]),
  };
}

export async function fetchStackOverflow(
  fetcher: typeof fetch = globalThis.fetch,
): Promise<CollectedTrendingItem[]> {
  return (await collectStackOverflow(fetcher)).items;
}

async function collectStackOverflow(fetcher: typeof fetch): Promise<CollectedBoardSnapshot> {
  const result = await fetchOfficialJson(
    'https://api.stackexchange.com/2.3/questions?pagesize=10&order=desc&sort=hot&site=stackoverflow&filter=default',
    ['api.stackexchange.com'],
    {},
    fetcher,
  );
  const raw = result.body;
  if (!isRecord(raw)) throw new Error('Stack Exchange response was invalid');
  const backoffSeconds = positiveInteger(raw.backoff);
  const quotaExhausted = positiveInteger(raw.quota_remaining) === 0;
  const retryAfterMs = Math.max(
    result.retryAfterMs ?? 0,
    backoffSeconds === null ? 0 : backoffSeconds * 1_000,
    quotaExhausted ? 24 * 60 * 60 * 1_000 : 0,
  ) || null;
  if (!Array.isArray(raw.items)) {
    if (retryAfterMs !== null || result.retryAtMs !== null) {
      throw new UpstreamRetryError(
        quotaExhausted ? 'Stack Exchange quota exhausted' : 'Stack Exchange requested backoff',
        retryAfterMs,
        result.retryAtMs,
      );
    }
    throw new Error('Stack Exchange response has no items');
  }
  const items = uniqueItems(raw.items.flatMap((value, index): CollectedTrendingItem[] => {
    if (!isRecord(value)) return [];
    const id = positiveInteger(value.question_id);
    const title = cleanExternalTitle(value.title);
    const originalUrl = safeSourceUrl(value.link, ['stackoverflow.com']);
    if (id === null || !title || !originalUrl) return [];
    const score = integer(value.score);
    return [{
      sourceItemId: String(id),
      sourceRank: index + 1,
      title,
      originalUrl,
      heatText: score === null ? null : `${score} 票`,
      publishedAt: unixDate(value.creation_date),
    }];
  })).slice(0, MAX_ITEMS_PER_BOARD);
  if (items.length === 0 && (retryAfterMs !== null || result.retryAtMs !== null)) {
    throw new UpstreamRetryError(
      quotaExhausted ? 'Stack Exchange quota exhausted' : 'Stack Exchange requested backoff',
      retryAfterMs,
      result.retryAtMs,
    );
  }
  return { items, retryAfterMs, retryAtMs: result.retryAtMs };
}

export async function fetchGitHubRising(
  serviceDate: string,
  fetcher: typeof fetch = globalThis.fetch,
): Promise<CollectedTrendingItem[]> {
  return (await collectGitHubRising(serviceDate, fetcher)).items;
}

async function collectGitHubRising(
  serviceDate: string,
  fetcher: typeof fetch,
): Promise<CollectedBoardSnapshot> {
  const start = new Date(`${serviceDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) throw new Error('invalid GitHub snapshot date');
  start.setUTCDate(start.getUTCDate() - 7);
  const query = `created:>=${start.toISOString().slice(0, 10)} stars:>=10 archived:false fork:false`;
  const url = new URL('https://api.github.com/search/repositories');
  url.searchParams.set('q', query);
  url.searchParams.set('sort', 'stars');
  url.searchParams.set('order', 'desc');
  url.searchParams.set('per_page', String(MAX_ITEMS_PER_BOARD));
  const result = await fetchOfficialJson(url.toString(), ['api.github.com'], {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }, fetcher);
  const raw = result.body;
  if (!isRecord(raw) || !Array.isArray(raw.items)) throw new Error('GitHub response has no items');
  if (raw.incomplete_results === true) {
    throw new UpstreamRetryError(
      'GitHub returned incomplete search results',
      result.retryAfterMs,
      result.retryAtMs,
    );
  }
  const items = uniqueItems(raw.items.flatMap((value, index): CollectedTrendingItem[] => {
    if (!isRecord(value)) return [];
    const id = positiveInteger(value.id);
    const title = cleanExternalTitle(value.full_name);
    const originalUrl = safeSourceUrl(value.html_url, ['github.com']);
    if (id === null || !title || !originalUrl) return [];
    const stars = positiveInteger(value.stargazers_count);
    return [{
      sourceItemId: String(id),
      sourceRank: index + 1,
      title,
      originalUrl,
      heatText: stars === null ? null : `★ ${stars.toLocaleString('en-US')}`,
      publishedAt: isoDate(value.created_at),
    }];
  })).slice(0, MAX_ITEMS_PER_BOARD);
  return {
    items,
    retryAfterMs: result.retryAfterMs ?? (
      result.quotaRemaining === 0 && result.retryAtMs === null
        ? 60 * 60 * 1_000
        : null
    ),
    retryAtMs: result.quotaRemaining === 0 ? result.retryAtMs : null,
  };
}

/** Metadata only, from one fixed public host. Unknown/blocked pages fail closed. */
export async function fetchBaiduTrending(fetcher: typeof fetch = globalThis.fetch): Promise<CollectedTrendingItem[]> {
  const response = await fetcher('https://top.baidu.com/board?tab=realtime', {
    headers: { Accept: 'text/html', 'User-Agent': 'MomoCompany-Trending/1.0 (+https://zbrshyyzxx.top)' },
    redirect: 'manual', signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    const retry = retryDirective(response);
    throw new UpstreamRetryError(`public board returned HTTP ${response.status}`, retry.retryAfterMs, retry.retryAtMs);
  }
  if (!/^text\/html(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error('public board response was not HTML');
  }
  const html = await readLimitedText(response, MAX_JSON_BYTES);
  const embedded = html.match(/<!--s-data:([\s\S]*?)-->/)?.[1];
  if (!embedded) throw new Error('public board has no supported embedded data');
  const raw: unknown = JSON.parse(embedded);
  if (!isRecord(raw) || !isRecord(raw.data) || !Array.isArray(raw.data.cards)) throw new Error('public board structure changed');
  const items = raw.data.cards.flatMap((card): CollectedTrendingItem[] => {
    if (!isRecord(card) || !Array.isArray(card.content)) return [];
    return card.content.flatMap((value): CollectedTrendingItem[] => {
      if (!isRecord(value) || value.isTop === true) return []; // pinned editorial item is not a ranked trend
      const rankIndex = positiveInteger(value.index);
      const title = cleanExternalTitle(value.word);
      const originalUrl = safeSourceUrl(value.rawUrl ?? value.url, ['www.baidu.com']);
      if (rankIndex === null || rankIndex >= 20 || !title || !originalUrl || new URL(originalUrl).pathname !== '/s') return [];
      const score = typeof value.hotScore === 'string' && /^\d{1,16}$/.test(value.hotScore) ? value.hotScore : null;
      return [{ sourceItemId: createHash('sha256').update(title).digest('hex'), sourceRank: rankIndex + 1, title, originalUrl,
        heatText: score === null ? null : `${score} 热度`, publishedAt: null }];
    });
  });
  const result = uniqueItems(items).sort((a, b) => a.sourceRank - b.sourceRank).slice(0, MAX_ITEMS_PER_BOARD);
  if (!result.length) throw new Error('public board has no valid ranked items');
  return result;
}

export async function fetchBilibiliTrending(fetcher: typeof fetch = globalThis.fetch): Promise<CollectedTrendingItem[]> {
  return (await collectBilibili(fetcher)).items;
}

async function collectBilibili(fetcher: typeof fetch): Promise<CollectedBoardSnapshot> {
  const result = await fetchOfficialJson(
    'https://api.bilibili.com/x/web-interface/ranking/v2?rid=0&type=all',
    ['api.bilibili.com'], {}, fetcher,
  );
  const raw = result.body;
  if (!isRecord(raw) || raw.code !== 0 || !isRecord(raw.data) || !Array.isArray(raw.data.list)) {
    // HTTP 200 can still carry a platform denial (-352/-412). Never solve a
    // challenge, obtain guest cookies, or retry against another identity.
    throw new UpstreamRetryError('Bilibili public ranking unavailable', Math.max(result.retryAfterMs ?? 0, 60 * 60_000), result.retryAtMs);
  }
  const items = uniqueItems(raw.data.list.slice(0, 20).flatMap((value, index): CollectedTrendingItem[] => {
    if (!isRecord(value) || typeof value.bvid !== 'string' || !/^BV[A-Za-z0-9]{10}$/.test(value.bvid)) return [];
    const title = cleanExternalTitle(value.title);
    if (!title) return [];
    const views = isRecord(value.stat) ? positiveInteger(value.stat.view) : null;
    return [{ sourceItemId: value.bvid, sourceRank: index + 1, title,
      originalUrl: `https://www.bilibili.com/video/${value.bvid}/`,
      heatText: views === null ? null : `${views.toLocaleString('zh-CN')} 次播放`, publishedAt: unixDate(value.pubdate) }];
  })).slice(0, MAX_ITEMS_PER_BOARD);
  if (!items.length) throw new Error('Bilibili ranking has no valid items');
  return { items, retryAfterMs: result.retryAfterMs, retryAtMs: result.retryAtMs };
}

export async function fetchDoubanChart(fetcher: typeof fetch = globalThis.fetch): Promise<CollectedTrendingItem[]> {
  return (await collectDouban(fetcher)).items;
}

async function collectDouban(fetcher: typeof fetch): Promise<CollectedBoardSnapshot> {
  const response = await fetcher('https://movie.douban.com/chart', {
    headers: { Accept: 'text/html', 'User-Agent': 'MomoCompany-Trending/1.0 (+https://zbrshyyzxx.top)' },
    redirect: 'manual', signal: AbortSignal.timeout(8_000),
  });
  const retry = retryDirective(response);
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new UpstreamRetryError(`Douban public chart returned HTTP ${response.status}`, retry.retryAfterMs, retry.retryAtMs);
  }
  if (!/^text\/html(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error('Douban public chart was not HTML');
  }
  const html = await readLimitedText(response, MAX_JSON_BYTES);
  // Remove inert scripts/comments before finding the one explicitly named
  // section. Do not evaluate scripts or collect adjacent, differently ranked lists.
  const document = html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  const heading = /<h2\b[^>]*>\s*豆瓣新片榜[^<]*<\/h2\s*>/i.exec(document);
  if (!heading) throw new Error('Douban new-release chart section missing');
  const afterHeading = document.slice(heading.index + heading[0].length);
  const section = afterHeading.split(/<h2\b|<div\s+class=["']aside["']/i, 1)[0];
  const rows = [...section.matchAll(/<tr\b[^>]*class=["']item["'][^>]*>([\s\S]*?)<\/tr\s*>/gi)].slice(0, 20);
  const items = uniqueItems(rows.flatMap((row, index): CollectedTrendingItem[] => {
    const anchor = row[1].match(/<a\b[^>]*class=["']nbg["'][^>]*>/i)?.[0];
    if (!anchor) return [];
    const href = anchor.match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2];
    const title = cleanExternalTitle(anchor.match(/\btitle\s*=\s*(["'])(.*?)\1/i)?.[2]);
    const originalUrl = safeSourceUrl(href, ['movie.douban.com']);
    if (!title || !originalUrl || new URL(originalUrl).hostname !== 'movie.douban.com') return [];
    const subject = /^\/subject\/(\d{1,18})\/$/.exec(new URL(originalUrl).pathname);
    if (!subject || new URL(originalUrl).search) return [];
    const rating = row[1].match(/<span\b[^>]*class=["']rating_nums["'][^>]*>\s*(\d(?:\.\d)?|10(?:\.0)?)\s*<\/span>/i)?.[1];
    return [{ sourceItemId: subject[1], sourceRank: index + 1, title, originalUrl,
      heatText: rating ? `${rating} 分（豆瓣）` : null, publishedAt: null }];
  })).slice(0, MAX_ITEMS_PER_BOARD);
  if (!items.length) throw new Error('Douban chart has no valid items');
  return { items, retryAfterMs: retry.retryAfterMs, retryAtMs: retry.retryAtMs };
}

async function fetchOfficialJson(
  rawUrl: string,
  allowedDomains: readonly string[],
  headers: Record<string, string> = {},
  fetcher: typeof fetch = globalThis.fetch,
): Promise<OfficialJsonResult> {
  const url = safeOfficialApiUrl(rawUrl, allowedDomains);
  if (!url) throw new Error('official API URL was rejected');
  const response = await fetcher(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'MomoCompany-Trending/1.0 (+https://zbrshyyzxx.top)',
      ...headers,
    },
    redirect: 'manual',
    signal: AbortSignal.timeout(8_000),
  });
  const retry = retryDirective(response);
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new UpstreamRetryError(
      `official API returned HTTP ${response.status}`,
      retry.retryAfterMs,
      retry.retryAtMs,
    );
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (!/^application\/(?:[\w.+-]*\+)?json(?:\s*;|$)/i.test(contentType)) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error('official API response was not JSON');
  }
  return {
    body: JSON.parse(await readLimitedText(response, MAX_JSON_BYTES)) as unknown,
    ...retry,
    quotaRemaining: headerInteger(response.headers.get('x-ratelimit-remaining')),
  };
}

async function readLimitedText(response: Response, maxBytes: number): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error('official API response was too large');
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let output = '';
  let completed = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) throw new Error('official API response was too large');
      output += decoder.decode(value, { stream: true });
    }
    completed = true;
    return output + decoder.decode();
  } finally {
    if (!completed) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function cleanExternalTitle(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const title = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (_, hex: string | undefined, decimal: string | undefined) => {
      const point = Number.parseInt(hex ?? decimal ?? '', hex ? 16 : 10);
      return Number.isInteger(point) && point >= 0 && point <= 0x10ffff &&
        !(point >= 0xd800 && point <= 0xdfff)
        ? String.fromCodePoint(point)
        : ' ';
    })
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!title || title.length > 300) return null;
  return title;
}

function safeSourceUrl(value: unknown, allowedDomains: readonly string[]): string | null {
  if (typeof value !== 'string') return null;
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLocaleLowerCase('en-US');
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) return null;
    if (!allowedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) return null;
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

function safeOfficialApiUrl(value: unknown, allowedDomains: readonly string[]): string | null {
  if (typeof value !== 'string') return null;
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLocaleLowerCase('en-US');
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) return null;
    if (!allowedDomains.some((domain) => hostname === domain)) return null;
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

function mapRecord(record: TrendingNewsItemRecord): TrendingNewsItem {
  return {
    id: record.id,
    rank: record.rank,
    title: record.title,
    url: record.originalUrl,
    heatText: record.heatText,
    publishedAt: record.publishedAt?.toISOString() ?? null,
  };
}

function uniqueItems(items: readonly CollectedTrendingItem[]): CollectedTrendingItem[] {
  const ids = new Set<string>();
  const titles = new Set<string>();
  return items.filter((item) => {
    const normalizedTitle = item.title.replace(/\s+/g, '').toLocaleLowerCase('en-US');
    if (ids.has(item.sourceItemId) || titles.has(normalizedTitle)) return false;
    ids.add(item.sourceItemId);
    titles.add(normalizedTitle);
    return true;
  });
}

function isCollectedItem(value: CollectedTrendingItem | null): value is CollectedTrendingItem {
  return value !== null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function integer(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : null;
}

function positiveInteger(value: unknown): number | null {
  const result = integer(value);
  return result !== null && result >= 0 ? result : null;
}

function unixDate(value: unknown): Date | null {
  const seconds = positiveInteger(value);
  if (seconds === null) return null;
  const date = new Date(seconds * 1_000);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function ownsLease(run: TrendingNewsBoardRun, claim: RefreshClaim): boolean {
  return run.status === 'running' &&
    run.lastError === `lease:${claim.token}` &&
    run.startedAt.getTime() === claim.startedAt.getTime();
}

function isUniqueViolation(error: unknown): boolean {
  return isRecord(error) && error.code === '23505';
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 200);
}

function retryDirective(response: Response): {
  retryAfterMs: number | null;
  retryAtMs: number | null;
} {
  const rawRetryAfter = response.headers.get('retry-after');
  let retryAfterMs: number | null = null;
  let retryAtMs: number | null = null;
  if (rawRetryAfter) {
    const seconds = Number(rawRetryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      retryAfterMs = Math.min(seconds * 1_000, MAX_UPSTREAM_BACKOFF_MS);
    } else {
      const date = new Date(rawRetryAfter).getTime();
      if (Number.isFinite(date)) retryAtMs = date;
    }
  }
  const githubResetSeconds = Number(response.headers.get('x-ratelimit-reset'));
  if (Number.isFinite(githubResetSeconds) && githubResetSeconds > 0) {
    retryAtMs = Math.max(retryAtMs ?? 0, githubResetSeconds * 1_000);
  }
  return { retryAfterMs, retryAtMs };
}

function mergeRetryDirectives(
  directives: readonly Pick<OfficialJsonResult, 'retryAfterMs' | 'retryAtMs'>[],
): Pick<OfficialJsonResult, 'retryAfterMs' | 'retryAtMs'> {
  let retryAfterMs: number | null = null;
  let retryAtMs: number | null = null;
  for (const directive of directives) {
    if (directive.retryAfterMs !== null) {
      retryAfterMs = Math.max(retryAfterMs ?? 0, directive.retryAfterMs);
    }
    if (directive.retryAtMs !== null) {
      retryAtMs = Math.max(retryAtMs ?? 0, directive.retryAtMs);
    }
  }
  return { retryAfterMs, retryAtMs };
}

function headerInteger(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function directiveRetryNotBefore(
  directive: Pick<OfficialJsonResult, 'retryAfterMs' | 'retryAtMs'>,
  now: Date,
): Date | null {
  if (directive.retryAfterMs === null && directive.retryAtMs === null) return null;
  return new Date(cappedRetryTimestamp(now, 0, directive.retryAfterMs, directive.retryAtMs));
}

function retryNotBefore(error: unknown, now: Date): Date {
  return new Date(cappedRetryTimestamp(
    now,
    FAILED_RETRY_MS,
    error instanceof UpstreamRetryError ? error.retryAfterMs : null,
    error instanceof UpstreamRetryError ? error.retryAtMs : null,
  ));
}

function cappedRetryTimestamp(
  now: Date,
  minimumDelayMs: number,
  retryAfterMs: number | null,
  retryAtMs: number | null,
): number {
  const maximum = now.getTime() + MAX_UPSTREAM_BACKOFF_MS;
  return Math.min(maximum, Math.max(
    now.getTime() + minimumDelayMs,
    retryAfterMs === null ? 0 : now.getTime() + retryAfterMs,
    retryAtMs ?? 0,
  ));
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  transform: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await transform(items[index]);
    }
  }
  await Promise.all(Array.from(
    { length: Math.min(items.length, Math.max(1, concurrency)) },
    () => worker(),
  ));
  return results;
}

async function mapWithConcurrencyFailFast<T, R>(
  items: readonly T[],
  concurrency: number,
  transform: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  let stopped = false;
  async function worker(): Promise<void> {
    while (!stopped && nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = await transform(items[index]);
      } catch (error) {
        stopped = true;
        throw error;
      }
    }
  }
  await Promise.all(Array.from(
    { length: Math.min(items.length, Math.max(1, concurrency)) },
    () => worker(),
  ));
  return results;
}
