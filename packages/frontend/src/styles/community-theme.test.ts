import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(process.cwd(), 'src/styles/community-theme.css'), 'utf8');
function color(name: string, mode = 'light'): string {
  const source = mode === 'dark' ? css.split("[data-color-mode='dark'] {")[1].split('\n}')[0] : css;
  const value = source.match(new RegExp(`--color-${name}:\\s*(#[a-f0-9]{6});`))?.[1];
  if (!value) throw new Error(`Missing semantic color: ${name}`);
  return value;
}
function luminance(hex: string): number {
  const rgb = [1, 3, 5].map((offset) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  });
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
function contrast(a: string, b: string): number {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + .05) / (values[1] + .05);
}
describe('community interface palette', () => {
  it.each(['light', 'dark'])('%s semantic colours remain readable', (mode) => {
    for (const text of ['text', 'text-secondary', 'text-muted', 'link', 'danger', 'warning', 'success']) {
      for (const background of ['surface', 'surface-2']) expect(contrast(color(text, mode), color(background, mode))).toBeGreaterThanOrEqual(4.5);
    }
    for (const background of ['brand', 'brand-hover', 'danger-emphasis']) expect(contrast('#ffffff', color(background, mode))).toBeGreaterThanOrEqual(4.5);
  });
  it.each(['text', 'text-secondary', 'text-muted', 'link', 'danger', 'warning', 'success'])('%s remains readable on both surfaces', (name) => {
    for (const surface of ['surface', 'surface-2']) expect(contrast(color(name), color(surface))).toBeGreaterThanOrEqual(4.5);
  });
  it('keeps primary actions and focus indicators distinguishable', () => {
    expect(contrast('#ffffff', color('brand'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#ffffff', color('brand-hover'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color('link'), color('surface-2'))).toBeGreaterThanOrEqual(3);
  });
  it('scopes the theme to community mode and preserves a light native control scheme', () => {
    expect(css).toContain("html[data-site-mode='community']");
    expect(css).toContain('color-scheme: light');
    expect(css).not.toMatch(/\[class[*^$]/);
  });
});
