/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_SITE_MODE?: string;
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
