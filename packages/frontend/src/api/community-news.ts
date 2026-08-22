import { communityHttp } from './community-http';
import { communityIdempotencyHeaders } from './community-idempotency';

export const COMMUNITY_NEWS_PROFESSIONS = [
  'developer',
  'product',
  'qa',
  'sales',
  'hr',
] as const;

export type CommunityNewsProfession = typeof COMMUNITY_NEWS_PROFESSIONS[number];
export type CommunityNewsFeed = 'latest' | 'for_you';
export type CommunityNewsFeedbackReason =
  | 'not_interested'
  | 'not_relevant'
  | 'seen_too_often'
  | 'source_not_preferred';

export interface CommunityNewsPublishedItem {
  id: string;
  status: 'published';
  summary: string;
  source: { name: string };
  originalPublishedAt: string;
  originalUrl: string;
  publishedAt: string;
  lastCorrectedAt: string | null;
  correctionNote: string | null;
  discussion: {
    commentsEnabled: false;
    createPostPath: string;
  };
}

export interface CommunityNewsUnavailableItem {
  id: string;
  status: 'withdrawn' | 'unavailable';
  notice: string;
  withdrawnAt: string | null;
}

export type CommunityNewsDetail =
  | CommunityNewsPublishedItem
  | CommunityNewsUnavailableItem;

export interface CommunityNewsPage {
  feed: CommunityNewsFeed;
  personalized: boolean;
  items: CommunityNewsPublishedItem[];
  nextCursor: string | null;
}

export interface CommunityNewsListFilters {
  feed?: CommunityNewsFeed;
  profession?: CommunityNewsProfession;
  topic?: string;
  cursor?: string;
}

export interface CommunityNewsPreferences {
  personalizationEnabled: boolean;
  topicPreferences: string[];
  selectedProfession: CommunityNewsProfession | null;
  version: number | null;
}

export type CommunityNewsSourceType = 'owned' | 'official' | 'licensed';
export type CommunityNewsAuthorizationStatus = 'verified' | 'revoked' | 'expired';
export type CommunityNewsArticleStatus =
  | 'draft'
  | 'pending_review'
  | 'published'
  | 'withdrawn';

