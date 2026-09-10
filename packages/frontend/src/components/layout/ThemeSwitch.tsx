import type { JSX } from 'react';
import { SITE_MODE } from '../../app/site-config';
import { setCommunityTheme, useCommunityThemeStore, type ThemePreference } from '../../app/store/community-theme-store';
import styles from './ThemeSwitch.module.css';

export function ThemeSwitch(): JSX.Element | null {
  const { preference, resolved, storageUnavailable } = useCommunityThemeStore();
  if (SITE_MODE !== 'community') return null;
  return <div className={styles.wrapper}>
    <label className={styles.control} title={`界面主题：${preference === 'system' ? '跟随系统' : resolved === 'dark' ? '深色' : '浅色'}`}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true" focusable="false">
        {preference === 'system' ? <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8m-4-4v4" /></> : resolved === 'dark' ? <path d="M20 15.5A9 9 0 0 1 8.5 4 9 9 0 1 0 20 15.5Z" /> : <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>}
      </svg>
      <select aria-label="界面主题" value={preference} onChange={(event) => setCommunityTheme(event.target.value as ThemePreference)} onKeyDown={(event) => { if (event.key === 'Escape') event.stopPropagation(); }}>
        <option value="system">跟随系统</option><option value="light">浅色模式</option><option value="dark">深色模式</option>
      </select>
    </label>
    {storageUnavailable ? <small className={styles.notice} role="status">仅本次生效</small> : null}
  </div>;
}
