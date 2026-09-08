import { createHash, randomUUID } from 'node:crypto';

import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';

import {
  HotNewsHeadline,
  HotNewsRefreshRun,
} from '../../../database/entities';

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1_000;
const REFRESH_HOUR = 8;
const REFRESH_INTERVAL_MS = 5 * 60 * 1_000;
const REFRESH_LEASE_MS = 10 * 60 * 1_000;
const MAX_FEED_BYTES = 2_000_000;
const MAX_HEADLINES_PER_CATEGORY = 8;
const MAX_DAILY_HEADLINES = 60;
const FEED_FETCH_CONCURRENCY = 3;

export const HOT_NEWS_CATEGORIES = [
  { id: 'general', label: '综合' },
  { id: 'domestic', label: '国内' },
  { id: 'world', label: '国际' },
  { id: 'society', label: '社会' },
  { id: 'finance', label: '财经' },
  { id: 'culture', label: '文娱' },
  { id: 'sports', label: '体育' },
] as const;

export type HotNewsCategoryId = (typeof HOT_NEWS_CATEGORIES)[number]['id'];

const CATEGORY_SELECTION_ORDER: readonly HotNewsCategoryId[] = [
  'domestic',
  'world',
  'society',
  'finance',
  'culture',
  'sports',
  'general',
];

interface HotNewsFeed {
  key: string;
  name: string;
  category: HotNewsCategoryId;
  url: string;
  allowedDomains: readonly string[];
}

interface ParsedHeadline {
  headline: string;
  originalUrl: string;
  originalPublishedAt: Date;
}

type CollectedHeadline = ParsedHeadline & Pick<
  HotNewsFeed,
  'key' | 'name' | 'category'
>;

interface RefreshClaim {
  token: string;
  startedAt: Date;
  preserveCompletedOnFailure: boolean;
  previousItemCount: number;
  previousCompletedAt: Date | null;
}

/**
 * All feeds below are published in China News Service's official RSS directory:
 * https://www.chinanews.com.cn/rss/index.shtml
 *
 * Specific sections are selected before the general feed so a duplicated title
 * keeps its more useful category. Source keys are versioned so a completed
 * legacy snapshot can be upgraded once after deployment without a migration.
 */
const DEFAULT_FEEDS: readonly HotNewsFeed[] = [
  {
    key: 'chinanews-v2-domestic',
    name: '中国新闻网',
    category: 'domestic',
    url: 'https://www.chinanews.com.cn/rss/china.xml',
    allowedDomains: ['chinanews.com.cn'],
  },
  {
    key: 'chinanews-v2-world',
    name: '中国新闻网',
    category: 'world',
    url: 'https://www.chinanews.com.cn/rss/world.xml',
    allowedDomains: ['chinanews.com.cn'],
  },
  {
    key: 'chinanews-v2-society',
    name: '中国新闻网',
    category: 'society',
    url: 'https://www.chinanews.com.cn/rss/society.xml',
    allowedDomains: ['chinanews.com.cn'],
  },
  {
    key: 'chinanews-v2-finance',
    name: '中国新闻网',
    category: 'finance',
    url: 'https://www.chinanews.com.cn/rss/finance.xml',
    allowedDomains: ['chinanews.com.cn'],
  },
  {
    key: 'chinanews-v2-culture',
    name: '中国新闻网',
    category: 'culture',
    url: 'https://www.chinanews.com.cn/rss/culture.xml',
    allowedDomains: ['chinanews.com.cn'],
  },
  {
    key: 'chinanews-v2-sports',
    name: '中国新闻网',
    category: 'sports',
    url: 'https://www.chinanews.com.cn/rss/sports.xml',
    allowedDomains: ['chinanews.com.cn'],
  },
  {
    key: 'chinanews-v2-general',
    name: '中国新闻网',
    category: 'general',
    url: 'https://www.chinanews.com.cn/rss/importnews.xml',
    allowedDomains: ['chinanews.com.cn'],
  },
] as const;

const CURRENT_SOURCE_KEYS = DEFAULT_FEEDS.map((feed) => feed.key);
const CATEGORY_BY_SOURCE_KEY = new Map<string, HotNewsCategoryId>([
  ...DEFAULT_FEEDS.map((feed) => [feed.key, feed.category] as const),
  ['chinanews-important', 'general'],
  ['chinanews-scroll', 'general'],
  ['xinhua-politics', 'domestic'],
]);

