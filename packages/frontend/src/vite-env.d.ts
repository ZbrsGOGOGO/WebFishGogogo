/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_AFDIAN_PAGE_URL?: string;
  readonly VITE_SITE_MODE?: string;
  readonly VITE_COMMUNITY_REGISTRATION_ENABLED?: string;
  readonly VITE_COMMUNITY_PASSWORD_RESET_ENABLED?: string;
  readonly VITE_COMMUNITY_SOCIAL_VERIFICATION_ENABLED?: string;
  readonly VITE_COMMUNITY_ACCOUNT_DELETION_ENABLED?: string;
  readonly VITE_COMMUNITY_TOWER_DEFENSE_ENABLED?: string;
  readonly VITE_COMMUNITY_LEDOU_ENABLED?: string;
  readonly VITE_COMMUNITY_BATTLE_SERVER_ENABLED?: string;
  readonly VITE_COMMUNITY_PROFILE_ENABLED?: string;
  readonly VITE_COMMUNITY_PUBLIC_PROFILE_ENABLED?: string;
  readonly VITE_COMMUNITY_FRIENDS_ENABLED?: string;
  readonly VITE_COMMUNITY_INVITE_ENABLED?: string;
  readonly VITE_COMMUNITY_FEED_ENABLED?: string;
  readonly VITE_COMMUNITY_FARM_ENABLED?: string;
  readonly VITE_COMMUNITY_CONTENT_ENABLED?: string;
  readonly VITE_COMMUNITY_MODERATION_ENABLED?: string;
  readonly VITE_COMMUNITY_CHAT_ENABLED?: string;
  readonly VITE_COMMUNITY_NEWS_ENABLED?: string;
  readonly VITE_COMMUNITY_NEWS_ADMIN_ENABLED?: string;
  readonly VITE_SITE_NAME?: string;
  readonly VITE_SITE_OPERATOR?: string;
  readonly VITE_SITE_CONTACT?: string;
  readonly VITE_SITE_DOMAIN?: string;
  readonly VITE_ICP_BEIAN_NUMBER?: string;
  readonly VITE_PUBLIC_SECURITY_BEIAN_NUMBER?: string;
  readonly VITE_PUBLIC_SECURITY_BEIAN_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
