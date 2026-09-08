import { describe, expect, it } from 'vitest';
import { loginDestination } from './login-destination';

describe('login destination', () => {
  it('preserves the protected page filter and anchor', () => {
    expect(loginDestination({ pathname: '/leaderboards', search: '?tab=games', hash: '#rail' })).toBe('/leaderboards?tab=games#rail');
    expect(loginDestination({ pathname: '/games/rail' })).toBe('/games/rail');
  });
  it.each([undefined, null, {}, { pathname: '//example.invalid' }, { pathname: '/\\example.invalid' }, { pathname: 'https://example.invalid' }, { pathname: '/login\n' }, { pathname: '/', search: 'invalid' }, { pathname: '/', hash: 3 }])('rejects malformed or off-site route state %j', (value) => {
    expect(loginDestination(value)).toBe('/');
  });
});