export function shanghaiServiceDate(now: Date): string {
  return new Date(now.getTime() + SHANGHAI_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

export function isDailyHotNewsDue(now: Date): boolean {
  return new Date(now.getTime() + SHANGHAI_OFFSET_MS).getUTCHours() >= REFRESH_HOUR;
}

export function nextDailyHotNewsRefresh(now: Date): Date {
  const local = new Date(now.getTime() + SHANGHAI_OFFSET_MS);
  const nextLocal = new Date(local);
  nextLocal.setUTCHours(REFRESH_HOUR, 0, 0, 0);
  if (nextLocal.getTime() <= local.getTime()) {
    nextLocal.setUTCDate(nextLocal.getUTCDate() + 1);
  }
  return new Date(nextLocal.getTime() - SHANGHAI_OFFSET_MS);
}

export function parseHotNewsRss(
  xml: string,
  allowedDomains: readonly string[],
): ParsedHeadline[] {
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
  return blocks.flatMap((block) => {
    const title = cleanXmlText(xmlTag(block, 'title'));
    const rawLink = cleanXmlText(xmlTag(block, 'link'));
    if (!title || title.length > 300 || !rawLink) return [];
    const originalUrl = safePublisherUrl(rawLink, allowedDomains);
    if (!originalUrl) return [];
    const published = cleanXmlText(xmlTag(block, 'pubDate'));
    const parsedDate = published ? new Date(published) : null;
    if (!parsedDate || Number.isNaN(parsedDate.getTime())) return [];
    return [{
      headline: title,
      originalUrl,
      originalPublishedAt: parsedDate,
    }];
  });
}

@Injectable()
export class HotNewsService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(HotNewsService.name);
  private timer?: ReturnType<typeof setInterval>;
  private tickRunning = false;

  constructor(private readonly dataSource: DataSource) {}

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

  async listDaily(now = new Date()) {
    const runRepo = this.dataSource.getRepository(HotNewsRefreshRun);
    const headlineRepo = this.dataSource.getRepository(HotNewsHeadline);
    const candidates = await runRepo.find({
      order: { serviceDate: 'DESC' },
      take: 4,
    });
    let run: HotNewsRefreshRun | null = null;
    let items: HotNewsHeadline[] = [];
    for (const candidate of candidates) {
      // An in-place category upgrade keeps its previous completedAt. Continue
      // serving those rows while the replacement is fetched outside the swap.
      if (candidate.status !== 'completed' && candidate.completedAt === null) continue;
      const candidateItems = await headlineRepo.find({
        where: { serviceDate: candidate.serviceDate },
        order: { rank: 'ASC' },
      });
      if (candidateItems.length === 0) continue;
      run = candidate;
      items = candidateItems;
      break;
    }
    const freshnessCutoff = now.getTime() - 72 * 60 * 60 * 1_000;
    const visibleItems = items
      .filter((item): item is HotNewsHeadline & { originalPublishedAt: Date } =>
        item.originalPublishedAt !== null &&
        item.originalPublishedAt.getTime() >= freshnessCutoff,
      )
      .map((item) => ({
        id: item.id,
        headline: item.headline,
        source: item.sourceName,
        category: categoryForSourceKey(item.sourceKey),
        originalUrl: item.originalUrl,
        originalPublishedAt: item.originalPublishedAt.toISOString(),
      }));
    return {
      serviceDate: run?.serviceDate ?? null,
      updatedAt: run?.completedAt?.toISOString() ?? null,
      nextUpdateAt: nextDailyHotNewsRefresh(now).toISOString(),
      schedule: '每天 08:00（北京时间）',
      categories: HOT_NEWS_CATEGORIES.map((category) => ({
        ...category,
        count: visibleItems.filter((item) => item.category === category.id).length,
      })),
      items: visibleItems,
    };
  }

  /** Public for deterministic operational tests; normal callers use the timer. */
  async refresh(now = new Date()): Promise<{ refreshed: boolean; itemCount: number }> {
    const serviceDate = shanghaiServiceDate(now);
    let claim: RefreshClaim | null;
    try {
      claim = await this.claimRun(serviceDate, now);
    } catch (error) {
      // Another replica can win the first insert for a new service date. The
      // winner owns the refresh; the loser must not surface an unhandled tick.
      this.logger.warn(`headline refresh claim failed: ${safeError(error)}`);
      const existing = await this.dataSource.getRepository(HotNewsRefreshRun).findOneBy({ serviceDate });
      return { refreshed: false, itemCount: existing?.itemCount ?? 0 };
    }
    if (!claim) {
      const existing = await this.dataSource.getRepository(HotNewsRefreshRun).findOneBy({ serviceDate });
      return { refreshed: false, itemCount: existing?.itemCount ?? 0 };
    }

    try {
      const results = await mapWithConcurrency(
        DEFAULT_FEEDS,
        FEED_FETCH_CONCURRENCY,
        async (feed): Promise<CollectedHeadline[]> => {
          try {
            const response = await fetch(feed.url, {
              headers: { 'User-Agent': 'MomoCompany-HotNews/1.0 (+https://zbrshyyzxx.top)' },
              redirect: 'manual',
              signal: AbortSignal.timeout(8_000),
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const contentType = response.headers.get('content-type') ?? '';
            if (!/^(?:application|text)\/(?:[\w.+-]*\+)?xml(?:\s*;|$)/i.test(contentType)) {
              throw new Error('feed response is not XML');
            }
            const xml = await readLimitedText(response, MAX_FEED_BYTES);
            return parseHotNewsRss(xml, feed.allowedDomains).map((item) => ({
              ...item,
              key: feed.key,
              name: feed.name,
              category: feed.category,
            }));
          } catch (error) {
            this.logger.warn(`headline feed ${feed.key} failed: ${safeError(error)}`);
            return [];
          }
        },
      );

      const freshnessCutoff = now.getTime() - 72 * 60 * 60 * 1_000;
      const futureCutoff = now.getTime() + 5 * 60 * 1_000;
      const freshResults = results.map((items) =>
        items.filter((item) => {
          const publishedAt = item.originalPublishedAt.getTime();
          return publishedAt >= freshnessCutoff && publishedAt <= futureCutoff;
        }),
      );
      // A daily snapshot is advertised as seven categories. Never replace a
      // complete prior snapshot with a silently partial one; the timer retries.
      if (freshResults.some((items) => items.length === 0)) {
        throw new Error('one or more official headline feeds returned no usable items');
      }
      const deduplicated = selectCategorizedHeadlines(freshResults.flat());
      if (deduplicated.length === 0) throw new Error('all official headline feeds returned no usable items');

      const committed = await this.dataSource.transaction(async (manager) => {
        const runRepo = manager.getRepository(HotNewsRefreshRun);
        const run = await runRepo.findOne({
          where: { serviceDate },
          lock: { mode: 'pessimistic_write' },
        });
        if (!run || !ownsRefreshLease(run, claim)) return false;
        const headlineRepo = manager.getRepository(HotNewsHeadline);
        await headlineRepo.delete({ serviceDate });
        await headlineRepo.save(
          deduplicated.map((item, index) =>
            headlineRepo.create({
              serviceDate,
              sourceKey: item.key,
              sourceName: item.name,
              headline: item.headline,
              originalUrl: item.originalUrl,
              originalPublishedAt: item.originalPublishedAt,
              rank: index + 1,
              fingerprint: createHash('sha256')
                .update(`${serviceDate}\n${item.originalUrl}`)
                .digest('hex'),
            }),
          ),
        );
        run.status = 'completed';
        run.itemCount = deduplicated.length;
        run.lastError = null;
        run.completedAt = new Date();
        await runRepo.save(run);
        return true;
      });
      if (!committed) {
        const existing = await this.dataSource.getRepository(HotNewsRefreshRun).findOneBy({ serviceDate });
        return { refreshed: false, itemCount: existing?.itemCount ?? 0 };
      }
      return { refreshed: true, itemCount: deduplicated.length };
    } catch (error) {
      await this.failRun(serviceDate, claim, error);
      this.logger.error(`daily headline refresh failed: ${safeError(error)}`);
      return {
        refreshed: false,
        itemCount: claim.preserveCompletedOnFailure
          ? claim.previousItemCount
          : 0,
      };
    }
  }

  private async tick(): Promise<void> {
    if (this.tickRunning) return;
    const now = new Date();
    if (!isDailyHotNewsDue(now)) return;
    this.tickRunning = true;
    try {
      await this.refresh(now);
    } catch (error) {
      this.logger.error(`daily headline tick failed: ${safeError(error)}`);
    } finally {
      this.tickRunning = false;
    }
  }

  private async claimRun(
    serviceDate: string,
    now: Date,
  ): Promise<RefreshClaim | null> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(HotNewsRefreshRun);
      const existing = await repo.findOne({
        where: { serviceDate },
        lock: { mode: 'pessimistic_write' },
      });
      const headlineRepo = manager.getRepository(HotNewsHeadline);
      const existingItemCount = existing
        ? await headlineRepo.count({ where: { serviceDate } })
        : 0;
      if (existing?.status === 'completed') {
        const upgraded = await headlineRepo.exist({
          where: { serviceDate, sourceKey: In(CURRENT_SOURCE_KEYS) },
        });
        if (upgraded) return null;
      }
      if (existing?.status === 'running' && existing.leaseExpiresAt > now) return null;
      const run = existing ?? repo.create({ serviceDate });
      const token = randomUUID();
      const claim: RefreshClaim = {
        token,
        startedAt: now,
        preserveCompletedOnFailure: existingItemCount > 0,
        previousItemCount: existingItemCount,
        previousCompletedAt: existing?.completedAt ?? null,
      };
      run.status = 'running';
      run.itemCount = 0;
      run.lastError = `lease:${token}`;
      run.startedAt = now;
      if (!claim.preserveCompletedOnFailure) run.completedAt = null;
      run.leaseExpiresAt = new Date(now.getTime() + REFRESH_LEASE_MS);
      if (existing) {
        // Existing rows are protected by the pessimistic lock acquired above.
        await repo.save(run);
      } else {
        // `save` re-checks an entity with an assigned primary key and may turn
        // a concurrent first insert into an UPDATE. A strict INSERT guarantees
        // that only the unique-key winner can publish a refresh lease.
        await repo.insert(run);
      }
      return claim;
    });
  }

  private async failRun(
    serviceDate: string,
    claim: RefreshClaim,
    error: unknown,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager: EntityManager) => {
      const repo = manager.getRepository(HotNewsRefreshRun);
      const run = await repo.findOne({
        where: { serviceDate },
        lock: { mode: 'pessimistic_write' },
      });
      if (!run || !ownsRefreshLease(run, claim)) return;
      run.status = claim.preserveCompletedOnFailure ? 'completed' : 'failed';
      run.itemCount = claim.previousItemCount;
      run.lastError = safeError(error).slice(0, 200);
      run.completedAt = claim.preserveCompletedOnFailure
        ? claim.previousCompletedAt
        : new Date();
      await repo.save(run);
    });
  }
}