export interface CommunityNewsAdminSource {
  id: string;
  name: string;
  sourceType: CommunityNewsSourceType;
  homepageUrl: string;
  trustRank: number;
  authorizationStatus: CommunityNewsAuthorizationStatus;
  authorizationEvidenceRef: string;
  authorizationValidFrom: string | null;
  authorizationValidUntil: string | null;
  authorizationRevokedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type CommunityNewsEditorSource = Omit<
  CommunityNewsAdminSource,
  'authorizationEvidenceRef'
>;

export interface CommunityNewsRevision {
  version: number;
  originalTitle: string;
  summary: string;
  originalUrl: string;
  originalPublishedAt: string;
  professionTags: CommunityNewsProfession[];
  topicTags: string[];
  correctionNote: string | null;
  createdAt: string;
}

export interface CommunityNewsAdminArticle {
  id: string;
  status: CommunityNewsArticleStatus;
  version: number;
  source: CommunityNewsEditorSource;
  currentRevision: CommunityNewsRevision;
  publishedRevision: CommunityNewsRevision | null;
  pendingRevision: CommunityNewsRevision | null;
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

export interface CommunityNewsSourceInput {
  name: string;
  sourceType: CommunityNewsSourceType;
  homepageUrl: string;
  trustRank: number;
  authorizationStatus: CommunityNewsAuthorizationStatus;
  authorizationEvidenceRef: string;
  authorizationValidFrom: string | null;
  authorizationValidUntil: string | null;
}

export interface CommunityNewsRevisionInput {
  sourceId: string;
  originalTitle: string;
  summary: string;
  originalUrl: string;
  originalPublishedAt: string;
  professionTags: CommunityNewsProfession[];
  topicTags: string[];
  correctionNote: string | null;
}

function expectedVersionHeaders(
  expectedVersion: number,
  idempotencyKey: string,
): HeadersInit {
  return {
    ...communityIdempotencyHeaders(idempotencyKey),
    'If-Match': `\"${expectedVersion}\"`,
  };
}

export function getCommunityNews(
  filters: CommunityNewsListFilters = {},
): Promise<CommunityNewsPage> {
  return communityHttp.get('/v1/news', {
    query: {
      feed: filters.feed,
      profession: filters.profession,
      topic: filters.topic,
      cursor: filters.cursor,
    },
  });
}

export function getCommunityNewsDetail(id: string): Promise<CommunityNewsDetail> {
  return communityHttp.get(`/v1/news/${encodeURIComponent(id)}`);
}

export function putCommunityNewsNegativeFeedback(
  id: string,
  reason: CommunityNewsFeedbackReason,
  idempotencyKey: string,
): Promise<{
  acknowledged: true;
  articleId: string;
  reason: CommunityNewsFeedbackReason;
}> {
  return communityHttp.put(
    `/v1/news/${encodeURIComponent(id)}/negative-feedback`,
    { reason },
    {
      headers: communityIdempotencyHeaders(idempotencyKey),
      retryAfterRefresh: false,
    },
  );
}

export function getCommunityNewsPreferences(): Promise<CommunityNewsPreferences> {
  return communityHttp.get('/v1/me/news-preferences');
}

export function putCommunityNewsPreferences(
  payload: Pick<
    CommunityNewsPreferences,
    'personalizationEnabled' | 'topicPreferences'
  > & { expectedVersion: number | null },
  idempotencyKey: string,
): Promise<CommunityNewsPreferences> {
  const headers = new Headers(communityIdempotencyHeaders(idempotencyKey));
  if (payload.expectedVersion != null) {
    headers.set('If-Match', `\"${payload.expectedVersion}\"`);
  }
  return communityHttp.put('/v1/me/news-preferences', payload, {
    headers,
    retryAfterRefresh: false,
  });
}

export function getCommunityNewsAdminSources(): Promise<{
  items: CommunityNewsAdminSource[];
}> {
  return communityHttp.get('/v1/admin/news/sources');
}

export function createCommunityNewsAdminSource(
  payload: CommunityNewsSourceInput,
  idempotencyKey: string,
): Promise<CommunityNewsAdminSource> {
  return communityHttp.post('/v1/admin/news/sources', payload, {
    headers: communityIdempotencyHeaders(idempotencyKey),
    retryAfterRefresh: false,
  });
}

export function updateCommunityNewsAdminSource(
  id: string,
  payload: CommunityNewsSourceInput,
  expectedVersion: number,
  idempotencyKey: string,
): Promise<CommunityNewsAdminSource> {
  return communityHttp.put(
    `/v1/admin/news/sources/${encodeURIComponent(id)}`,
    { ...payload, expectedVersion },
    {
      headers: expectedVersionHeaders(expectedVersion, idempotencyKey),
      retryAfterRefresh: false,
    },
  );
}

export function getCommunityNewsAdminArticles(filters: {
  status?: CommunityNewsArticleStatus;
  cursor?: string;
} = {}): Promise<{
  items: CommunityNewsAdminArticle[];
  nextCursor: string | null;
}> {
  return communityHttp.get('/v1/admin/news/articles', { query: filters });
}

export function getCommunityNewsAdminArticle(
  id: string,
): Promise<CommunityNewsAdminArticle> {
  return communityHttp.get(`/v1/admin/news/articles/${encodeURIComponent(id)}`);
}

export function createCommunityNewsAdminDraft(
  payload: CommunityNewsRevisionInput,
  idempotencyKey: string,
): Promise<CommunityNewsAdminArticle> {
  return communityHttp.post('/v1/admin/news/articles', payload, {
    headers: communityIdempotencyHeaders(idempotencyKey),
    retryAfterRefresh: false,
  });
}

export function reviseCommunityNewsAdminDraft(
  id: string,
  payload: CommunityNewsRevisionInput,
  expectedVersion: number,
  idempotencyKey: string,
): Promise<CommunityNewsAdminArticle> {
  return communityHttp.patch(
    `/v1/admin/news/articles/${encodeURIComponent(id)}`,
    { ...payload, expectedVersion },
    {
      headers: expectedVersionHeaders(expectedVersion, idempotencyKey),
      retryAfterRefresh: false,
    },
  );
}

function articleVersionCommand(
  path: string,
  body: Record<string, unknown>,
  expectedVersion: number,
  idempotencyKey: string,
): Promise<CommunityNewsAdminArticle> {
  return communityHttp.post(
    path,
    { ...body, expectedVersion },
    {
      headers: expectedVersionHeaders(expectedVersion, idempotencyKey),
      retryAfterRefresh: false,
    },
  );
}

export function submitCommunityNewsAdminArticle(
  id: string,
  expectedVersion: number,
  idempotencyKey: string,
): Promise<CommunityNewsAdminArticle> {
  return articleVersionCommand(
    `/v1/admin/news/articles/${encodeURIComponent(id)}/submit`,
    {},
    expectedVersion,
    idempotencyKey,
  );
}

export function reviewCommunityNewsAdminArticle(
  id: string,
  decision: 'approved' | 'rejected',
  reason: string,
  expectedVersion: number,
  idempotencyKey: string,
): Promise<CommunityNewsAdminArticle> {
  return articleVersionCommand(
    `/v1/admin/news/articles/${encodeURIComponent(id)}/reviews`,
    { decision, reason },
    expectedVersion,
    idempotencyKey,
  );
}

export function publishCommunityNewsAdminArticle(
  id: string,
  reason: string,
  expectedVersion: number,
  idempotencyKey: string,
): Promise<CommunityNewsAdminArticle> {
  return articleVersionCommand(
    `/v1/admin/news/articles/${encodeURIComponent(id)}/publish`,
    { reason },
    expectedVersion,
    idempotencyKey,
  );
}

export function withdrawCommunityNewsAdminArticle(
  id: string,
  reason: string,
  expectedVersion: number,
  idempotencyKey: string,
): Promise<CommunityNewsAdminArticle> {
  return articleVersionCommand(
    `/v1/admin/news/articles/${encodeURIComponent(id)}/withdraw`,
    { reason },
    expectedVersion,
    idempotencyKey,
  );
}

export const communityNewsApi = {
  list: getCommunityNews,
  get: getCommunityNewsDetail,
  giveNegativeFeedback: putCommunityNewsNegativeFeedback,
  getPreferences: getCommunityNewsPreferences,
  updatePreferences: putCommunityNewsPreferences,
  listSources: getCommunityNewsAdminSources,
  createSource: createCommunityNewsAdminSource,
  updateSource: updateCommunityNewsAdminSource,
  listAdminArticles: getCommunityNewsAdminArticles,
  getAdminArticle: getCommunityNewsAdminArticle,
  createDraft: createCommunityNewsAdminDraft,
  reviseDraft: reviseCommunityNewsAdminDraft,
  submitArticle: submitCommunityNewsAdminArticle,
  reviewArticle: reviewCommunityNewsAdminArticle,
  publishArticle: publishCommunityNewsAdminArticle,
  withdrawArticle: withdrawCommunityNewsAdminArticle,
};
