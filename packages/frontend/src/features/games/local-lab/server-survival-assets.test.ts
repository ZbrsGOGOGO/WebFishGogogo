import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const gameDirectory = path.resolve('public/games/local-lab/server-survival');
const asset = (file: string) => readFileSync(path.join(gameDirectory, file), 'utf8');
const upstream = (file: string) => readFileSync(path.resolve('../../third_party/server-survival/upstream', file), 'utf8');

afterEach(() => { document.body.innerHTML = ''; document.body.className = ''; });

describe('pinned original Server Survival offline assets', () => {
  it('retains the original 25-level campaign, 26 services and all five original palette categories', () => {
    const provenance = JSON.parse(asset('provenance.json'));
    expect(provenance.sourceSha).toBe('01796362d3b7bfa6c85efab5e2685f4d955dc137');
    expect(provenance.sourceUrl).toBe('https://github.com/pshenok/server-survival');
    expect(upstream('src/campaign/levels.js').match(/\bid:\s*\d+,\s*chapter:/g)).toHaveLength(25);
    const categories = upstream('src/ui/toolbar.js');
    for (const category of ['frontdoor', 'compute', 'data', 'async', 'ops']) {
      expect(categories).toContain(`id: "${category}"`);
      expect(asset('game.js')).toContain(`"${category}"`);
    }
    const serviceTypeLists = [...categories.matchAll(/types:\s*\[([^\]]+)\]/g)];
    expect(serviceTypeLists.flatMap(match => match[1]!.match(/"[^"]+"/g) || [])).toHaveLength(26);
    for (const id of ['main-menu-modal', 'campaign-select-modal', 'campaign-briefing-modal', 'campaign-debrief-modal', 'sandboxPanel', 'trophies-modal']) {
      expect(asset('index.html')).toContain(`id="${id}"`);
    }
  });

  it('ships verified hashes and the accurate original Three r128, without audio/preview assets', () => {
    const provenance = JSON.parse(asset('provenance.json'));
    let bytes = 0;
    for (const [file, metadata] of Object.entries(provenance.artifacts) as Array<[string, { bytes: number; sha256: string }]>) {
      const contents = readFileSync(path.join(gameDirectory, file));
      expect(contents.byteLength, file).toBe(metadata.bytes);
      expect(createHash('sha256').update(contents).digest('hex'), file).toBe(metadata.sha256);
      bytes += contents.byteLength;
    }
    expect(bytes).toBeLessThan(3 * 1024 * 1024);
    expect(createHash('sha256').update(readFileSync(path.join(gameDirectory, 'three-r128.min.js'))).digest('hex')).toBe('9274bbcec8d96168626c732b5d31c775aa8cfb7eaa0599bec0c175908a2c1ce2');
    expect(readdirSync(gameDirectory).some(file => /\.(mp3|gif|wav|ogg)$/i.test(file))).toBe(false);
    expect(asset('game.js')).not.toMatch(/\bnew Audio\b|\bAudioContext\b|assets\/sounds\/|\.mp3/);
    expect(readFileSync(path.resolve('public/licenses/server-survival-MIT.txt'), 'utf8')).toContain('Copyright (c) 2025 Kostyantyn Pshenychnyy');
    expect(readFileSync(path.resolve('public/licenses/server-survival-three-r128-MIT.txt'), 'utf8')).toContain('2010-2021 three.js authors');
    expect(readFileSync(path.resolve('public/licenses/server-survival-tailwind-MIT.txt'), 'utf8')).toContain('MIT License');
  });

  it('has no remote/eager module execution, inline event handlers, networking or fake unsupported save/share buttons', () => {
    const html = asset('index.html');
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const scripts = [...parsed.querySelectorAll('script')];
    expect(scripts[0]?.getAttribute('src')).toBe('../bridge.js');
    expect(scripts.length).toBeGreaterThan(3);
    for (const script of scripts) {
      expect(script.getAttribute('src')).toMatch(/^(\.\.\/bridge\.js|[a-z0-9.-]+\.js)$/);
      expect(script.hasAttribute('type')).toBe(false);
      expect(script.textContent?.trim()).toBe('');
    }
    for (const element of parsed.querySelectorAll('*')) {
      expect([...element.attributes].filter(attribute => /^on[a-z]+$/i.test(attribute.name)), element.outerHTML.slice(0, 160)).toHaveLength(0);
    }
    expect(parsed.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content')).toContain("connect-src 'none'");
    expect(html).not.toMatch(/(?:src|href)="https?:\/\//);
    expect(asset('game.js')).not.toMatch(/\bfetch\(|\bXMLHttpRequest\b|\bWebSocket\b|\bsendBeacon\b|\blocalStorage\b/);
    for (const id of ['btn-share', 'tool-music', 'tool-sfx', 'menu-music-btn', 'menu-sfx-btn', 'upload-btn', 'upload-file-input', 'btn-download-save', 'btn-share-png', 'btn-share-link']) {
      expect(parsed.getElementById(id)).toBeNull();
    }
    expect(parsed.querySelector('[data-lab-session-save]')).not.toBeNull();
    expect(parsed.querySelector('[data-lab-session-load]')).not.toBeNull();
    expect(asset('adaptation.css')).toContain('animation-play-state: paused !important');
  });

  it('uses a finite session-only storage allowlist without reading the opaque localStorage getter', () => {
    const makeWindow = () => {
      const sandboxWindow: Record<string, unknown> = {};
      Object.defineProperty(sandboxWindow, 'localStorage', { get: () => { throw new Error('opaque origin'); } });
      runInNewContext(asset('bootstrap.js'), { window: sandboxWindow, document: { addEventListener: vi.fn() } });
      return sandboxWindow.labSessionStorage as { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void; removeItem: (key: string) => void };
    };
    const first = makeWindow();
    expect(first.getItem('serverSurvivalSave')).toBeNull();
    first.setItem('serverSurvivalSave', '{"version":"2.0"}');
    expect(first.getItem('serverSurvivalSave')).toBe('{"version":"2.0"}');
    expect(() => first.setItem('community-auth', 'private')).toThrow('Unsupported game session key');
    expect(first.getItem('community-auth')).toBeNull();
    expect(() => first.setItem('serverSurvivalSave', 'x'.repeat(2 * 1024 * 1024 + 1))).toThrow('too large');
    expect(makeWindow().getItem('serverSurvivalSave')).toBeNull();
    first.removeItem('serverSurvivalSave');
    expect(first.getItem('serverSurvivalSave')).toBeNull();
  });

  it('folds all five real HUD panels with synchronized accessibility, retaining original content in one bounded drawer', () => {
    const parsed = new DOMParser().parseFromString(asset('index.html'), 'text/html');
    document.body.innerHTML = parsed.body.innerHTML;
    const ids = ['statsPanel', 'detailsPanel', 'healthPanel', 'metricsPanel', 'financesPanel'];
    const panels = ids.map(id => document.getElementById(id)!);
    const contents = panels.map(panel => panel.innerHTML);
    let ready: (() => void) | undefined;
    const adapterDocument = new Proxy(document, {
      get(target, key) {
        if (key === 'addEventListener') return (type: string, listener: () => void) => { if (type === 'DOMContentLoaded') ready = listener; };
        const value = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    runInNewContext(asset('bootstrap.js'), { document: adapterDocument, window: { innerWidth: 660 } });
    ready!();
    const toggle = document.getElementById('lab-metrics-toggle')!;
    const drawer = document.getElementById('lab-metrics-panel')!;
    expect(toggle.getAttribute('aria-controls')?.split(' ')).toEqual(['lab-metrics-panel', ...ids]);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(drawer.hidden).toBe(true);
    for (const panel of panels) {
      expect(panel.parentElement).toBe(drawer);
      expect(panel.getAttribute('aria-hidden')).toBe('true');
      expect(panel.hasAttribute('inert')).toBe(true);
    }
    toggle.click();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(drawer.hidden).toBe(false);
    expect(panels.map(panel => panel.innerHTML)).toEqual(contents);
    for (const panel of panels) {
      expect(panel.getAttribute('aria-hidden')).toBe('false');
      expect(panel.hasAttribute('inert')).toBe(false);
    }
    document.getElementById('auto-repair-toggle')!.focus();
    toggle.click();
    expect(document.activeElement).toBe(toggle);
    expect(drawer.hidden).toBe(true);
    expect(panels.every(panel => panel.getAttribute('aria-hidden') === 'true' && panel.hasAttribute('inert'))).toBe(true);
    const css = asset('adaptation.css');
    expect(css).toContain('overflow-y: auto');
    expect(css).toContain('max-height: calc(100vh - 180px)');
    expect(css).toContain('max-height: calc(100vh - 236px)');
    expect(css).toContain('.lab-metrics-collapsed :is(#lab-metrics-panel, #statsPanel, #detailsPanel, #healthPanel, #metricsPanel, #financesPanel)');
  });
});
