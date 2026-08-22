import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';

export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1_000;

export interface CookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'strict' | 'lax' | 'none';
  path?: string;
  maxAge?: number;
}

export interface AuthCookieResponse {
  cookie(name: string, value: string, options: CookieOptions): void;
  clearCookie(name: string, options: CookieOptions): void;
}

export function refreshCookieName(): string {
  const configured = process.env.AUTH_REFRESH_COOKIE_NAME?.trim();
  const name =
    configured ||
    (process.env.NODE_ENV === 'production'
      ? '__Host-zbrs_refresh'
      : 'zbrs_refresh');
  if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) {
    throw new ServiceUnavailableException({
      code: 'REFRESH_COOKIE_NAME_INVALID',
    });
  }
  return name;
}

export function refreshCookieOptions(maxAge = REFRESH_TOKEN_TTL_MS): CookieOptions {
  const secure = process.env.NODE_ENV === 'production';
  const name = refreshCookieName();
  if (name.startsWith('__Host-') && !secure) {
    throw new ServiceUnavailableException({
      code: 'HOST_COOKIE_REQUIRES_HTTPS',
    });
  }
  return {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    // __Host- Cookie 必须 Path=/ 且不能设置 Domain。
    path: '/',
    maxAge,
  };
}

export function readRefreshCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  const expectedName = refreshCookieName();
  for (const entry of cookieHeader.split(';')) {
    const separator = entry.indexOf('=');
    if (separator < 0) continue;
    const name = entry.slice(0, separator).trim();
    if (name !== expectedName) continue;
    const value = entry.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * refresh/logout 依赖浏览器 Cookie，必须额外验证 Origin。生产缺少站点来源配置时
 * fail-closed；本地允许无 Origin 的单元测试及 localhost/127.0.0.1 开发页。
 */
export function assertTrustedCookieOrigin(origin: string | undefined): void {
  if (process.env.LOCAL_DEV === 'true') {
    if (!origin) return;
    const parsed = parseOrigin(origin);
    if (
      parsed &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
    ) {
      return;
    }
    const configuredLocal = process.env.PUBLIC_SITE_ORIGIN;
    if (configuredLocal && parsed?.origin === parseOrigin(configuredLocal)?.origin) {
      return;
    }
    throw new ForbiddenException({ code: 'UNTRUSTED_ORIGIN' });
  }

  const configured = process.env.PUBLIC_SITE_ORIGIN;
  const expected = configured ? parseOrigin(configured) : null;
  if (!expected) {
    throw new ServiceUnavailableException({
      code: 'PUBLIC_SITE_ORIGIN_NOT_CONFIGURED',
    });
  }
  const actual = origin ? parseOrigin(origin) : null;
  if (!actual || actual.origin !== expected.origin) {
    throw new ForbiddenException({ code: 'UNTRUSTED_ORIGIN' });
  }
}

function parseOrigin(value: string): URL | null {
  try {
    const parsed = new URL(value);
    if (parsed.username || parsed.password) return null;
    return parsed;
  } catch {
    return null;
  }
}
