import type {
  DevelopmentAccess,
  DevelopmentCreateInput,
  DevelopmentMember,
  DevelopmentRequestDetail,
  DevelopmentRequestPage,
  DevelopmentReviewExport,
  DevelopmentStatus,
} from '@stealth-reader/shared';

import { communityHttp } from './community-http';

const DEVELOPMENT_API = '/v1/development';

function requestPath(requestId: string): string {
  return `${DEVELOPMENT_API}/requests/${encodeURIComponent(requestId)}`;
}

export const communityDevelopmentApi = {
  getAccess: () => communityHttp.get<DevelopmentAccess>(`${DEVELOPMENT_API}/access`),

  listRequests: (status: DevelopmentStatus | undefined, page: number) =>
    communityHttp.get<DevelopmentRequestPage>(`${DEVELOPMENT_API}/requests`, {
      query: { status, page },
    }),

  createRequest: (input: DevelopmentCreateInput) =>
    communityHttp.post<DevelopmentRequestDetail>(`${DEVELOPMENT_API}/requests`, input, {
      retryAfterRefresh: false,
    }),

  getRequest: (requestId: string) =>
    communityHttp.get<DevelopmentRequestDetail>(requestPath(requestId)),

  addComment: (requestId: string, body: string, expectedVersion: number) =>
    communityHttp.post<DevelopmentRequestDetail>(
      `${requestPath(requestId)}/comments`,
      { body, expectedVersion },
      { retryAfterRefresh: false },
    ),

  decideRequest: (
    requestId: string,
    status: DevelopmentStatus,
    note: string,
    expectedVersion: number,
  ) => communityHttp.post<DevelopmentRequestDetail>(
    `${requestPath(requestId)}/decision`,
    { status, note, expectedVersion },
    { retryAfterRefresh: false },
  ),

  uploadAttachment: (requestId: string, file: File, expectedVersion: number) => {
    const form = new FormData();
    form.append('file', file);
    form.append('expectedVersion', String(expectedVersion));
    return communityHttp.post<DevelopmentRequestDetail>(
      `${requestPath(requestId)}/attachments`,
      form,
      { retryAfterRefresh: false },
    );
  },

  downloadAttachment: (requestId: string, attachmentId: string) =>
    communityHttp.get<Blob>(
      `${requestPath(requestId)}/attachments/${encodeURIComponent(attachmentId)}/content`,
      { responseType: 'blob' },
    ),

  listMembers: () => communityHttp.get<{ items: DevelopmentMember[] }>(`${DEVELOPMENT_API}/members`),

  grantMember: (username: string) => communityHttp.post<{ items: DevelopmentMember[] }>(
    `${DEVELOPMENT_API}/members`,
    { username },
    { retryAfterRefresh: false },
  ),

  revokeMember: (publicId: string) => communityHttp.delete<{ items: DevelopmentMember[] }>(
    `${DEVELOPMENT_API}/members/${encodeURIComponent(publicId)}`,
    { retryAfterRefresh: false },
  ),

  exportReview: (status?: DevelopmentStatus) => communityHttp.get<DevelopmentReviewExport>(
    `${DEVELOPMENT_API}/review-export`,
    { query: { status } },
  ),
};

