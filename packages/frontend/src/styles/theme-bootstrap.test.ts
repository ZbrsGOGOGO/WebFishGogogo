import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';
const code = readFileSync(resolve(process.cwd(), 'public/workspace-theme.js'), 'utf8');
function bootstrap(saved: string | null, systemDark: boolean, mode = 'community', blocked = false) {
  const root = { dataset: {} as Record<string, string>, style: {} as Record<string, string> };
  runInNewContext(code, { document: { currentScript: { getAttribute: () => mode }, documentElement: root, querySelector: () => null }, localStorage: { getItem: () => { if (blocked) throw Error('blocked'); return saved; } }, matchMedia: () => ({ matches: systemDark }) });
  return root;
}
it('sets the saved dark canvas before React or styles have loaded', () => {
  expect(bootstrap('dark', false)).toMatchObject({ dataset: { siteMode: 'community', colorMode: 'dark' }, style: { backgroundColor: '#0d1117', colorScheme: 'dark' } });
});
it('honours explicit light, system preference and blocked/invalid storage safely', () => {
  expect(bootstrap('light', true).dataset.colorMode).toBe('light');
  expect(bootstrap('bad', true).dataset.colorMode).toBe('dark');
  expect(bootstrap(null, true, 'community', true).dataset.colorMode).toBe('dark');
});
it('does not override independent reader/public themes', () => {
  expect(bootstrap('dark', true, 'full').dataset).toEqual({});
  expect(bootstrap('dark', true, '%VITE_SITE_MODE%').dataset).toEqual({});
});
