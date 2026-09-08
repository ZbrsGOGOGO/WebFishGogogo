import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  CommunityCommandReceipt,
  HotNewsHeadline,
  HotNewsRefreshRun,
  NewsArticle,
  NewsArticleRevision,
  NewsNegativeFeedback,
  NewsReviewDecision,
  NewsSource,
  NewsUserPreference,
  PlayerProfile,
} from '../../../database/entities';
import { AuthModule } from '../../auth/auth.module';
import { COMMUNITY_CLOCK, systemCommunityClock } from '../community-clock';
import { CommunityRbacGuard } from '../community-rbac.guard';
import {
  NewsAdminController,
  NewsPreferenceController,
  NewsPublicController,
} from './news.controller';
import {
  CommunityNewsFeatureGuard,
  NewsAdminFeatureGuard,
} from './news-gates';
import { NewsService } from './news.service';
import { HotNewsService } from './hot-news.service';
import {
  TRENDING_NEWS_FETCH,
  TrendingNewsService,
} from './trending-news.service';
import {
  TrendingNewsBoardRun,
  TrendingNewsItemRecord,
} from '../../../database/entities/trending-news.entity';

/**
 * Editorial news is intentionally isolated from the daily official-RSS headline
 * index and the legacy outbox pump. The headline index stores no article body;
 * editorial articles still require independent review before publication.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      CommunityCommandReceipt,
      HotNewsHeadline,
      HotNewsRefreshRun,
      TrendingNewsBoardRun,
      TrendingNewsItemRecord,
      NewsArticle,
      NewsArticleRevision,
      NewsNegativeFeedback,
      NewsReviewDecision,
      NewsSource,
      NewsUserPreference,
      PlayerProfile,
    ]),
    AuthModule,
  ],
  controllers: [
    NewsPublicController,
    NewsPreferenceController,
    NewsAdminController,
  ],
  providers: [
    NewsService,
    HotNewsService,
    TrendingNewsService,
    {
      provide: TRENDING_NEWS_FETCH,
      useFactory: () => globalThis.fetch.bind(globalThis),
    },
    CommunityNewsFeatureGuard,
    NewsAdminFeatureGuard,
    CommunityRbacGuard,
    { provide: COMMUNITY_CLOCK, useValue: systemCommunityClock },
  ],
  exports: [NewsService, HotNewsService, TrendingNewsService],
})
export class NewsModule {}
