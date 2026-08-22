import { communityHttp } from './community-http';

export type CommunityNotificationCategory =
  | 'security'
  | 'system'
  | 'reply'
  | 'friend'
  | 'feed'
  | 'invite'
  | 'farm'
  | 'battle';

export interface CommunityNotification {
  id: string;
  category: CommunityNotificationCategory;
  title: string;
  summary: string;
  createdAt: string;
  readAt: string | null;
  resourcePath?: string | null;
}

export interface CommunityNotificationPage {
  items: CommunityNotification[];
  unreadCount: number;
  nextCursor: string | null;
}

export function getCommunityNotifications(
  cursor?: string,
): Promise<CommunityNotificationPage> {
  return communityHttp.get('/v1/notifications', { query: { cursor } });
}

export function readCommunityNotification(id: string): Promise<void> {
  return communityHttp.put(`/v1/notifications/${encodeURIComponent(id)}/read`);
}

export function readAllCommunityNotifications(): Promise<void> {
  return communityHttp.put('/v1/notifications/read-all');
}

export function readCommunityNotificationsByCategory(
  category: CommunityNotificationCategory,
): Promise<void> {
  return communityHttp.put(
    '/v1/notifications/read-by-category',
    { category },
    { retryAfterRefresh: false },
  );
}

export const communityNotificationsApi = {
  list: getCommunityNotifications,
  read: readCommunityNotification,
  readAll: readAllCommunityNotifications,
  readByCategory: readCommunityNotificationsByCategory,
};
