import { buildJwtConfig } from './jwt.config';

describe('buildJwtConfig', () => {
  it('keeps a zero-config development fallback', () => {
    expect(buildJwtConfig({ NODE_ENV: 'development' }).secret).toBe(
      'dev-insecure-secret-change-me',
    );
  });

  it('rejects a missing or short production secret', () => {
    expect(() => buildJwtConfig({ NODE_ENV: 'production' })).toThrow(
      /JWT_SECRET/,
    );
    expect(() =>
      buildJwtConfig({
        NODE_ENV: 'production',
        JWT_SECRET: 'too-short',
      }),
    ).toThrow(/JWT_SECRET/);
  });

  it('accepts an explicit strong production secret', () => {
    const secret = 'a-strong-production-secret-with-32-plus-chars';
    expect(
      buildJwtConfig({
        NODE_ENV: 'production',
        JWT_SECRET: secret,
      }).secret,
    ).toBe(secret);
  });

  it('validates and normalizes the access-token lifetime', () => {
    expect(
      buildJwtConfig({
        NODE_ENV: 'development',
        JWT_ACCESS_EXPIRES_IN: '900',
      }).signOptions?.expiresIn,
    ).toBe(900);
    expect(() =>
      buildJwtConfig({
        NODE_ENV: 'development',
        JWT_ACCESS_EXPIRES_IN: 'forever',
      }),
    ).toThrow(/JWT_ACCESS_EXPIRES_IN/);
  });
});
