import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMMUNITY_SYSTEM_NAV } from '../community-nav';
import {
  COMMUNITY_NAVIGATION_PREFERENCES_EVENT, communityNavigationStorageKey,
  defaultCommunityNavigationPreferences, normalizeCommunityNavigationPreferences,
  readCommunityNavigationPreferences, resetCommunityNavigationPreferences, writeCommunityNavigationPreferences,
} from './community-navigation-preferences';

const owner = 'account-a';
const preferred = { version: 1, order: ['games', 'tools'], hidden: ['news'] };
beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });

describe('account-scoped canonical community navigation preferences', () => {
  it('defaults include all canonical IDs, including disabled systems, and every call owns its arrays', () => {
    const first = defaultCommunityNavigationPreferences();
    expect(first.order).toEqual(COMMUNITY_SYSTEM_NAV.map(item => item.id));
    expect(first.hidden).toEqual([]);
    for (const item of COMMUNITY_SYSTEM_NAV.filter(item => !item.enabled)) expect(first.order).toContain(item.id);
    first.order.reverse(); first.hidden.push('home');
    expect(defaultCommunityNavigationPreferences()).toEqual({ version: 1, order: COMMUNITY_SYSTEM_NAV.map(item => item.id), hidden: [] });
  });

  it('keeps selected canonical order, appends missing IDs, deduplicates hidden IDs, and drops URLs/paths/unknowns', () => {
    const raw = { version: 1, order: ['games', 'games', '/me', 'https://evil.invalid', 'tools', '__proto__', 7, { path: '/admin' }],
      hidden: ['news', 'news', 'javascript:alert(1)', 'constructor', 'admin', '/development', 'farm'] };
    const saved = normalizeCommunityNavigationPreferences(raw);
    expect(saved.order).toEqual(['games', 'tools', ...COMMUNITY_SYSTEM_NAV.map(item => item.id).filter(id => !['games', 'tools'].includes(id))]);
    expect(saved.hidden).toEqual(['news', 'farm']);
    expect(new Set(saved.order).size).toBe(COMMUNITY_SYSTEM_NAV.length);
    expect(raw.order[1]).toBe('games');
  });

  it.each([null, undefined, [], 'https://evil.invalid', 1, { version: 2, order: [], hidden: [] },
    { version: 1, order: '/games', hidden: [] }, { version: 1, order: [] },
    { version: 1, order: [], hidden: [], path: '/admin' }])('rejects malformed roots without inventing navigation: %j', input => {
    expect(normalizeCommunityNavigationPreferences(input)).toEqual(defaultCommunityNavigationPreferences());
  });

  it('rejects prototype pollution, inherited objects and accessors without invoking user code', () => {
    const getter = vi.fn(() => ['games']);
    const accessor = Object.defineProperty({ version: 1, hidden: [] }, 'order', { get: getter, enumerable: true });
    const polluted = JSON.parse('{"version":1,"order":["games"],"hidden":[],"__proto__":{"polluted":true}}');
    for (const input of [accessor, polluted, Object.create({ version: 1, order: ['games'], hidden: [] }), new Proxy({}, { ownKeys: () => { throw new Error('trap'); } })]) {
      expect(normalizeCommunityNavigationPreferences(input)).toEqual(defaultCommunityNavigationPreferences());
      expect(writeCommunityNavigationPreferences(owner, input)).toBe(false);
    }
    expect(getter).not.toHaveBeenCalled(); expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    expect(localStorage.length).toBe(0);
    const nullPrototype = Object.assign(Object.create(null), preferred);
    expect(normalizeCommunityNavigationPreferences(nullPrototype).order[0]).toBe('games');
  });

  it('rejects array accessors, sparse arrays, custom prototypes and oversized arrays without invoking accessors', () => {
    const get = vi.fn(() => 'games');
    const accessed = Object.defineProperty(['games'], '0', { get, enumerable: true });
    const custom = ['games']; Object.setPrototypeOf(custom, { malicious: true });
    for (const order of [accessed, Array(3), custom, Array(513).fill('games'), ['x'.repeat(8193)]]) {
      expect(writeCommunityNavigationPreferences(owner, { version: 1, order, hidden: [] })).toBe(false);
    }
    expect(get).not.toHaveBeenCalled(); expect(localStorage.length).toBe(0);
  });

  it('uses exactly encoded owner keys, keeping accounts, percent literals and workspace favorites separate', () => {
    expect(communityNavigationStorageKey('用户:/a?x=%😀')).toBe('webfish:navigation:v1:' + encodeURIComponent('用户:/a?x=%😀'));
    expect(communityNavigationStorageKey('/')).not.toBe(communityNavigationStorageKey('%2F'));
    expect(communityNavigationStorageKey('a')).not.toBe(communityNavigationStorageKey(' a'));
    localStorage.setItem('webfish:workspace:v1:account-a', 'existing favorites');
    expect(writeCommunityNavigationPreferences(owner, preferred)).toBe(true);
    expect(readCommunityNavigationPreferences(owner)).toEqual({ value: normalizeCommunityNavigationPreferences(preferred), failed: false });
    expect(readCommunityNavigationPreferences('account-b')).toEqual({ value: defaultCommunityNavigationPreferences(), failed: false });
    expect(localStorage.getItem('webfish:workspace:v1:account-a')).toBe('existing favorites');
  });

  it.each(['', 'x'.repeat(513), '\ud800'])('fails closed for unusable owner identity without using a shared fallback key', identity => {
    expect(readCommunityNavigationPreferences(identity)).toEqual({ value: defaultCommunityNavigationPreferences(), failed: true });
    expect(writeCommunityNavigationPreferences(identity, preferred)).toBe(false);
    expect(resetCommunityNavigationPreferences(identity)).toBe(false);
    expect(localStorage.length).toBe(0);
  });

  it('returns a quiet default for no saved preference without creating storage', () => {
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expect(readCommunityNavigationPreferences(owner)).toEqual({ value: defaultCommunityNavigationPreferences(), failed: false });
    expect(write).not.toHaveBeenCalled();
  });

  it.each(['{bad JSON', 'null', '{"version":2,"order":[],"hidden":[]}', 'x'.repeat(8193)])('reports malformed or oversized stored JSON and never rewrites it', raw => {
    localStorage.setItem(communityNavigationStorageKey(owner), raw);
    const set = vi.spyOn(Storage.prototype, 'setItem');
    expect(readCommunityNavigationPreferences(owner)).toEqual({ value: defaultCommunityNavigationPreferences(), failed: true });
    expect(set).not.toHaveBeenCalled();
    expect(localStorage.getItem(communityNavigationStorageKey(owner))).toBe(raw);
  });

  it('handles unavailable reads, quota errors and failed removals without publishing a success event', () => {
    const event = vi.fn(); window.addEventListener(COMMUNITY_NAVIGATION_PREFERENCES_EVENT, event);
    try {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });
      expect(readCommunityNavigationPreferences(owner)).toEqual({ value: defaultCommunityNavigationPreferences(), failed: true });
      expect(writeCommunityNavigationPreferences(owner, preferred)).toBe(false);
      expect(resetCommunityNavigationPreferences(owner)).toBe(false);
      expect(event).not.toHaveBeenCalled();
    } finally { window.removeEventListener(COMMUNITY_NAVIGATION_PREFERENCES_EVENT, event); }
  });

  it('handles a blocked localStorage property without falling through to sessionStorage', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('disabled'); });
    expect(readCommunityNavigationPreferences(owner).failed).toBe(true);
    expect(writeCommunityNavigationPreferences(owner, preferred)).toBe(false);
    expect(resetCommunityNavigationPreferences(owner)).toBe(false);
    expect(sessionStorage.length).toBe(0);
  });

  it('emits owner-only success events and resets only that owner, preserving other keys', () => {
    const events: unknown[] = [], listener = (event: Event) => events.push((event as CustomEvent).detail);
    window.addEventListener(COMMUNITY_NAVIGATION_PREFERENCES_EVENT, listener);
    try {
      localStorage.setItem(communityNavigationStorageKey('account-b'), 'other preference');
      localStorage.setItem('auth-token', 'preserve');
      localStorage.setItem('webfish:workspace:v1:account-a', 'favorites');
      expect(writeCommunityNavigationPreferences(owner, preferred)).toBe(true);
      expect(events).toEqual([{ owner }]);
      expect(resetCommunityNavigationPreferences(owner)).toBe(true);
      expect(events).toEqual([{ owner }, { owner }]);
      expect(readCommunityNavigationPreferences(owner)).toEqual({ value: defaultCommunityNavigationPreferences(), failed: false });
      expect(localStorage.getItem(communityNavigationStorageKey('account-b'))).toBe('other preference');
      expect(localStorage.getItem('auth-token')).toBe('preserve');
      expect(localStorage.getItem('webfish:workspace:v1:account-a')).toBe('favorites');
    } finally { window.removeEventListener(COMMUNITY_NAVIGATION_PREFERENCES_EVENT, listener); }
  });
});
