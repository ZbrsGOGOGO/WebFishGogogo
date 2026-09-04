type SiteMode = 'full' | 'public' | 'review' | 'community';

function clean(value: string | undefined): string {
  return value?.trim() ?? '';
}

const configuredMode = import.meta.env.VITE_SITE_MODE;

export const SITE_MODE: SiteMode =
  configuredMode === 'review' ||
  configuredMode === 'public' ||
  configuredMode === 'community'
    ? configuredMode
    : 'full';

export const IS_REVIEW_MODE = SITE_MODE === 'review';
export const IS_PUBLIC_MODE = SITE_MODE === 'public';
export const IS_COMMUNITY_MODE = SITE_MODE === 'community';
export const IS_PUBLIC_SITE = SITE_MODE !== 'full';
export const SITE_NAME = clean(import.meta.env.VITE_SITE_NAME) || '摸摸公司';
export const SITE_OPERATOR = clean(import.meta.env.VITE_SITE_OPERATOR);
export const SITE_CONTACT = clean(import.meta.env.VITE_SITE_CONTACT);
export const SITE_DOMAIN = clean(import.meta.env.VITE_SITE_DOMAIN);

export const SITE_META_DESCRIPTION = IS_PUBLIC_MODE
  ? `${SITE_NAME}：办公室主题轻社区，提供可操控角色的工位塔防、浏览器工具与轻量单机游戏。`
  : IS_COMMUNITY_MODE
    ? `${SITE_NAME}：围绕职业经验、工位塔防、工位绿植与好友互动的轻社区。`
  : IS_REVIEW_MODE
    ? `${SITE_NAME}：无需注册即可使用的浏览器本地效率工具。`
    : `${SITE_NAME}：集私人文档阅读、实用工具、成长农场与单机小游戏于一体的个人工作台。`;

export function contactHref(contact = SITE_CONTACT): string | undefined {
  if (/^https:\/\/[^\s]+$/i.test(contact)) {
    return contact;
  }

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
    return `mailto:${contact}`;
  }

  if (/^\+?[\d\s-]{7,20}$/.test(contact)) {
    return `tel:${contact.replace(/[\s-]/g, '')}`;
  }

  return undefined;
}
