import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const gameDirectory = path.resolve('public/games/local-lab/connect-four');
const asset = (file: string) => readFileSync(path.join(gameDirectory, file), 'utf8');

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); document.body.innerHTML = ''; });

describe('pinned original Connect Four offline assets', () => {
  it('ships the exact MIT attribution, original offline modes, hashes and a genuinely lightweight program', () => {
    const provenance = JSON.parse(asset('provenance.json'));
    expect(provenance.sourceSha).toBe('35b1d25fcc05961b91153fd6c2c09f01f1c32cc9');
    expect(provenance.sourceUrl).toBe('https://github.com/kenrick95/c4');
    let bytes = 0;
    for (const [file, metadata] of Object.entries(provenance.artifacts) as Array<[string, { bytes: number; sha256: string }]>) {
      const contents = readFileSync(path.join(gameDirectory, file));
      expect(contents.byteLength, file).toBe(metadata.bytes);
      expect(createHash('sha256').update(contents).digest('hex'), file).toBe(metadata.sha256);
      bytes += contents.byteLength;
    }
    expect(bytes).toBeLessThan(100 * 1024);
    expect(readdirSync(gameDirectory).some(file => /\.(mp3|wav|ogg|png|jpg)$/i.test(file))).toBe(false);
    expect(readFileSync(path.resolve('public/licenses/c4-MIT.txt'), 'utf8')).toContain('Copyright (c) Kenrick');
    const parsed = new DOMParser().parseFromString(asset('index.html'), 'text/html');
    expect([...parsed.querySelectorAll<HTMLInputElement>('input[name="mode"]')].map(input => input.value)).toEqual(['offline-ai', 'offline-human', 'ai-vs-ai']);
    expect(asset('game.js')).toContain('MAX_DEPTH');
  });

  it('keeps all executable assets local/classic and excludes external online modes, tracking, inline handlers and persistence', () => {
    const html = asset('index.html');
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const scripts = [...parsed.querySelectorAll('script')];
    expect(scripts.map(script => script.getAttribute('src'))).toEqual(['../bridge.js', 'bootstrap.js', 'game.js']);
    expect(scripts.every(script => !script.hasAttribute('type') && !script.textContent?.trim())).toBe(true);
    expect(html).not.toMatch(/(?:src|href)="https?:\/\//);
    expect(html).not.toContain('online-human');
    expect(html).not.toContain('offline or online');
    for (const element of parsed.querySelectorAll('*')) expect([...element.attributes].some(attribute => /^on[a-z]+$/i.test(attribute.name))).toBe(false);
    expect(parsed.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content')).toContain("connect-src 'none'");
    expect(asset('game.js')).not.toMatch(/\bWebSocket\b|fly\.dev|\bfetch\(|\bXMLHttpRequest\b|\blocalStorage\b|\bsendBeacon\b|matchId/);
    expect(asset('bootstrap.js')).toContain('event.preventDefault()');
    expect(asset('adaptation.css')).toContain('animation-play-state: paused !important');
  });

  it('plays a complete original same-device match at 320px and treats a malicious player name as text', async () => {
    vi.useFakeTimers();
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(320);
    const context = new Proxy<Record<string, unknown>>({}, {
      get(target, key) { return target[String(key)] ?? (() => undefined); },
      set(target, key, value) { target[String(key)] = value; return true; },
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
    const parsed = new DOMParser().parseFromString(asset('index.html'), 'text/html');
    document.body.innerHTML = parsed.body.innerHTML;
    document.querySelectorAll('dialog').forEach(dialog => {
      dialog.showModal = () => { dialog.setAttribute('open', ''); };
      dialog.close = () => { dialog.removeAttribute('open'); dialog.dispatchEvent(new Event('close')); };
    });
    const runtime = {
      document, window, self: window, FormData: window.FormData, Element, Event, HTMLTextAreaElement,
      requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(0), 16),
      setTimeout, clearTimeout, console: { log: vi.fn(), error: vi.fn() },
    };
    runInNewContext(asset('bootstrap.js'), runtime);
    runInNewContext(asset('game.js'), runtime);
    document.dispatchEvent(new Event('DOMContentLoaded'));
    const form = document.querySelector<HTMLFormElement>('.game-settings-form')!;
    form.querySelector<HTMLInputElement>('input[value="offline-human"]')!.checked = true;
    form.dispatchEvent(new Event('input', { bubbles: true }));
    const maliciousName = '<img src=x onerror=alert(1)>';
    form.querySelector<HTMLInputElement>('input[name="player-1-name"]')!.value = maliciousName;
    form.querySelector<HTMLInputElement>('input[name="player-2-name"]')!.value = '蓝方';
    // Firefox's opaque no-allow-forms sandbox may never dispatch submit.
    // Starting must work from the click alone, with its default prevented.
    const submitClick = new MouseEvent('click', { bubbles: true, cancelable: true });
    form.querySelector<HTMLButtonElement>('button[type="submit"]')!.dispatchEvent(submitClick);
    expect(submitClick.defaultPrevented).toBe(true);
    expect(document.querySelector('dialog.init-screen')?.hasAttribute('open')).toBe(false);
    const canvas = document.querySelector<HTMLCanvasElement>('canvas')!;
    expect(parseFloat(canvas.style.width)).toBe(304);
    for (const column of [0, 1, 0, 1, 0, 1, 0]) {
      canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 45.125 + column * 35.625, clientY: 100 }));
      await vi.advanceTimersByTimeAsync(400);
    }
    const message = document.querySelector('.message-body-content')!;
    expect(message.textContent).toContain(maliciousName);
    expect(message.textContent).toContain('获胜');
    expect(message.querySelector('img')).toBeNull();
    expect(document.querySelector('dialog.message-body')?.hasAttribute('open')).toBe(true);
    document.querySelector<HTMLButtonElement>('.message-body-dismiss')!.click();
    expect(document.querySelector('dialog.message-body')?.hasAttribute('open')).toBe(false);
    document.querySelector<HTMLButtonElement>('.statusbox-button-back')!.click();
    expect(document.querySelector('dialog.init-screen')?.hasAttribute('open')).toBe(true);

    // Reuse the actual original mode selector: a human drop must trigger an
    // AI search/reply and then return control, not just draw a fake AI label.
    form.querySelector<HTMLInputElement>('input[value="offline-ai"]')!.checked = true;
    form.dispatchEvent(new Event('input', { bubbles: true }));
    form.querySelector<HTMLInputElement>('input[name="player-1-name"]')!.value = '测试员';
    const nameInput = form.querySelector<HTMLInputElement>('input[name="player-1-name"]')!;
    // Enter should work without form navigation; IME confirmation should not.
    nameInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }));
    expect(document.querySelector('dialog.init-screen')?.hasAttribute('open')).toBe(true);
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    nameInput.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(true);
    expect(document.querySelector('dialog.init-screen')?.hasAttribute('open')).toBe(false);
    canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 45.125, clientY: 100 }));
    await vi.advanceTimersByTimeAsync(900);
    expect(document.querySelector('.statusbox-body-player')?.textContent).toContain('测试员');
    expect(runtime.console.log.mock.calls.some(args => String(args[0]).startsWith('AI '))).toBe(true);
  });
});