function xmlTag(block: string, tag: string): string {
  return block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1] ?? '';
}

function cleanXmlText(value: string): string {
  return value
    .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/i, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (_, hex: string | undefined, decimal: string | undefined) => {
      const codePoint = Number.parseInt(hex ?? decimal ?? '', hex ? 16 : 10);
      return Number.isInteger(codePoint) &&
        codePoint >= 0 &&
        codePoint <= 0x10ffff &&
        !(codePoint >= 0xd800 && codePoint <= 0xdfff)
        ? String.fromCodePoint(codePoint)
        : ' ';
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function safePublisherUrl(raw: string, allowedDomains: readonly string[]): string | null {
  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return null;
    const hostname = parsed.hostname.toLocaleLowerCase('en-US');
    if (!allowedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) return null;
    parsed.protocol = 'https:';
    parsed.hash = '';
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(utm_|spm|from$)/i.test(key)) parsed.searchParams.delete(key);
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizeHeadline(value: string): string {
  return value.replace(/[\s，。！？、：“”‘’]+/g, '').toLocaleLowerCase('zh-CN');
}

function categoryForSourceKey(sourceKey: string): HotNewsCategoryId {
  return CATEGORY_BY_SOURCE_KEY.get(sourceKey) ?? 'general';
}

function selectCategorizedHeadlines(
  collected: readonly CollectedHeadline[],
): CollectedHeadline[] {
  const selected = new Map<HotNewsCategoryId, CollectedHeadline[]>();
  const seenHeadlines = new Set<string>();
  const seenUrls = new Set<string>();
  for (const category of CATEGORY_SELECTION_ORDER) {
    const categoryItems = collected
      .filter((item) => item.category === category)
      .sort((left, right) =>
        right.originalPublishedAt.getTime() - left.originalPublishedAt.getTime() ||
        left.originalUrl.localeCompare(right.originalUrl),
      );
    const page: CollectedHeadline[] = [];
    for (const item of categoryItems) {
      const normalized = normalizeHeadline(item.headline);
      if (seenHeadlines.has(normalized) || seenUrls.has(item.originalUrl)) continue;
      seenHeadlines.add(normalized);
      seenUrls.add(item.originalUrl);
      page.push(item);
      if (page.length === MAX_HEADLINES_PER_CATEGORY) break;
    }
    selected.set(category, page);
  }
  return HOT_NEWS_CATEGORIES
    .flatMap((category) => selected.get(category.id) ?? [])
    .slice(0, MAX_DAILY_HEADLINES);
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
  await Promise.all(
    Array.from(
      { length: Math.min(items.length, Math.max(1, concurrency)) },
      () => worker(),
    ),
  );
  return results;
}

async function readLimitedText(response: Response, maxBytes: number): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error('feed response is too large');
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let result = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        throw new Error('feed response is too large');
      }
      result += decoder.decode(value, { stream: true });
    }
    return result + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

function ownsRefreshLease(run: HotNewsRefreshRun, claim: RefreshClaim): boolean {
  return run.status === 'running' &&
    run.startedAt.getTime() === claim.startedAt.getTime() &&
    run.lastError === `lease:${claim.token}`;
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
