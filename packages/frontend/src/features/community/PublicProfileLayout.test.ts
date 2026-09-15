import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/features/community/PublicProfile.module.css'), 'utf8');
function declarations(selector: string): string {
  return css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]+)\\}`))?.[1] ?? '';
}

/** CSS contracts only; actual 320px light/dark layouts require browser QA. */
describe('public profile scoped layout boundaries', () => {
  it('retains shrinking and wrapping for long names, suffixes, identifiers and legacy honors', () => {
    expect(declarations('.publicProfileHero > div')).toMatch(/min-width:\s*0\s*;/);
    expect(declarations('.publicProfileHero > div')).toMatch(/overflow-wrap:\s*anywhere\s*;/);
    expect(declarations('.nameRow h1')).toMatch(/overflow-wrap:\s*anywhere\s*;/);
    expect(declarations('.nameRow > span')).toMatch(/white-space:\s*normal\s*;/);
    expect(declarations('.identityMeta dd')).toMatch(/overflow-wrap:\s*anywhere\s*;/);
    expect(declarations('.honors > span > span')).toMatch(/overflow-wrap:\s*anywhere\s*;/);
    expect(declarations('.contentGrid')).toMatch(/minmax\(0,\s*1\.5fr\)\s+minmax\(0,\s*1fr\)/);
  });
  it('uses theme tokens without a separate hard-coded light or dark color palette', () => {
    expect(css).toContain('var(--color-surface)'); expect(css).toContain('var(--color-text)');
    expect(css).toContain('var(--color-brand-soft)');
    // White text on filled blue actions is shared by both themes; all other
    // surface, accent and text colors must inherit the existing community tokens.
    expect(css.replaceAll('#fff', '')).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).not.toMatch(/overflow\s*:\s*hidden/);
  });
  it('stacks the page below 760px and keeps 320px padding, touch targets and reduced-motion fallback bounded', () => {
    expect(css).toMatch(/@media\s*\(max-width:\s*760px\)\s*\{\s*\.contentGrid\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    expect(css).toMatch(/@media\s*\(max-width:\s*430px\)/);
    expect(css).toContain('width: calc(100% - 24px)'); expect(css).toContain('min-height: 44px');
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  });
});
