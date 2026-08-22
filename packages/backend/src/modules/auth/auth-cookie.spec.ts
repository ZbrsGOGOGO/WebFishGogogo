import {
  assertTrustedCookieOrigin,
  readRefreshCookie,
  refreshCookieName,
  refreshCookieOptions,
} from './auth-cookie';

describe('auth refresh cookie security', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('uses a __Host cookie with Secure, Path=/ and strict SameSite in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.LOCAL_DEV = 'false';
    delete process.env.AUTH_REFRESH_COOKIE_NAME;

    expect(refreshCookieName()).toBe('__Host-zbrs_refresh');
    expect(refreshCookieOptions()).toEqual(
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/',
      }),
    );
    expect(readRefreshCookie('__Host-zbrs_refresh=opaque')).toBe('opaque');
  });

  it('requires an exact production Origin configured by PUBLIC_SITE_ORIGIN', () => {
    process.env.NODE_ENV = 'production';
    process.env.LOCAL_DEV = 'false';
    process.env.PUBLIC_SITE_ORIGIN = 'https://zbrshyyzxx.top';

    expect(() =>
      assertTrustedCookieOrigin('https://zbrshyyzxx.top'),
    ).not.toThrow();
    expect(() =>
      assertTrustedCookieOrigin('https://evil.example'),
    ).toThrow();
    expect(() => assertTrustedCookieOrigin(undefined)).toThrow();
  });

  it('rejects a __Host cookie configuration outside HTTPS production', () => {
    process.env.NODE_ENV = 'test';
    process.env.LOCAL_DEV = 'true';
    process.env.AUTH_REFRESH_COOKIE_NAME = '__Host-zbrs_refresh';
    expect(() => refreshCookieOptions()).toThrow();
  });
});
