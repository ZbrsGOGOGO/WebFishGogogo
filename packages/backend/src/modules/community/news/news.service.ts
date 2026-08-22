import { createHash, randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DataSource,
  EntityManager,
  In,
  IsNull,
  Not,
  SelectQueryBuilder,
} from 'typeorm';

import {
  AdminAuditLog,
  CommunityCommandReceipt,
  NewsArticle,
  NewsArticleRevision,
  NewsNegativeFeedback,
  NewsReviewDecision,
  NewsSource,
  NewsUserPreference,
  OfficeBattleProfile,
  PlayerProfile,
  User,
} from '../../../database/entities';
import type { NewsArticleStatus } from '../../../database/entities/news-article.entity';
import type { NewsNegativeFeedbackReason } from '../../../database/entities/news-personalization.entity';
import { COMMUNITY_CLOCK, CommunityClock } from '../community-clock';
import {
  NEWS_PROFESSION_TAGS,
  NewsRevisionInput,
  NewsSourceInput,
  newsContentHash,
} from './news-validation';

const PUBLIC_PAGE_SIZE = 20;
const ADMIN_PAGE_SIZE = 30;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface RankedPublicNewsRow {
  article: NewsArticle;
  revision: NewsArticleRevision;
  source: NewsSource;
  score: number;
}

export interface NewsPublicListFilters {
  feed: 'latest' | 'for_you';
  profession?: string;
  topic?: string;
  cursor?: string;
}

export interface PublicNewsItemView {
  id: string;
  status: 'published';
  summary: string;
  source: { name: string };
  originalPublishedAt: string;
  originalUrl: string;
  publishedAt: string;
  lastCorrectedAt: string | null;
  correctionNote: string | null;
  discussion: { commentsEnabled: false; createPostPath: string };
}

export interface PublicNewsUnavailableView {
  id: string;
  status: 'withdrawn' | 'unavailable';
  notice: string;
  withdrawnAt: string | null;
}

