import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const layoutCss = readFileSync(resolve(process.cwd(), 'src/features/community/CommunityPages.module.css'), 'utf8');

/** CSS safety contracts only; real Firefox separately checks clipped badge bounds. */
function declarations(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return layoutCss.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`))?.[1] ?? '';
}

describe('profile long-name and public-id layout boundaries', () => {
  it('allows the own-profile text column to shrink and wrap inside its clipping card', () => {
    const rule = declarations('.profileSummary > div');
    expect(rule).toMatch(/min-width:\s*0\s*;/);
    expect(rule).toMatch(/flex:\s*1\s*;/);
    expect(rule).toMatch(/overflow-wrap:\s*anywhere\s*;/);
  });

  it('wraps public-profile long names and biographies without clipping their suffix', () => {
    const rule = declarations('.publicProfileHero > div');
    expect(rule).toMatch(/min-width:\s*0\s*;/);
    expect(rule).toMatch(/overflow-wrap:\s*anywhere\s*;/);
  });
});
