import { create } from 'zustand';

export const COMMUNITY_THEME_KEY = 'webfish:appearance:v1';
export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';
export function parseThemePreference(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system';
}
export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  return preference === 'system' ? systemDark ? 'dark' : 'light' : preference;
}

export const useCommunityThemeStore = create<{
  preference: ThemePreference;
  resolved: ResolvedTheme;
  storageUnavailable: boolean;
}>(() => ({ preference: 'system', resolved: 'light', storageUnavailable: false }));

let darkMedia: MediaQueryList | undefined;
function apply(preference: ThemePreference): void {
  const resolved = resolveTheme(preference, darkMedia?.matches ?? false);
  const root = document.documentElement;
  root.dataset.colorMode = resolved;
  root.style.colorScheme = resolved;
  root.style.backgroundColor = resolved === 'dark' ? '#0d1117' : '#ffffff';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#0d1117' : '#f6f8fa');
  useCommunityThemeStore.setState({ preference, resolved });
}

export function setCommunityTheme(preference: ThemePreference): void {
  if (!['system', 'light', 'dark'].includes(preference)) return;
  apply(preference);
  try {
    localStorage.setItem(COMMUNITY_THEME_KEY, preference);
    useCommunityThemeStore.setState({ storageUnavailable: false });
  } catch {
    // A blocked/quota-limited browser still gets the requested theme for this session.
    useCommunityThemeStore.setState({ storageUnavailable: true });
  }
}

/** Called once before React mounts, only in community mode. */
export function initializeCommunityTheme(): () => void {
  darkMedia = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : undefined;
  let preference: ThemePreference = 'system';
  try { preference = parseThemePreference(localStorage.getItem(COMMUNITY_THEME_KEY)); }
  catch { useCommunityThemeStore.setState({ storageUnavailable: true }); }
  apply(preference);
  const systemChanged = (): void => {
    if (useCommunityThemeStore.getState().preference === 'system') apply('system');
  };
  const storageChanged = (event: StorageEvent): void => {
    if (event.key !== COMMUNITY_THEME_KEY && event.key !== null) return;
    // Do not interpret sessionStorage events as changes to this browser preference.
    try { if (event.storageArea && event.storageArea !== localStorage) return; } catch { return; }
    apply(parseThemePreference(event.newValue));
    useCommunityThemeStore.setState({ storageUnavailable: false });
  };
  darkMedia?.addEventListener('change', systemChanged);
  window.addEventListener('storage', storageChanged);
  const subscribedMedia = darkMedia;
  return () => {
    subscribedMedia?.removeEventListener('change', systemChanged);
    window.removeEventListener('storage', storageChanged);
    if (darkMedia === subscribedMedia) darkMedia = undefined;
  };
}