export interface AdminNewsSourceView {
  id: string;
  name: string;
  sourceType: string;
  homepageUrl: string;
  trustRank: number;
  authorizationStatus: string;
  authorizationEvidenceRef: string;
  authorizationValidFrom: string | null;
  authorizationValidUntil: string | null;
  authorizationRevokedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminNewsArticleView {
  id: string;
  status: NewsArticleStatus;
  version: number;
  source: Omit<AdminNewsSourceView, 'authorizationEvidenceRef'>;
  currentRevision: Record<string, unknown>;
  publishedRevision: Record<string, unknown> | null;
  pendingRevision: Record<string, unknown> | null;
  submittedBy: string | null;
  submittedAt: string | null;
  reviewedBy: string | null;
  publishedAt: string | null;
  lastCorrectedAt: string | null;
  withdrawnAt: string | null;
  withdrawalNotice: string | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class NewsService {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(COMMUNITY_CLOCK) private readonly clock: CommunityClock,
  ) {}

  async listPublic(viewerId: string | null, filters: NewsPublicListFilters) {
    const manager = this.dataSource.manager;
    const now = this.clock.now();
    if (
      filters.feed === 'latest' &&
      !filters.profession &&
      !filters.topic
    ) {
      if (this.usesPortableNewsRankingFallback()) {
        return this.portableLatestPublicPage(manager, now, filters.cursor);
      }
      return this.latestPublicPage(manager, now, filters.cursor);
    }

    let preference: NewsUserPreference | null = null;
    let negative = new Set<string>();
    let selectedProfession: string | null = null;
    if (filters.feed === 'for_you') {
      if (!viewerId) throw new ForbiddenException({ code: 'NEWS_PERSONALIZATION_LOGIN_REQUIRED' });
      preference = await manager.getRepository(NewsUserPreference).findOne({ where: { userId: viewerId } });
      if (!preference?.personalizationEnabled) {
        throw new ForbiddenException({ code: 'NEWS_PERSONALIZATION_NOT_ENABLED' });
      }
      selectedProfession = await this.selectedProfession(manager, viewerId);
    }

    if (this.usesPortableNewsRankingFallback()) {
      if (filters.feed === 'for_you') {
        negative = new Set(
          (
            await manager
              .getRepository(NewsNegativeFeedback)
              .find({ where: { userId: viewerId! } })
          ).map((row) => row.articleId),
        );
      }
      return this.portableRankedPublicPage(
        manager,
        now,
        filters,
        preference,
        selectedProfession,
        negative,
      );
    }

    return this.databaseRankedPublicPage(
      manager,
      now,
      filters,
      preference,
      selectedProfession,
      viewerId,
    );
  }

  async getPublic(publicId: string): Promise<PublicNewsItemView | PublicNewsUnavailableView> {
    const manager = this.dataSource.manager;
    const article = await manager.getRepository(NewsArticle).findOne({ where: { publicId } });
    if (!article) throw new NotFoundException({ code: 'NEWS_NOT_FOUND' });
    if (article.status === 'withdrawn') return this.withdrawnView(article, 'withdrawn');
    if (!article.publishedRevisionId || !article.publishedAt) {
      throw new NotFoundException({ code: 'NEWS_NOT_FOUND' });
    }
    const source = await manager.getRepository(NewsSource).findOneByOrFail({ id: article.sourceId });
    if (!this.sourcePublishable(source, this.clock.now())) {
      return {
        id: article.publicId,
        status: 'unavailable',
        notice: '来源授权状态发生变化，资讯暂不可用。',
        withdrawnAt: article.withdrawnAt?.toISOString() ?? null,
      };
    }
    const revision = await manager.getRepository(NewsArticleRevision).findOneByOrFail({
      id: article.publishedRevisionId,
    });
    return this.publicView(article, revision, source);
  }

  async getPreferences(userId: string) {
    const manager = this.dataSource.manager;
    await this.requireActiveUser(manager, userId, false);
    const preference = await manager.getRepository(NewsUserPreference).findOne({ where: { userId } });
    return {
      personalizationEnabled: preference?.personalizationEnabled ?? false,
      topicPreferences: preference?.topicPreferences ?? [],
      selectedProfession: await this.selectedProfession(manager, userId),
      version: preference?.version ?? null,
    };
  }

  async updatePreferences(
    userId: string,
    personalizationEnabled: boolean,
    topicPreferences: string[],
    expectedVersion: number | null,
    idempotencyKey: string,
  ) {
    const command = { personalizationEnabled, topicPreferences, expectedVersion };
    return this.withReceipt(userId, 'news.preferences', idempotencyKey, command, async (manager) => {
      await this.requireActiveUser(manager, userId, true);
      const repo = manager.getRepository(NewsUserPreference);
      let preference = await repo.findOne({
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!preference) {
        if (expectedVersion !== null) throw this.versionConflict(0);
        preference = repo.create({
          userId,
          personalizationEnabled,
          topicPreferences,
          version: 1,
        });
      } else {
        if (expectedVersion !== preference.version) throw this.versionConflict(preference.version);
        preference.personalizationEnabled = personalizationEnabled;
        preference.topicPreferences = topicPreferences;
        preference.version += 1;
      }
      await repo.save(preference);
      return {
        personalizationEnabled: preference.personalizationEnabled,
        topicPreferences: preference.topicPreferences,
        selectedProfession: await this.selectedProfession(manager, userId),
        version: preference.version,
      };
    });
  }

  async negativeFeedback(
    userId: string,
    publicId: string,
    reason: NewsNegativeFeedbackReason,
    idempotencyKey: string,
  ) {
    return this.withReceipt(
      userId,
      'news.negative-feedback',
      idempotencyKey,
      { publicId, reason },
      async (manager) => {
        await this.requireActiveUser(manager, userId, true);
        const article = await manager.getRepository(NewsArticle).findOne({ where: { publicId } });
        if (!article || !article.publishedRevisionId || article.status === 'withdrawn') {
          throw new NotFoundException({ code: 'NEWS_NOT_FOUND' });
        }
        const repo = manager.getRepository(NewsNegativeFeedback);
        let row = await repo.findOne({ where: { userId, articleId: article.id } });
        if (!row) row = repo.create({ userId, articleId: article.id, reason });
        else row.reason = reason;
        await repo.save(row);
        return { acknowledged: true as const, articleId: article.publicId, reason };
      },
    );
  }

  async listSources(actorId: string) {
    await this.requireEditorialUser(this.dataSource.manager, actorId, true, false);
    const sources = await this.dataSource.getRepository(NewsSource).find({
      order: { updatedAt: 'DESC', id: 'DESC' },
    });
    return { items: sources.map((source) => this.adminSourceView(source)) };
  }

  async createSource(
    actorId: string,
    input: NewsSourceInput,
    idempotencyKey: string,
  ) {
    return this.withReceipt(actorId, 'news.source.create', idempotencyKey, input, async (manager) => {
      const actor = await this.requireEditorialUser(manager, actorId, true, true);
      const repo = manager.getRepository(NewsSource);
      if (await repo.exist({ where: { name: input.name } })) {
        throw new ConflictException({ code: 'NEWS_SOURCE_NAME_EXISTS' });
      }
      const source = await repo.save(
        repo.create({
          ...input,
          authorizationRevokedAt:
            input.authorizationStatus === 'revoked' ? this.clock.now() : null,
          version: 1,
          createdBy: actor.id,
          updatedBy: actor.id,
        }),
      );
      await this.audit(manager, actor, 'news.source.created', 'news_source', source.id, null, idempotencyKey, {}, this.sourceState(source));
      return this.adminSourceView(source);
    });
  }

  async updateSource(
    actorId: string,
    sourceId: string,
    input: NewsSourceInput,
    expectedVersion: number,
    idempotencyKey: string,
  ) {
    return this.withReceipt(
      actorId,
      'news.source.update',
      idempotencyKey,
      { sourceId, input, expectedVersion },
      async (manager) => {
        const actor = await this.requireEditorialUser(manager, actorId, true, true);
        const repo = manager.getRepository(NewsSource);
        const source = await repo.findOne({
          where: { id: sourceId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!source) throw new NotFoundException({ code: 'NEWS_SOURCE_NOT_FOUND' });
        if (source.version !== expectedVersion) throw this.versionConflict(source.version);
        const duplicate = await repo.findOne({ where: { name: input.name } });
        if (duplicate && duplicate.id !== source.id) {
          throw new ConflictException({ code: 'NEWS_SOURCE_NAME_EXISTS' });
        }
        const previous = this.sourceState(source);
        Object.assign(source, input, {
          updatedBy: actor.id,
          version: source.version + 1,
          authorizationRevokedAt:
            input.authorizationStatus === 'revoked'
              ? source.authorizationRevokedAt ?? this.clock.now()
              : null,
        });
        await repo.save(source);
        await this.audit(manager, actor, 'news.source.updated', 'news_source', source.id, null, idempotencyKey, previous, this.sourceState(source));
        if (!this.sourcePublishable(source, this.clock.now())) {
          await this.withdrawArticlesForSource(manager, actor, source, idempotencyKey);
        }
        return this.adminSourceView(source);
      },
    );
  }

  async listAdminArticles(
    actorId: string,
    filters: { status?: NewsArticleStatus; cursor?: string },
  ) {
    await this.requireEditorialUser(this.dataSource.manager, actorId, false, false);
    const rows = await this.dataSource.getRepository(NewsArticle).find({
      ...(filters.status ? { where: { status: filters.status } } : {}),
      order: { updatedAt: 'DESC', id: 'DESC' },
    });
    const start = this.adminCursorStart(rows, filters.cursor);
    const page = rows.slice(start, start + ADMIN_PAGE_SIZE);
    return {
      items: await Promise.all(page.map((article) => this.adminArticleView(this.dataSource.manager, article))),
      nextCursor:
        start + ADMIN_PAGE_SIZE < rows.length && page.length > 0
          ? this.adminCursor(page.at(-1)!)
          : null,
    };
  }

  async getAdminArticle(actorId: string, publicId: string) {
    await this.requireEditorialUser(this.dataSource.manager, actorId, false, false);
    const article = await this.dataSource.getRepository(NewsArticle).findOne({ where: { publicId } });
    if (!article) throw new NotFoundException({ code: 'NEWS_NOT_FOUND' });
    return this.adminArticleView(this.dataSource.manager, article);
  }

  async createDraft(
    actorId: string,
    input: NewsRevisionInput,
    idempotencyKey: string,
  ) {
    return this.withReceipt(actorId, 'news.article.create', idempotencyKey, input, async (manager) => {
      const actor = await this.requireEditorialUser(manager, actorId, false, true);
      const source = await this.requireSource(manager, input.sourceId);
      this.assertOriginalHost(source, input.originalUrl);
      const articleRepo = manager.getRepository(NewsArticle);
      const article = await articleRepo.save(
        articleRepo.create({
          publicId: randomUUID(),
          sourceId: source.id,
          status: 'draft',
          currentRevisionId: null,
          pendingRevisionId: null,
          publishedRevisionId: null,
          createdBy: actor.id,
          submittedBy: null,
          submittedAt: null,
          reviewedBy: null,
          publishedAt: null,
          lastCorrectedAt: null,
          withdrawnAt: null,
          withdrawalNotice: null,
          version: 1,
        }),
      );
      const revision = await manager.getRepository(NewsArticleRevision).save(
        this.revisionEntity(manager, article.id, 1, input, actor.id),
      );
      article.currentRevisionId = revision.id;
      await articleRepo.save(article);
      await this.audit(manager, actor, 'news.article.draft_created', 'news_article', article.id, null, idempotencyKey, {}, this.articleState(article));
      return this.adminArticleView(manager, article);
    });
  }

  async reviseDraft(
    actorId: string,
    publicId: string,
    input: NewsRevisionInput,
    expectedVersion: number,
    idempotencyKey: string,
  ) {
    return this.withReceipt(
      actorId,
      'news.article.revise',
      idempotencyKey,
      { publicId, input, expectedVersion },
      async (manager) => {
        const actor = await this.requireEditorialUser(manager, actorId, false, true);
        const article = await this.lockArticle(manager, publicId);
        if (article.version !== expectedVersion) throw this.versionConflict(article.version);
        if (article.status === 'pending_review') {
          throw new ConflictException({ code: 'NEWS_REVIEW_PENDING' });
        }
        if (article.publishedRevisionId && !input.correctionNote) {
          throw new BadRequestException({ code: 'NEWS_CORRECTION_NOTE_REQUIRED' });
        }
        const source = await this.requireSource(manager, input.sourceId);
        this.assertOriginalHost(source, input.originalUrl);
        const current = article.currentRevisionId
          ? await manager.getRepository(NewsArticleRevision).findOneByOrFail({ id: article.currentRevisionId })
          : null;
        const hash = newsContentHash(input);
        if (current?.contentHash === hash) throw new ConflictException({ code: 'NEWS_REVISION_UNCHANGED' });
        const last = await manager.getRepository(NewsArticleRevision).findOne({
          where: { articleId: article.id },
          order: { version: 'DESC' },
        });
        const revision = await manager.getRepository(NewsArticleRevision).save(
          this.revisionEntity(manager, article.id, (last?.version ?? 0) + 1, input, actor.id),
        );
        const previous = this.articleState(article);
        const wasWithdrawn = article.status === 'withdrawn';
        article.sourceId = source.id;
        article.currentRevisionId = revision.id;
        article.pendingRevisionId = null;
        article.submittedBy = null;
        article.submittedAt = null;
        article.reviewedBy = null;
        article.withdrawalNotice = null;
        article.withdrawnAt = null;
        if (wasWithdrawn) {
          // A withdrawn edition must not silently reappear while a replacement is edited.
          // Revision history remains immutable, but a new independent approval is required
          // before any public pointer and publication timestamp are restored.
          article.status = 'draft';
          article.publishedRevisionId = null;
          article.publishedAt = null;
          article.lastCorrectedAt = null;
        }
        article.version += 1;
        await manager.getRepository(NewsArticle).save(article);
        await this.audit(manager, actor, 'news.article.revised', 'news_article', article.id, revision.id, idempotencyKey, previous, this.articleState(article));
        return this.adminArticleView(manager, article);
      },
    );
  }

  async submitForReview(
    actorId: string,
    publicId: string,
    expectedVersion: number,
    idempotencyKey: string,
  ) {
    return this.withReceipt(
      actorId,
      'news.article.submit',
      idempotencyKey,
      { publicId, expectedVersion },
      async (manager) => {
        const actor = await this.requireEditorialUser(manager, actorId, false, true);
        const article = await this.lockArticle(manager, publicId);
        if (article.version !== expectedVersion) throw this.versionConflict(article.version);
        if (article.status === 'pending_review') throw new ConflictException({ code: 'NEWS_REVIEW_PENDING' });
        if (!article.currentRevisionId || article.currentRevisionId === article.publishedRevisionId) {
          throw new ConflictException({ code: 'NEWS_UNPUBLISHED_REVISION_REQUIRED' });
        }
        const source = await this.requireSource(manager, article.sourceId);
        this.assertSourcePublishable(source, this.clock.now());
        const revision = await manager.getRepository(NewsArticleRevision).findOneByOrFail({
          id: article.currentRevisionId,
        });
        if (
          await manager.getRepository(NewsReviewDecision).exist({
            where: { revisionId: revision.id },
          })
        ) {
          throw new ConflictException({ code: 'NEWS_REVISION_ALREADY_REVIEWED' });
        }
        this.assertOriginalHost(source, revision.originalUrl);
        const previous = this.articleState(article);
        article.status = 'pending_review';
        article.pendingRevisionId = revision.id;
        article.submittedBy = actor.id;
        article.submittedAt = this.clock.now();
        article.reviewedBy = null;
        article.version += 1;
        await manager.getRepository(NewsArticle).save(article);
        await this.audit(manager, actor, 'news.article.submitted', 'news_article', article.id, revision.id, idempotencyKey, previous, this.articleState(article));
        return this.adminArticleView(manager, article);
      },
    );
  }

  async review(
    actorId: string,
    publicId: string,
    decision: 'approved' | 'rejected',
    reason: string,
    expectedVersion: number,
    idempotencyKey: string,
  ) {
    return this.withReceipt(
      actorId,
      'news.article.review',
      idempotencyKey,
      { publicId, decision, reason, expectedVersion },
      async (manager) => {
        const reviewer = await this.requireEditorialUser(manager, actorId, false, true);
        const article = await this.lockArticle(manager, publicId);
        if (article.version !== expectedVersion) throw this.versionConflict(article.version);
        if (
          article.status !== 'pending_review' ||
          !article.pendingRevisionId ||
          !article.submittedBy
        ) {
          throw new ConflictException({ code: 'NEWS_NOT_PENDING_REVIEW' });
        }
        if (article.submittedBy === reviewer.id) {
          throw new ForbiddenException({ code: 'NEWS_SELF_REVIEW_FORBIDDEN' });
        }
        const source = await this.requireSource(manager, article.sourceId);
        const revision = await manager.getRepository(NewsArticleRevision).findOneByOrFail({
          id: article.pendingRevisionId,
        });
        if (decision === 'approved') {
          this.assertSourcePublishable(source, this.clock.now());
          this.assertOriginalHost(source, revision.originalUrl);
        }
        const previous = this.articleState(article);
        const now = this.clock.now();
        const hadPublishedRevision = article.publishedRevisionId !== null;
        await manager.getRepository(NewsReviewDecision).save(
          manager.getRepository(NewsReviewDecision).create({
            articleId: article.id,
            revisionId: revision.id,
            submittedBy: article.submittedBy,
            reviewerId: reviewer.id,
            decision,
            reason,
            sourceAuthorizationSnapshot: this.sourceAuthorizationSnapshot(source),
          }),
        );
        article.reviewedBy = reviewer.id;
        article.pendingRevisionId = null;
        if (decision === 'approved') {
          article.status = 'published';
          article.publishedRevisionId = revision.id;
          if (!article.publishedAt) article.publishedAt = now;
          if (hadPublishedRevision) article.lastCorrectedAt = now;
          article.withdrawnAt = null;
          article.withdrawalNotice = null;
        } else {
          article.status = hadPublishedRevision ? 'published' : 'draft';
        }
        article.version += 1;
        await manager.getRepository(NewsArticle).save(article);
        await this.audit(
          manager,
          reviewer,
          decision === 'approved' ? 'news.article.published' : 'news.article.rejected',
          'news_article',
          article.id,
          revision.id,
          idempotencyKey,
          previous,
          this.articleState(article),
          reason,
        );
        return this.adminArticleView(manager, article);
      },
    );
  }

  async withdraw(
    actorId: string,
    publicId: string,
    reason: string,
    expectedVersion: number,
    idempotencyKey: string,
  ) {
    return this.withReceipt(
      actorId,
      'news.article.withdraw',
      idempotencyKey,
      { publicId, reason, expectedVersion },
      async (manager) => {
        const actor = await this.requireEditorialUser(manager, actorId, false, true);
        const article = await this.lockArticle(manager, publicId);
        if (article.version !== expectedVersion) throw this.versionConflict(article.version);
        if (!article.publishedRevisionId) {
          throw new ConflictException({ code: 'NEWS_HAS_NEVER_BEEN_PUBLISHED' });
        }
        const previous = this.articleState(article);
        article.status = 'withdrawn';
        article.pendingRevisionId = null;
        article.withdrawnAt = this.clock.now();
        article.withdrawalNotice = reason;
        article.version += 1;
        await manager.getRepository(NewsArticle).save(article);
        await this.audit(manager, actor, 'news.article.withdrawn', 'news_article', article.id, null, idempotencyKey, previous, this.articleState(article), reason);
        return this.adminArticleView(manager, article);
      },
    );
  }

  private async withReceipt<T extends object>(
    userId: string,
    commandType: string,
    idempotencyKey: string,
    input: unknown,
    apply: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    const hash = this.newsRequestHash(input);
    return this.dataSource.transaction(async (manager) => {
      await this.requireActiveUser(manager, userId, true);
      const repo = manager.getRepository(CommunityCommandReceipt);
      const receipt = await repo.findOne({
        where: { userId, commandType, idempotencyKey },
      });
      if (receipt) {
        if (receipt.requestHash !== hash) {
          throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED' });
        }
        return receipt.result as T;
      }
      const result = await apply(manager);
      await repo.save(
        repo.create({
          userId,
          commandType,
          idempotencyKey,
          requestHash: hash,
          result: result as unknown as Record<string, unknown>,
        }),
      );
      return result;
    });
  }

  private async requireActiveUser(
    manager: EntityManager,
    userId: string,
    lock: boolean,
  ): Promise<User> {
    const user = await manager.getRepository(User).findOne({
      where: { id: userId },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!user || user.accountStatus !== 'active') {
      throw new ForbiddenException({ code: 'ACCOUNT_UNAVAILABLE' });
    }
    return user;
  }

  private async requireEditorialUser(
    manager: EntityManager,
    userId: string,
    adminOnly: boolean,
    lock: boolean,
  ): Promise<User> {
    const user = await this.requireActiveUser(manager, userId, lock);
    if (
      (adminOnly && user.communityRole !== 'admin') ||
      (!adminOnly && user.communityRole !== 'admin' && user.communityRole !== 'moderator')
    ) {
      throw new ForbiddenException({
        code: adminOnly ? 'NEWS_ADMIN_REQUIRED' : 'NEWS_EDITOR_ACCESS_REQUIRED',
      });
    }
    return user;
  }

  private async requireSource(manager: EntityManager, sourceId: string): Promise<NewsSource> {
    const source = await manager.getRepository(NewsSource).findOne({ where: { id: sourceId } });
    if (!source) throw new NotFoundException({ code: 'NEWS_SOURCE_NOT_FOUND' });
    return source;
  }

  private async lockArticle(manager: EntityManager, publicId: string): Promise<NewsArticle> {
    const article = await manager.getRepository(NewsArticle).findOne({
      where: { publicId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!article) throw new NotFoundException({ code: 'NEWS_NOT_FOUND' });
    return article;
  }

  private revisionEntity(
    manager: EntityManager,
    articleId: string,
    version: number,
    input: NewsRevisionInput,
    actorId: string,
  ): NewsArticleRevision {
    return manager.getRepository(NewsArticleRevision).create({
      articleId,
      version,
      originalTitle: input.originalTitle,
      summary: input.summary,
      originalUrl: input.originalUrl,
      originalPublishedAt: input.originalPublishedAt,
      professionTags: input.professionTags,
      topicTags: input.topicTags,
      correctionNote: input.correctionNote,
      contentHash: newsContentHash(input),
      createdBy: actorId,
    });
  }

  private sourcePublishable(source: NewsSource, now: Date): boolean {
    return (
      source.authorizationStatus === 'verified' &&
      source.authorizationRevokedAt === null &&
      (!source.authorizationValidFrom || source.authorizationValidFrom.getTime() <= now.getTime()) &&
      (!source.authorizationValidUntil || source.authorizationValidUntil.getTime() > now.getTime()) &&
      (source.sourceType !== 'licensed' || source.authorizationValidUntil !== null)
    );
  }

  private assertSourcePublishable(source: NewsSource, now: Date): void {
    if (!this.sourcePublishable(source, now)) {
      throw new ConflictException({ code: 'NEWS_SOURCE_AUTHORIZATION_INVALID' });
    }
  }

  private assertOriginalHost(source: NewsSource, originalUrl: string): void {
    const sourceHost = new URL(source.homepageUrl).hostname.toLowerCase();
    const originalHost = new URL(originalUrl).hostname.toLowerCase();
    if (originalHost !== sourceHost && !originalHost.endsWith(`.${sourceHost}`)) {
      throw new BadRequestException({ code: 'NEWS_ORIGINAL_SOURCE_MISMATCH' });
    }
  }

  private publicView(
    article: NewsArticle,
    revision: NewsArticleRevision,
    source: NewsSource,
  ): PublicNewsItemView {
    const params = new URLSearchParams({
      sourceUrl: revision.originalUrl,
    });
    return {
      id: article.publicId,
      status: 'published',
      summary: revision.summary,
      source: { name: source.name },
      originalPublishedAt: revision.originalPublishedAt.toISOString(),
      originalUrl: revision.originalUrl,
      publishedAt: article.publishedAt!.toISOString(),
      lastCorrectedAt: article.lastCorrectedAt?.toISOString() ?? null,
      correctionNote: revision.correctionNote,
      discussion: {
        commentsEnabled: false,
        createPostPath: `/community/new?${params.toString()}`,
      },
    };
  }

  private withdrawnView(
    article: NewsArticle,
    status: 'withdrawn' | 'unavailable',
  ): PublicNewsUnavailableView {
    return {
      id: article.publicId,
      status,
      notice: article.withdrawalNotice ?? '该资讯已下线。',
      withdrawnAt: article.withdrawnAt?.toISOString() ?? null,
    };
  }

  private adminSourceView(source: NewsSource): AdminNewsSourceView {
    return {
      id: source.id,
      name: source.name,
      sourceType: source.sourceType,
      homepageUrl: source.homepageUrl,
      trustRank: source.trustRank,
      authorizationStatus: source.authorizationStatus,
      authorizationEvidenceRef: source.authorizationEvidenceRef,
      authorizationValidFrom: source.authorizationValidFrom?.toISOString() ?? null,
      authorizationValidUntil: source.authorizationValidUntil?.toISOString() ?? null,
      authorizationRevokedAt: source.authorizationRevokedAt?.toISOString() ?? null,
      version: source.version,
      createdAt: source.createdAt.toISOString(),
      updatedAt: source.updatedAt.toISOString(),
    };
  }

  private editorSourceView(
    source: NewsSource,
  ): Omit<AdminNewsSourceView, 'authorizationEvidenceRef'> {
    const { authorizationEvidenceRef: _redacted, ...view } = this.adminSourceView(source);
    return view;
  }

  private async adminArticleView(
    manager: EntityManager,
    article: NewsArticle,
  ): Promise<AdminNewsArticleView> {
    if (!article.currentRevisionId) {
      throw new ConflictException({ code: 'NEWS_REVISION_MISSING' });
    }
    const ids = [
      article.currentRevisionId,
      article.publishedRevisionId,
      article.pendingRevisionId,
    ].filter((id): id is string => id !== null);
    const revisions = new Map(
      (
        await manager.getRepository(NewsArticleRevision).find({ where: { id: In([...new Set(ids)]) } })
      ).map((revision) => [revision.id, revision]),
    );
    const source = await manager.getRepository(NewsSource).findOneByOrFail({ id: article.sourceId });
    const current = revisions.get(article.currentRevisionId);
    if (!current) throw new ConflictException({ code: 'NEWS_REVISION_MISSING' });
    return {
      id: article.publicId,
      status: article.status,
      version: article.version,
      source: this.editorSourceView(source),
      currentRevision: this.adminRevisionView(current),
      publishedRevision: article.publishedRevisionId
        ? this.adminRevisionView(revisions.get(article.publishedRevisionId)!)
        : null,
      pendingRevision: article.pendingRevisionId
        ? this.adminRevisionView(revisions.get(article.pendingRevisionId)!)
        : null,
      submittedBy: article.submittedBy,
      submittedAt: article.submittedAt?.toISOString() ?? null,
      reviewedBy: article.reviewedBy,
      publishedAt: article.publishedAt?.toISOString() ?? null,
      lastCorrectedAt: article.lastCorrectedAt?.toISOString() ?? null,
      withdrawnAt: article.withdrawnAt?.toISOString() ?? null,
      withdrawalNotice: article.withdrawalNotice,
      createdAt: article.createdAt.toISOString(),
      updatedAt: article.updatedAt.toISOString(),
    };
  }

  private adminRevisionView(revision: NewsArticleRevision): Record<string, unknown> {
    return {
      version: revision.version,
      originalTitle: revision.originalTitle,
      summary: revision.summary,
      originalUrl: revision.originalUrl,
      originalPublishedAt: revision.originalPublishedAt.toISOString(),
      professionTags: revision.professionTags,
      topicTags: revision.topicTags,
      correctionNote: revision.correctionNote,
      createdAt: revision.createdAt.toISOString(),
    };
  }

  private sourceState(source: NewsSource): Record<string, unknown> {
    return {
      sourceType: source.sourceType,
      homepageUrl: source.homepageUrl,
      trustRank: source.trustRank,
      authorizationStatus: source.authorizationStatus,
      evidenceReferenceHash: createHash('sha256')
        .update(source.authorizationEvidenceRef)
        .digest('hex'),
      authorizationValidFrom: source.authorizationValidFrom?.toISOString() ?? null,
      authorizationValidUntil: source.authorizationValidUntil?.toISOString() ?? null,
      authorizationRevokedAt: source.authorizationRevokedAt?.toISOString() ?? null,
      version: source.version,
    };
  }

  private articleState(article: NewsArticle): Record<string, unknown> {
    return {
      publicId: article.publicId,
      status: article.status,
      currentRevisionId: article.currentRevisionId,
      pendingRevisionId: article.pendingRevisionId,
      publishedRevisionId: article.publishedRevisionId,
      submittedBy: article.submittedBy,
      reviewedBy: article.reviewedBy,
      publishedAt: article.publishedAt?.toISOString() ?? null,
      withdrawnAt: article.withdrawnAt?.toISOString() ?? null,
      version: article.version,
    };
  }

  private sourceAuthorizationSnapshot(source: NewsSource): Record<string, unknown> {
    return {
      sourceType: source.sourceType,
      status: source.authorizationStatus,
      validFrom: source.authorizationValidFrom?.toISOString() ?? null,
      validUntil: source.authorizationValidUntil?.toISOString() ?? null,
      revokedAt: source.authorizationRevokedAt?.toISOString() ?? null,
      evidenceReferenceHash: createHash('sha256')
        .update(source.authorizationEvidenceRef)
        .digest('hex'),
      sourceVersion: source.version,
    };
  }

  private async withdrawArticlesForSource(
    manager: EntityManager,
    actor: User,
    source: NewsSource,
    requestId: string,
  ): Promise<void> {
    const articles = await manager.getRepository(NewsArticle).find({ where: { sourceId: source.id } });
    for (const article of articles) {
      if (article.status === 'withdrawn') continue;
      const previous = this.articleState(article);
      if (article.publishedRevisionId) {
        article.status = 'withdrawn';
        article.withdrawnAt = this.clock.now();
        article.withdrawalNotice = '来源授权状态已失效，资讯已撤回。';
      } else if (article.status === 'pending_review') {
        article.status = 'draft';
      } else {
        continue;
      }
      article.pendingRevisionId = null;
      article.version += 1;
      await manager.getRepository(NewsArticle).save(article);
      await this.audit(
        manager,
        actor,
        'news.article.source_authorization_withdrawn',
        'news_article',
        article.id,
        null,
        requestId,
        previous,
        this.articleState(article),
        'source_authorization_invalid',
      );
    }
  }

  private async audit(
    manager: EntityManager,
    actor: User,
    action: string,
    targetType: string,
    targetId: string,
    _revisionId: string | null,
    requestId: string,
    previousState: Record<string, unknown>,
    nextState: Record<string, unknown>,
    reason: string | null = null,
  ): Promise<void> {
    await manager.getRepository(AdminAuditLog).save(
      manager.getRepository(AdminAuditLog).create({
        actorId: actor.id,
        actorRole: actor.communityRole,
        action,
        targetType,
        targetId,
        reason,
        requestId,
        previousState,
        nextState,
      }),
    );
  }

  private async selectedProfession(manager: EntityManager, userId: string): Promise<string | null> {
    const battle = await manager.getRepository(OfficeBattleProfile).findOne({ where: { userId } });
    if (battle) return battle.profession;
    const profile = await manager.getRepository(PlayerProfile).findOne({ where: { userId } });
    return profile?.battleProfession && NEWS_PROFESSION_TAGS.includes(
      profile.battleProfession as (typeof NEWS_PROFESSION_TAGS)[number],
    )
      ? profile.battleProfession
      : null;
  }

  /**
   * pg-mem cannot execute the PostgreSQL JSONB ranking expressions used by the
   * production query. It still executes the same database visibility/source
   * authorization query; only tag scoring and cursor slicing remain in memory.
   */
  private async portableRankedPublicPage(
    manager: EntityManager,
    now: Date,
    filters: NewsPublicListFilters,
    preference: NewsUserPreference | null,
    selectedProfession: string | null,
    negative: ReadonlySet<string>,
  ) {
    const articles = await this.portableVisibleArticles(manager, now);
    const hydrated = await this.hydratePublicRows(manager, now, articles);
    const ranked = hydrated
      .filter(({ article, revision }) => {
        if (
          filters.profession &&
          !revision.professionTags.includes(filters.profession)
        ) {
          return false;
        }
        if (filters.topic && !revision.topicTags.includes(filters.topic)) {
          return false;
        }
        return filters.feed !== 'for_you' || !negative.has(article.id);
      })
      .map((row) => {
        const topicMatches =
          filters.feed === 'for_you' && preference
            ? row.revision.topicTags.filter((tag) =>
                preference.topicPreferences.includes(tag),
              ).length
            : 0;
        const professionMatch =
          filters.feed === 'for_you' &&
          selectedProfession &&
          row.revision.professionTags.includes(selectedProfession)
            ? 1
            : 0;
        return {
          ...row,
          score:
            filters.feed === 'for_you'
              ? topicMatches * 30 + professionMatch * 20 + row.source.trustRank
              : 0,
        };
      })
      .sort(
        (left, right) =>
          right.score - left.score ||
          right.article.publishedAt!.getTime() -
            left.article.publishedAt!.getTime() ||
          right.article.publicId.localeCompare(left.article.publicId),
      );

    const start = this.publicCursorStart(ranked, filters.cursor, filters.feed);
    const page = ranked.slice(start, start + PUBLIC_PAGE_SIZE);
    return this.publicPage(filters.feed, page, {
      hasMore: start + PUBLIC_PAGE_SIZE < ranked.length,
      cursorRow: page.at(-1) ?? null,
    });
  }

  private async portableLatestPublicPage(
    manager: EntityManager,
    now: Date,
    rawCursor?: string,
  ) {
    const articles = await this.portableVisibleArticles(manager, now);
    const ranked = await this.hydratePublicRows(manager, now, articles);
    const start = this.publicCursorStart(ranked, rawCursor, 'latest');
    const page = ranked.slice(start, start + PUBLIC_PAGE_SIZE);
    return this.publicPage('latest', page, {
      hasMore: start + PUBLIC_PAGE_SIZE < ranked.length,
      cursorRow: page.at(-1) ?? null,
    });
  }

  private async portableVisibleArticles(
    manager: EntityManager,
    now: Date,
  ): Promise<NewsArticle[]> {
    const sourceIds = (await manager.getRepository(NewsSource).find())
      .filter((source) => this.sourcePublishable(source, now))
      .map((source) => source.id);
    if (sourceIds.length === 0) return [];
    const common = {
      sourceId: In(sourceIds),
      publishedRevisionId: Not(IsNull()),
      publishedAt: Not(IsNull()),
    };
    return manager.getRepository(NewsArticle).find({
      where: [
        { ...common, status: 'published' },
        { ...common, status: 'pending_review' },
      ],
      order: { publishedAt: 'DESC', publicId: 'DESC' },
    });
  }

  /** PostgreSQL path: tag filters, negative feedback, ranking and keyset all stay in SQL. */
  private async databaseRankedPublicPage(
    manager: EntityManager,
    now: Date,
    filters: NewsPublicListFilters,
    preference: NewsUserPreference | null,
    selectedProfession: string | null,
    viewerId: string | null,
  ) {
    const query = this.publicArticleQuery(manager, now);
    if (filters.profession) {
      query.andWhere(
        'public_revision.profession_tags @> CAST(:professionFilter AS jsonb)',
        { professionFilter: JSON.stringify([filters.profession]) },
      );
    }
    if (filters.topic) {
      query.andWhere(
        'public_revision.topic_tags @> CAST(:topicFilter AS jsonb)',
        { topicFilter: JSON.stringify([filters.topic]) },
      );
    }

    const cursor = this.decodePublicCursor(filters.cursor, filters.feed);
    let scoreExpression = '0';
    if (filters.feed === 'for_you') {
      query
        .leftJoin(
          NewsNegativeFeedback,
          'negative_feedback',
          'negative_feedback.article_id = article.id AND negative_feedback.user_id = :viewerId',
          { viewerId: viewerId! },
        )
        .andWhere('negative_feedback.id IS NULL');
      const score = this.personalizationScoreExpression(
        preference!,
        selectedProfession,
      );
      scoreExpression = score.sql;
      query.setParameters(score.parameters);
      if (cursor) {
        query.andWhere(
          `((${scoreExpression}) < :cursorScore OR
            ((${scoreExpression}) = :cursorScore AND
              (article.published_at < :cursorPublishedAt OR
                (article.published_at = :cursorPublishedAt AND article.public_id < :cursorPublicId))))`,
          {
            cursorScore: cursor.score,
            cursorPublishedAt: cursor.publishedAt,
            cursorPublicId: cursor.id,
          },
        );
      }
      query
        .orderBy('news_score', 'DESC')
        .addOrderBy('article.published_at', 'DESC');
    } else {
      if (cursor) {
        query.andWhere(
          '(article.published_at < :cursorPublishedAt OR (article.published_at = :cursorPublishedAt AND article.public_id < :cursorPublicId))',
          {
            cursorPublishedAt: cursor.publishedAt,
            cursorPublicId: cursor.id,
          },
        );
      }
      query.orderBy('article.published_at', 'DESC');
    }
    query
      .addOrderBy('article.public_id', 'DESC')
      .addSelect('article.id', 'news_internal_id')
      .addSelect(scoreExpression, 'news_score')
      // Both joins are one-to-one by primary key, so SQL LIMIT is safe and
      // avoids TypeORM's relation-pagination DISTINCT wrapper.
      .limit(PUBLIC_PAGE_SIZE + 1);

    const result = await query.getRawAndEntities<{
      news_internal_id: string;
      news_score: string | number;
    }>();
    const hasMore = result.entities.length > PUBLIC_PAGE_SIZE;
    const pageArticles = result.entities.slice(0, PUBLIC_PAGE_SIZE);
    const scoreByArticleId = new Map(
      result.raw.map((row) => [row.news_internal_id, Number(row.news_score)]),
    );
    const page = await this.hydratePublicRows(
      manager,
      now,
      pageArticles,
      scoreByArticleId,
    );
    const lastScanned = pageArticles.at(-1);
    return this.publicPage(filters.feed, page, {
      hasMore,
      cursorRow: lastScanned
        ? {
            article: lastScanned,
            score: scoreByArticleId.get(lastScanned.id) ?? 0,
          }
        : null,
    });
  }

  private publicArticleQuery(
    manager: EntityManager,
    now: Date,
  ): SelectQueryBuilder<NewsArticle> {
    return manager
      .getRepository(NewsArticle)
      .createQueryBuilder('article')
      .innerJoin(
        NewsSource,
        'public_source',
        'public_source.id = article.source_id',
      )
      .innerJoin(
        NewsArticleRevision,
        'public_revision',
        'public_revision.id = article.published_revision_id AND public_revision.article_id = article.id',
      )
      .where("article.status IN ('published', 'pending_review')")
      .andWhere('article.published_revision_id IS NOT NULL')
      .andWhere('article.published_at IS NOT NULL')
      .andWhere("public_source.authorization_status = 'verified'")
      .andWhere('public_source.authorization_revoked_at IS NULL')
      .andWhere(
        '(public_source.authorization_valid_from IS NULL OR public_source.authorization_valid_from <= :newsNow)',
        { newsNow: now },
      )
      .andWhere(
        '(public_source.authorization_valid_until IS NULL OR public_source.authorization_valid_until > :newsNow)',
        { newsNow: now },
      )
      .andWhere(
        "(public_source.source_type <> 'licensed' OR public_source.authorization_valid_until IS NOT NULL)",
      );
  }

  private personalizationScoreExpression(
    preference: NewsUserPreference,
    selectedProfession: string | null,
  ): { sql: string; parameters: Record<string, string> } {
    const parameters: Record<string, string> = {};
    const scoreParts = ['public_source.trust_rank'];
    preference.topicPreferences.forEach((tag, index) => {
      const name = `newsPreference${index}`;
      parameters[name] = JSON.stringify([tag]);
      scoreParts.push(
        `CASE WHEN public_revision.topic_tags @> CAST(:${name} AS jsonb) THEN 30 ELSE 0 END`,
      );
    });
    if (selectedProfession) {
      parameters.newsSelectedProfession = JSON.stringify([selectedProfession]);
      scoreParts.push(
        'CASE WHEN public_revision.profession_tags @> CAST(:newsSelectedProfession AS jsonb) THEN 20 ELSE 0 END',
      );
    }
    return { sql: `(${scoreParts.join(' + ')})`, parameters };
  }

  private async hydratePublicRows(
    manager: EntityManager,
    now: Date,
    articles: readonly NewsArticle[],
    scores: ReadonlyMap<string, number> = new Map(),
  ): Promise<RankedPublicNewsRow[]> {
    if (articles.length === 0) return [];
    const sourceIds = [...new Set(articles.map((article) => article.sourceId))];
    const revisionIds = articles.map((article) => article.publishedRevisionId!);
    const [sources, revisions] = await Promise.all([
      manager.getRepository(NewsSource).find({ where: { id: In(sourceIds) } }),
      manager
        .getRepository(NewsArticleRevision)
        .find({ where: { id: In(revisionIds) } }),
    ]);
    const sourceById = new Map(sources.map((source) => [source.id, source]));
    const revisionById = new Map(
      revisions.map((revision) => [revision.id, revision]),
    );
    return articles.flatMap((article) => {
      const source = sourceById.get(article.sourceId);
      const revision = revisionById.get(article.publishedRevisionId!);
      return source &&
        revision?.articleId === article.id &&
        this.sourcePublishable(source, now)
        ? [
            {
              article,
              source,
              revision,
              score: scores.get(article.id) ?? 0,
            },
          ]
        : [];
    });
  }

  private publicPage(
    feed: 'latest' | 'for_you',
    rows: readonly RankedPublicNewsRow[],
    pageState: {
      hasMore: boolean;
      cursorRow: { article: NewsArticle; score: number } | null;
    },
  ) {
    return {
      feed,
      personalized: feed === 'for_you',
      items: rows.map(({ article, revision, source }) =>
        this.publicView(article, revision, source),
      ),
      nextCursor:
        pageState.hasMore && pageState.cursorRow
          ? this.publicCursor(pageState.cursorRow, feed)
          : null,
    };
  }

  private async latestPublicPage(
    manager: EntityManager,
    now: Date,
    rawCursor?: string,
  ) {
    const cursor = this.decodePublicCursor(rawCursor, 'latest');
    const query = this.publicArticleQuery(manager, now);
    if (cursor) {
      query.andWhere(
        '(article.published_at < :publishedAt OR (article.published_at = :publishedAt AND article.public_id < :publicId))',
        { publishedAt: cursor.publishedAt, publicId: cursor.id },
      );
    }
    const rows = await query
      .orderBy('article.publishedAt', 'DESC')
      .addOrderBy('article.publicId', 'DESC')
      .limit(PUBLIC_PAGE_SIZE + 1)
      .getMany();
    const hasMore = rows.length > PUBLIC_PAGE_SIZE;
    const page = rows.slice(0, PUBLIC_PAGE_SIZE);
    const ranked = await this.hydratePublicRows(manager, now, page);
    const lastScanned = page.at(-1);
    return this.publicPage('latest', ranked, {
      hasMore,
      cursorRow: lastScanned ? { article: lastScanned, score: 0 } : null,
    });
  }

  private decodePublicCursor(
    raw: string | undefined,
    feed: 'latest' | 'for_you',
  ): { id: string; publishedAt: Date; score: number } | null {
    if (!raw) return null;
    try {
      const cursor = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as {
        id?: unknown;
        publishedAt?: unknown;
        score?: unknown;
        feed?: unknown;
      };
      if (
        typeof cursor.id !== 'string' ||
        !UUID_PATTERN.test(cursor.id) ||
        typeof cursor.publishedAt !== 'string' ||
        typeof cursor.score !== 'number' ||
        !Number.isFinite(cursor.score) ||
        (feed === 'latest' && cursor.score !== 0) ||
        cursor.feed !== feed
      ) {
        throw new Error();
      }
      const publishedAt = new Date(cursor.publishedAt);
      if (
        Number.isNaN(publishedAt.getTime()) ||
        publishedAt.toISOString() !== cursor.publishedAt
      ) {
        throw new Error();
      }
      return { id: cursor.id, publishedAt, score: cursor.score };
    } catch {
      throw new BadRequestException({ code: 'INVALID_NEWS_CURSOR' });
    }
  }

  private publicCursorStart(
    rows: RankedPublicNewsRow[],
    raw: string | undefined,
    feed: 'latest' | 'for_you',
  ): number {
    if (!raw) return 0;
    try {
      const cursor = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as {
        id?: unknown;
        publishedAt?: unknown;
        score?: unknown;
        feed?: unknown;
      };
      if (
        typeof cursor.id !== 'string' ||
        typeof cursor.publishedAt !== 'string' ||
        typeof cursor.score !== 'number' ||
        cursor.feed !== feed
      ) {
        throw new Error();
      }
      const index = rows.findIndex(
        (row) =>
          row.article.publicId === cursor.id &&
          row.article.publishedAt?.toISOString() === cursor.publishedAt &&
          row.score === cursor.score,
      );
      if (index < 0) throw new Error();
      return index + 1;
    } catch {
      throw new BadRequestException({ code: 'INVALID_NEWS_CURSOR' });
    }
  }

  private publicCursor(
    row: { article: NewsArticle; score: number },
    feed: 'latest' | 'for_you',
  ): string {
    return Buffer.from(
      JSON.stringify({
        id: row.article.publicId,
        publishedAt: row.article.publishedAt!.toISOString(),
        score: row.score,
        feed,
      }),
    ).toString('base64url');
  }

  private usesPortableNewsRankingFallback(): boolean {
    const extra = this.dataSource.options.extra as
      | Record<string, unknown>
      | undefined;
    return extra?.contentSearchFallback === true;
  }

  private adminCursorStart(rows: NewsArticle[], raw?: string): number {
    if (!raw) return 0;
    try {
      const cursor = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as {
        id?: unknown;
        updatedAt?: unknown;
      };
      if (typeof cursor.id !== 'string' || typeof cursor.updatedAt !== 'string') throw new Error();
      const index = rows.findIndex(
        (row) => row.publicId === cursor.id && row.updatedAt.toISOString() === cursor.updatedAt,
      );
      if (index < 0) throw new Error();
      return index + 1;
    } catch {
      throw new BadRequestException({ code: 'INVALID_NEWS_CURSOR' });
    }
  }

  private adminCursor(row: NewsArticle): string {
    return Buffer.from(
      JSON.stringify({ id: row.publicId, updatedAt: row.updatedAt.toISOString() }),
    ).toString('base64url');
  }

  private versionConflict(currentVersion: number): ConflictException {
    return new ConflictException({ code: 'VERSION_CONFLICT', currentVersion });
  }

  private newsRequestHash(value: unknown): string {
    return createHash('sha256').update(this.canonical(value)).digest('hex');
  }

  private canonical(value: unknown): string {
    if (value instanceof Date) return JSON.stringify(value.toISOString());
    if (Array.isArray(value)) return `[${value.map((entry) => this.canonical(entry)).join(',')}]`;
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      return `{${Object.keys(record)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${this.canonical(record[key])}`)
        .join(',')}}`;
    }
    return JSON.stringify(value);
  }
}
