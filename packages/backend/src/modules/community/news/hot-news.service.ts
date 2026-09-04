import { createHash } from 'node:crypto';

import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import {
  HotNewsHeadline,
  HotNewsRefreshRun,
} from '../../../database/entities';

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1_000;
const REFRESH_HOUR = 8;
const REFRESH_INTERVAL_MS = 5 * 60 * 1_000;
const REFRESH_LEASE_MS = 10 * 60 * 1_000;
const MAX_DAILY_HEADLINES = 18;

interface HotNewsFeed {
  key: string;
  name: string;
  url: string;
  allowedDomains: readonly string[];
}

interface ParsedHeadline {
  headline: string;
  originalUrl: string;
  originalPublishedAt: Date;
}

const DEFAULT_FEEDS: readonly HotNewsFeed[] = [
  {
    key: 'xinhua-politics',
    name: '新华网',
    url: 'http://www.xinhuanet.com/politics/news_politics.xml',
    allowedDomains: ['xinhuanet.com', 'news.cn'],
  },
  {
    key: 'chinanews-important',
    name: '中国新闻网',
    url: 'https://www.chinanews.com.cn/rss/importnews.xml',
    allowedDomains: ['chinanews.com.cn'],
  },
  {
    key: 'chinanews-scroll',
    name: '中国新闻网',
    url: 'https://www.chinanews.com.cn/rss/scroll-news.xml',
    allowedDomains: ['chinanews.com.cn'],
  },
] as const;

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
    const run = await this.dataSource.getRepository(HotNewsRefreshRun).findOne({
      where: { status: 'completed' },
      order: { serviceDate: 'DESC' },
    });
    const items = run
      ? await this.dataSource.getRepository(HotNewsHeadline).find({
          where: { serviceDate: run.serviceDate },
          order: { rank: 'ASC' },
        })
      : [];
    const freshnessCutoff = now.getTime() - 72 * 60 * 60 * 1_000;
    return {
      serviceDate: run?.serviceDate ?? null,
      updatedAt: run?.completedAt?.toISOString() ?? null,
      nextUpdateAt: nextDailyHotNewsRefresh(now).toISOString(),
      schedule: '每天 08:00（北京时间）',
      items: items
        .filter((item): item is HotNewsHeadline & { originalPublishedAt: Date } =>
          item.originalPublishedAt !== null &&
          item.originalPublishedAt.getTime() >= freshnessCutoff,
        )
        .map((item) => ({
          id: item.id,
          headline: item.headline,
          source: item.sourceName,
          originalUrl: item.originalUrl,
          originalPublishedAt: item.originalPublishedAt.toISOString(),
        })),
    };
  }

  /** Public for deterministic operational tests; normal callers use the timer. */
  async refresh(now = new Date()): Promise<{ refreshed: boolean; itemCount: number }> {
    const serviceDate = shanghaiServiceDate(now);
    if (!(await this.claimRun(serviceDate, now))) {
      const existing = await this.dataSource.getRepository(HotNewsRefreshRun).findOneBy({ serviceDate });
      return { refreshed: false, itemCount: existing?.itemCount ?? 0 };
    }

    try {
      const collected: Array<ParsedHeadline & Pick<HotNewsFeed, 'key' | 'name'>> = [];
      for (const feed of DEFAULT_FEEDS) {
        try {
          const response = await fetch(feed.url, {
            headers: { 'User-Agent': 'MomoCompany-HotNews/1.0 (+https://zbrshyyzxx.top)' },
            signal: AbortSignal.timeout(8_000),
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const xml = await response.text();
          collected.push(
            ...parseHotNewsRss(xml.slice(0, 2_000_000), feed.allowedDomains)
              .slice(0, 8)
              .map((item) => ({ ...item, key: feed.key, name: feed.name })),
          );
        } catch (error) {
          this.logger.warn(`headline feed ${feed.key} failed: ${safeError(error)}`);
        }
      }

      const freshnessCutoff = now.getTime() - 72 * 60 * 60 * 1_000;
      const deduplicated = [...new Map(
        collected
          .filter((item) => item.originalPublishedAt.getTime() >= freshnessCutoff)
          .map((item) => [normalizeHeadline(item.headline), item]),
      ).values()]
        .sort((left, right) =>
          right.originalPublishedAt.getTime() - left.originalPublishedAt.getTime(),
        )
        .slice(0, MAX_DAILY_HEADLINES);
      if (deduplicated.length === 0) throw new Error('all official headline feeds returned no usable items');

      await this.dataSource.transaction(async (manager) => {
        await manager.getRepository(HotNewsHeadline).delete({ serviceDate });
        await manager.getRepository(HotNewsHeadline).save(
          deduplicated.map((item, index) =>
            manager.getRepository(HotNewsHeadline).create({
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
        const run = await manager.getRepository(HotNewsRefreshRun).findOneByOrFail({ serviceDate });
        run.status = 'completed';
        run.itemCount = deduplicated.length;
        run.lastError = null;
        run.completedAt = new Date();
        await manager.getRepository(HotNewsRefreshRun).save(run);
      });
      return { refreshed: true, itemCount: deduplicated.length };
    } catch (error) {
      await this.failRun(serviceDate, error);
      this.logger.error(`daily headline refresh failed: ${safeError(error)}`);
      return { refreshed: false, itemCount: 0 };
    }
  }

  private async tick(): Promise<void> {
    if (this.tickRunning) return;
    const now = new Date();
    if (!isDailyHotNewsDue(now)) return;
    this.tickRunning = true;
    try {
      await this.refresh(now);
    } finally {
      this.tickRunning = false;
    }
  }

  private async claimRun(serviceDate: string, now: Date): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(HotNewsRefreshRun);
      const existing = await repo.findOne({
        where: { serviceDate },
        lock: { mode: 'pessimistic_write' },
      });
      if (existing?.status === 'completed') return false;
      if (existing?.status === 'running' && existing.leaseExpiresAt > now) return false;
      const run = existing ?? repo.create({ serviceDate });
      run.status = 'running';
      run.itemCount = 0;
      run.lastError = null;
      run.startedAt = now;
      run.completedAt = null;
      run.leaseExpiresAt = new Date(now.getTime() + REFRESH_LEASE_MS);
      await repo.save(run);
      return true;
    });
  }

  private async failRun(serviceDate: string, error: unknown): Promise<void> {
    await this.dataSource.transaction(async (manager: EntityManager) => {
      const repo = manager.getRepository(HotNewsRefreshRun);
      const run = await repo.findOneBy({ serviceDate });
      if (!run) return;
      run.status = 'failed';
      run.lastError = safeError(error).slice(0, 200);
      run.completedAt = new Date();
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
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
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

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
