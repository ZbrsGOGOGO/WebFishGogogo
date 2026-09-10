import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMMUNITY_THEME_KEY, initializeCommunityTheme, parseThemePreference, resolveTheme, setCommunityTheme, useCommunityThemeStore } from './community-theme-store';

let dispose: (() => void) | undefined;
let systemDark = false;
const listeners = new Set<() => void>();
beforeEach(() => {
  localStorage.clear(); systemDark = false; listeners.clear();
  useCommunityThemeStore.setState({ preference: 'system', resolved: 'light', storageUnavailable: false });
  vi.stubGlobal('matchMedia', vi.fn(() => ({ get matches() { return systemDark; }, addEventListener: (_: string, fn: () => void) => listeners.add(fn), removeEventListener: (_: string, fn: () => void) => listeners.delete(fn) })));
});
afterEach(() => { dispose?.(); dispose = undefined; vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); delete document.documentElement.dataset.colorMode; document.documentElement.removeAttribute('style'); });

describe('community theme preference', () => {
  it.each([null, undefined, 'invalid', '{}', 3])('rejects invalid storage value %s', (value) => expect(parseThemePreference(value)).toBe('system'));
  it('resolves explicit preferences independently of the operating system', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('system', true)).toBe('dark');
  });
  it('loads a saved theme before rendering and updates document/native controls', () => {
    localStorage.setItem(COMMUNITY_THEME_KEY, 'dark'); dispose = initializeCommunityTheme();
    expect(useCommunityThemeStore.getState()).toMatchObject({ preference: 'dark', resolved: 'dark' });
    expect(document.documentElement.dataset.colorMode).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(document.documentElement.style.backgroundColor).toBe('rgb(13, 17, 23)');
  });
  it('tracks system changes only when following the system', () => {
    dispose = initializeCommunityTheme(); systemDark = true; listeners.forEach(fn => fn());
    expect(useCommunityThemeStore.getState().resolved).toBe('dark');
    setCommunityTheme('light'); listeners.forEach(fn => fn());
    expect(useCommunityThemeStore.getState().resolved).toBe('light');
    expect(localStorage.getItem(COMMUNITY_THEME_KEY)).toBe('light');
    setCommunityTheme('system'); expect(useCommunityThemeStore.getState().resolved).toBe('dark');
  });
  it('syncs other tabs and clearing preferences, but ignores unrelated/session storage', () => {
    dispose = initializeCommunityTheme();
    window.dispatchEvent(new StorageEvent('storage', { key: COMMUNITY_THEME_KEY, newValue: 'dark', storageArea: localStorage }));
    expect(useCommunityThemeStore.getState().resolved).toBe('dark');
    window.dispatchEvent(new StorageEvent('storage', { key: COMMUNITY_THEME_KEY, newValue: 'light', storageArea: sessionStorage }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'private-data', newValue: 'light' }));
    expect(useCommunityThemeStore.getState().resolved).toBe('dark');
    window.dispatchEvent(new StorageEvent('storage', { key: null, storageArea: localStorage }));
    expect(useCommunityThemeStore.getState().preference).toBe('system');
    expect(useCommunityThemeStore.getState().resolved).toBe('light');
  });
  it('applies the theme despite blocked storage and reports session-only persistence', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    dispose = initializeCommunityTheme(); setCommunityTheme('dark');
    expect(useCommunityThemeStore.getState()).toMatchObject({ resolved: 'dark', storageUnavailable: true });
    write.mockRestore(); setCommunityTheme('light');
    expect(useCommunityThemeStore.getState().storageUnavailable).toBe(false);
  });
  it('does not touch other browser data and removes subscriptions on cleanup', () => {
    localStorage.setItem('private-game-save', 'preserve'); dispose = initializeCommunityTheme();
    setCommunityTheme('dark'); expect(localStorage.getItem('private-game-save')).toBe('preserve');
    expect(listeners.size).toBe(1); dispose(); dispose = undefined; expect(listeners.size).toBe(0);
    window.dispatchEvent(new StorageEvent('storage', { key: COMMUNITY_THEME_KEY, newValue: 'light' }));
    expect(useCommunityThemeStore.getState().resolved).toBe('dark');
  });
});
