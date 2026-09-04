import type { CommunityAuthUser } from './community-auth';
import { communityHttp } from './community-http';

export type CommunityPrivacyLevel = 'everyone' | 'friends' | 'self';

export interface CommunityPrivacySettings {
  equipment: CommunityPrivacyLevel;
  battleRecord: CommunityPrivacyLevel;
  plant: CommunityPrivacyLevel;
  honors: CommunityPrivacyLevel;
  friendCount: CommunityPrivacyLevel;
  recentActivity: CommunityPrivacyLevel;
}

export const DEFAULT_COMMUNITY_PRIVACY: CommunityPrivacySettings = {
  equipment: 'friends',
  battleRecord: 'friends',
  plant: 'friends',
  honors: 'friends',
  friendCount: 'self',
  recentActivity: 'self',
};

export interface CommunityProfile extends CommunityAuthUser {
  bio?: string | null;
  privacy?: Partial<CommunityPrivacySettings>;
  battleLevel?: number;
  honors?: string[];
}

export type CommunityRelationshipStatus =
  | 'self'
  | 'none'
  | 'incoming_pending'
  | 'outgoing_pending'
  | 'friend'
  | 'blocked_by_me'
  | 'unavailable';

export interface CommunityPublicEquipment {
  slot: string;
  name: string;
  rarity: string;
  level: number;
}

export interface CommunityPublicPlant {
  name: string;
  appearanceKey: string;
  careStreak: number;
  state?: 'idle' | 'growing' | 'ready';
}

export interface CommunityPublicProfile {
  publicId: string;
  username?: string | null;
  displayName: string;
  avatarKey: string;
  battleProfession: string;
  bio?: string | null;
  ipRegion?: string | null;
  battleLevel?: number;
  equipment?: CommunityPublicEquipment[];
  honors?: string[];
  plant?: CommunityPublicPlant | null;
  friendCount?: number;
  recentActivity?: Array<{
    id: string;
    summary: string;
    createdAt: string;
  }>;
  relationship: {
    status: CommunityRelationshipStatus;
    requestId?: string | null;
    canRequest: boolean;
    canFeed: boolean;
    canEncouragePlant: boolean;
    canBlock: boolean;
  };
}

export interface UpdateCommunityProfilePayload {
  displayName: string;
  bio: string;
  avatarKey: string;
  battleProfession: string;
  onboardingCompleted?: boolean;
}

export function getMyCommunityProfile(): Promise<CommunityProfile> {
  return communityHttp.get('/v1/me');
}

export function updateMyCommunityProfile(
  payload: Partial<UpdateCommunityProfilePayload>,
): Promise<CommunityProfile> {
  return communityHttp.patch('/v1/me/profile', payload);
}

export function updateMyCommunityPrivacy(
  privacy: CommunityPrivacySettings,
): Promise<CommunityProfile> {
  return communityHttp.patch('/v1/me/privacy', { privacy });
}

export function getCommunityPublicProfile(
  publicId: string,
): Promise<CommunityPublicProfile> {
  return communityHttp.get(`/v1/users/${encodeURIComponent(publicId)}`);
}

export async function findCommunityUser(
  identifier: string,
): Promise<CommunityPublicProfile | null> {
  const value = identifier.trim();
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const page = await communityHttp.get<{ items: CommunityPublicProfile[] }>(
    '/v1/users/search',
    { query: uuid.test(value)
      ? { publicId: value }
      : { username: value.replace(/^@/, '') } },
  );
  return page.items[0] ?? null;
}

export const communityProfileApi = {
  getMe: getMyCommunityProfile,
  updateProfile: updateMyCommunityProfile,
  updatePrivacy: updateMyCommunityPrivacy,
  getPublic: getCommunityPublicProfile,
  findUser: findCommunityUser,
};
