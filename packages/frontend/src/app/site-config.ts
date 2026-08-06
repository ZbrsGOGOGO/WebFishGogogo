type SiteMode = 'full' | 'review';

function clean(value: string | undefined): string {
  return value?.trim() ?? '';
}

export const SITE_MODE: SiteMode =
  import.meta.env.VITE_SITE_MODE === 'review' ? 'review' : 'full';

export const IS_REVIEW_MODE = SITE_MODE === 'review';
export const SITE_NAME = clean(import.meta.env.VITE_SITE_NAME) || 'ZBRS 技术工具工坊';
export const SITE_OPERATOR =
  clean(import.meta.env.VITE_SITE_OPERATOR) || '网站主办者信息待配置';
export const SITE_CONTACT =
  clean(import.meta.env.VITE_SITE_CONTACT) || '联系信息待配置';
export const SITE_DOMAIN = clean(import.meta.env.VITE_SITE_DOMAIN);

export const SITE_META_DESCRIPTION = IS_REVIEW_MODE
  ? `${SITE_NAME}：面向个人用户的轻量效率工作台，围绕文本整理、实用工具与日常使用场景持续完善。`
  : `${SITE_NAME}：集私人文档阅读、实用工具、成长农场与单机小游戏于一体的个人工作台。`;

export function contactHref(contact = SITE_CONTACT): string | undefined {
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
    return `mailto:${contact}`;
  }

  if (/^\+?[\d\s-]{7,20}$/.test(contact)) {
    return `tel:${contact.replace(/[\s-]/g, '')}`;
  }

  return undefined;
}
