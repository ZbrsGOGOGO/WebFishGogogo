import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../../app/site-config', () => ({ SITE_MODE: 'community' }));
import { ThemeSwitch } from './ThemeSwitch';
import { COMMUNITY_THEME_KEY, useCommunityThemeStore } from '../../app/store/community-theme-store';
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); useCommunityThemeStore.setState({ preference: 'system', resolved: 'light', storageUnavailable: false }); delete document.documentElement.dataset.colorMode; document.documentElement.removeAttribute('style'); });
it('offers three native, labelled choices without remounting sibling input', () => {
  render(<><ThemeSwitch /><textarea aria-label="当前草稿" defaultValue="保留草稿" /></>);
  const input = screen.getByRole('textbox');
  const select = screen.getByRole('combobox', { name: '界面主题' });
  expect(screen.getAllByRole('option')).toHaveLength(3);
  fireEvent.change(select, { target: { value: 'dark' } });
  expect(document.documentElement.dataset.colorMode).toBe('dark');
  expect(localStorage.getItem(COMMUNITY_THEME_KEY)).toBe('dark');
  expect(screen.getByRole('textbox')).toBe(input); expect(input).toHaveValue('保留草稿');
  fireEvent.change(select, { target: { value: 'light' } }); expect(select).toHaveValue('light');
});
it('keeps selector Escape from toggling a game cover and displays persistence failure', () => {
  const key = vi.fn(); render(<div onKeyDown={key}><ThemeSwitch /></div>);
  fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' }); expect(key).not.toHaveBeenCalled();
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'dark' } });
  expect(screen.getByRole('status')).toHaveTextContent('仅本次生效');
});
