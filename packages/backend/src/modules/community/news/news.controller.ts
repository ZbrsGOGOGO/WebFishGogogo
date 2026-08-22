import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  CurrentUserId,
  OptionalCurrentUserId,
} from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../auth/optional-jwt-auth.guard';
import { CommunityRbacGuard } from '../community-rbac.guard';
import { idempotencyKey } from '../community-validation';
import { expectedVersion } from '../content-validation';
import {
  CommunityNewsFeatureGuard,
  NewsAdminFeatureGuard,
} from './news-gates';
import { NewsService } from './news.service';
import {
  NEWS_PROFESSION_TAGS,
  boundedReason,
  newsFeedbackReason,
  newsTopicPreferences,
  parseNewsRevisionInput,
  parseNewsSourceInput,
  strictNewsObject,
  uuid,
} from './news-validation';

@Controller('v1/news')
@UseGuards(CommunityNewsFeatureGuard)
export class NewsPublicController {
  constructor(private readonly news: NewsService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  list(
    @OptionalCurrentUserId() viewerId: string | null,
    @Query() query: Record<string, unknown>,
  ) {
    const allowed = ['feed', 'profession', 'topic', 'cursor'];
    if (Object.keys(query).some((key) => !allowed.includes(key))) {
      throw new BadRequestException({ code: 'INVALID_NEWS_FILTER' });
    }
    const feed = query.feed === undefined ? 'latest' : query.feed;
    if (feed !== 'latest' && feed !== 'for_you') {
      throw new BadRequestException({ code: 'INVALID_NEWS_FEED' });
    }
    const profession = this.filterValue(query.profession, 'profession');
    if (
      profession &&
      !NEWS_PROFESSION_TAGS.includes(
        profession as (typeof NEWS_PROFESSION_TAGS)[number],
      )
    ) {
      throw new BadRequestException({ code: 'INVALID_NEWS_PROFESSION' });
    }
    const topic = this.filterValue(query.topic, 'topic');
    if (topic && !/^[\p{L}\p{N}_-]{1,30}$/u.test(topic)) {
      throw new BadRequestException({ code: 'INVALID_NEWS_TOPIC' });
    }
    return this.news.listPublic(viewerId, {
      feed,
      ...(profession ? { profession } : {}),
      ...(topic ? { topic } : {}),
      ...(typeof query.cursor === 'string' ? { cursor: query.cursor } : {}),
    });
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  detail(@Param('id') id: string) {
    return this.news.getPublic(uuid(id, 'newsId'));
  }

  @Put(':id/negative-feedback')
  @UseGuards(JwtAuthGuard)
  feedback(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') rawKey?: string,
  ) {
    const value = strictNewsObject(body, ['reason']);
    return this.news.negativeFeedback(
      userId,
      uuid(id, 'newsId'),
      newsFeedbackReason(value.reason),
      idempotencyKey(rawKey),
    );
  }

  private filterValue(value: unknown, field: string): string | undefined {
    if (value === undefined || value === '') return undefined;
    if (typeof value !== 'string' || value.length > 100) {
      throw new BadRequestException({ code: 'INVALID_NEWS_FILTER', field });
    }
    return value.trim().toLocaleLowerCase('zh-CN');
  }
}

@Controller('v1/me/news-preferences')
@UseGuards(CommunityNewsFeatureGuard, JwtAuthGuard)
export class NewsPreferenceController {
  constructor(private readonly news: NewsService) {}

  @Get()
  get(@CurrentUserId() userId: string) {
    return this.news.getPreferences(userId);
  }

  @Put()
  update(
    @CurrentUserId() userId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') rawKey?: string,
    @Headers('if-match') ifMatch?: string,
  ) {
    const value = strictNewsObject(body, [
      'personalizationEnabled',
      'topicPreferences',
      'expectedVersion',
    ]);
    if (typeof value.personalizationEnabled !== 'boolean') {
      throw new BadRequestException({ code: 'INVALID_NEWS_PERSONALIZATION_SETTING' });
    }
    return this.news.updatePreferences(
      userId,
      value.personalizationEnabled,
      newsTopicPreferences(value.topicPreferences),
      this.resolveVersion(ifMatch, value.expectedVersion, true),
      idempotencyKey(rawKey),
    );
  }

  private resolveVersion(
    ifMatch: string | undefined,
    bodyVersion: unknown,
    allowNull: boolean,
  ): number | null {
    if (allowNull && !ifMatch && (bodyVersion === undefined || bodyVersion === null)) {
      return null;
    }
    return expectedVersion(ifMatch, bodyVersion);
  }
}

@Controller('v1/admin/news')
@UseGuards(NewsAdminFeatureGuard, JwtAuthGuard, CommunityRbacGuard)
export class NewsAdminController {
  constructor(private readonly news: NewsService) {}

  @Get('sources')
  sources(@CurrentUserId() userId: string) {
    return this.news.listSources(userId);
  }

  @Post('sources')
  createSource(
    @CurrentUserId() userId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') rawKey?: string,
  ) {
    return this.news.createSource(
      userId,
      parseNewsSourceInput(body),
      idempotencyKey(rawKey),
    );
  }

  @Put('sources/:id')
  updateSource(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') rawKey?: string,
    @Headers('if-match') ifMatch?: string,
  ) {
    const raw = strictNewsObject(body, [
      'name',
      'sourceType',
      'homepageUrl',
      'trustRank',
      'authorizationStatus',
      'authorizationEvidenceRef',
      'authorizationValidFrom',
      'authorizationValidUntil',
      'expectedVersion',
    ]);
    return this.news.updateSource(
      userId,
      uuid(id, 'sourceId'),
      parseNewsSourceInput(raw),
      expectedVersion(ifMatch, raw.expectedVersion),
      idempotencyKey(rawKey),
    );
  }

  @Get('articles')
  listArticles(
    @CurrentUserId() userId: string,
    @Query() query: Record<string, unknown>,
  ) {
    if (Object.keys(query).some((key) => key !== 'status' && key !== 'cursor')) {
      throw new BadRequestException({ code: 'INVALID_NEWS_ADMIN_FILTER' });
    }
    const status = query.status;
    if (
      status !== undefined &&
      !['draft', 'pending_review', 'published', 'withdrawn'].includes(String(status))
    ) {
      throw new BadRequestException({ code: 'INVALID_NEWS_STATUS' });
    }
    return this.news.listAdminArticles(userId, {
      ...(status ? { status: status as 'draft' | 'pending_review' | 'published' | 'withdrawn' } : {}),
      ...(typeof query.cursor === 'string' ? { cursor: query.cursor } : {}),
    });
  }

  @Get('articles/:id')
  article(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.news.getAdminArticle(userId, uuid(id, 'newsId'));
  }

  @Post('articles')
  createDraft(
    @CurrentUserId() userId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') rawKey?: string,
  ) {
    return this.news.createDraft(
      userId,
      parseNewsRevisionInput(body),
      idempotencyKey(rawKey),
    );
  }

  @Patch('articles/:id')
  revise(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') rawKey?: string,
    @Headers('if-match') ifMatch?: string,
  ) {
    const raw = strictNewsObject(body, [
      'sourceId',
      'originalTitle',
      'summary',
      'originalUrl',
      'originalPublishedAt',
      'professionTags',
      'topicTags',
      'correctionNote',
      'expectedVersion',
    ]);
    return this.news.reviseDraft(
      userId,
      uuid(id, 'newsId'),
      parseNewsRevisionInput(raw),
      expectedVersion(ifMatch, raw.expectedVersion),
      idempotencyKey(rawKey),
    );
  }

  @Post('articles/:id/submit')
  submit(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') rawKey?: string,
    @Headers('if-match') ifMatch?: string,
  ) {
    const raw = strictNewsObject(body, ['expectedVersion']);
    return this.news.submitForReview(
      userId,
      uuid(id, 'newsId'),
      expectedVersion(ifMatch, raw.expectedVersion),
      idempotencyKey(rawKey),
    );
  }

  @Post('articles/:id/reviews')
  review(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') rawKey?: string,
    @Headers('if-match') ifMatch?: string,
  ) {
    const raw = strictNewsObject(body, ['decision', 'reason', 'expectedVersion']);
    if (raw.decision !== 'approved' && raw.decision !== 'rejected') {
      throw new BadRequestException({ code: 'INVALID_NEWS_REVIEW_DECISION' });
    }
    return this.news.review(
      userId,
      uuid(id, 'newsId'),
      raw.decision,
      boundedReason(raw.reason, 'NEWS_REVIEW_REASON_REQUIRED'),
      expectedVersion(ifMatch, raw.expectedVersion),
      idempotencyKey(rawKey),
    );
  }

  /** Explicit publish alias; it still performs the same independent-review checks. */
  @Post('articles/:id/publish')
  publish(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') rawKey?: string,
    @Headers('if-match') ifMatch?: string,
  ) {
    const raw = strictNewsObject(body, ['reason', 'expectedVersion']);
    return this.news.review(
      userId,
      uuid(id, 'newsId'),
      'approved',
      boundedReason(raw.reason, 'NEWS_REVIEW_REASON_REQUIRED'),
      expectedVersion(ifMatch, raw.expectedVersion),
      idempotencyKey(rawKey),
    );
  }

  @Post('articles/:id/withdraw')
  withdraw(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') rawKey?: string,
    @Headers('if-match') ifMatch?: string,
  ) {
    const raw = strictNewsObject(body, ['reason', 'expectedVersion']);
    return this.news.withdraw(
      userId,
      uuid(id, 'newsId'),
      boundedReason(raw.reason, 'NEWS_WITHDRAWAL_REASON_REQUIRED'),
      expectedVersion(ifMatch, raw.expectedVersion),
      idempotencyKey(rawKey),
    );
  }
}
