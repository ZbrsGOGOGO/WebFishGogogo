import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  CommunityCommandReceipt,
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

/**
 * Editorial news is intentionally isolated from legacy feeds and the outbox pump.
 * It stores only reviewed summaries and source links; it never crawls or mirrors articles.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      CommunityCommandReceipt,
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
    CommunityNewsFeatureGuard,
    NewsAdminFeatureGuard,
    CommunityRbacGuard,
    { provide: COMMUNITY_CLOCK, useValue: systemCommunityClock },
  ],
  exports: [NewsService],
})
export class NewsModule {}
