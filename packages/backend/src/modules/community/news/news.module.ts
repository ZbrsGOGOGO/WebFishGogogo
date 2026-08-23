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
  OfficeBattleProfile,
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
      NewsArticle,
      NewsArticleRevision,
      NewsNegativeFeedback,
      NewsReviewDecision,
      NewsSource,
      NewsUserPreference,
      OfficeBattleProfile,
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
    CommunityNewsFeatureGuard,
    NewsAdminFeatureGuard,
    CommunityRbacGuard,
    { provide: COMMUNITY_CLOCK, useValue: systemCommunityClock },
  ],
  exports: [NewsService, HotNewsService],
})
export class NewsModule {}
