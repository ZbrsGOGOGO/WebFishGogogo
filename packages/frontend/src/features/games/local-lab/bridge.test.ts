import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const source = readFileSync('public/games/local-lab/bridge.js', 'utf8');
const nonce = '12345678-1234-1234-1234-123456789abc';
function sandbox(referrer = 'https://test.invalid/games/lab/hextris') {
  let time = 0, serial = 0;
  const jobs = new Map<number, { at: number; run: () => void }>();
  const listeners = new Map<string, Array<(event: any) => void>>();
  const notices: Array<{ channel: string; nonce: string; type: string }> = [];
  const parent = { postMessage: (data: any) => notices.push(data) };
  const document = { hidden: false, hasFocus: () => false, referrer, documentElement: { dataset: {} }, addEventListener: (type: string, fn: any) => { listeners.set(`doc:${type}`, [...listeners.get(`doc:${type}`) ?? [], fn]); } };
  const win: any = {
    parent, document, location: { origin: 'https://test.invalid', hash: `#momo=${nonce}` }, URL, URLSearchParams, Event, Date,
    performance: { now: () => time }, console: { error: () => undefined },
    setTimeout: (run: () => void, delay = 0) => { const id = ++serial; jobs.set(id, { at: time + delay, run }); return id; },
    clearTimeout: (id: number) => jobs.delete(id),
    requestAnimationFrame: (run: () => void) => { const id = ++serial; jobs.set(id, { at: time + 16, run }); return id; },
    cancelAnimationFrame: (id: number) => jobs.delete(id),
    addEventListener: (type: string, fn: any) => { listeners.set(type, [...listeners.get(type) ?? [], fn]); },
    dispatchEvent: (event: Event) => listeners.get(event.type)?.forEach(fn => fn(event)),
  };
  win.window = win;
  const context = vm.createContext(win);
  vm.runInContext(source, context);
  const fire = (type: string, event: any = {}) => listeners.get(type)?.forEach(fn => fn(event));
  const command = (command: string, overrides: Record<string, any> = {}) => fire('message', { source: parent, origin: 'https://test.invalid', data: { channel: 'momo-local-lab', nonce, command }, ...overrides });
  const advance = (duration: number) => {
    const target = time + duration;
    for (let n = 0; n < 10000; n++) {
      const job = [...jobs.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (!job || job[1].at > target) { time = target; return; }
      time = job[1].at; jobs.delete(job[0]); job[1].run();
    }
    throw new Error('Unbounded timer');
  };
  return { win, document, notices, fire, command, advance, jobs };
}

describe('opaque local game scheduler bridge', () => {
  it('never advances before complete load and an authenticated explicit resume', () => {
    const s = sandbox(); let frames = 0;
    s.win.requestAnimationFrame(() => frames++); s.advance(1000); expect(frames).toBe(0);
    s.command('resume'); s.advance(100); expect(frames).toBe(0);
    s.fire('load'); expect(s.notices.at(-1)?.type).toBe('ready');
    s.command('resume', { source: {} }); s.command('resume', { origin: 'https://evil.invalid' });
    s.command('resume', { data: { channel: 'momo-local-lab', nonce: 'wrong', command: 'resume' } });
    s.advance(100); expect(frames).toBe(0);
    s.command('resume'); s.advance(16); expect(frames).toBe(1);
  });
  it('freezes RAF, both clock APIs and Date construction without a catch-up jump', () => {
    const s = sandbox(); s.fire('load'); s.command('resume'); s.advance(100);
    const perf = s.win.performance.now(), wall = s.win.Date.now();
    let timestamp = -1; s.win.requestAnimationFrame((stamp: number) => { timestamp = stamp; });
    s.command('pause'); s.advance(600000);
    expect(s.win.performance.now()).toBe(perf); expect(s.win.Date.now()).toBe(wall);
    expect(new s.win.Date().getTime()).toBe(wall); expect(new s.win.Date('2000-01-01').getFullYear()).toBe(2000);
    expect(s.win.Date.parse('2000-01-01')).toBe(Date.parse('2000-01-01'));
    expect(timestamp).toBe(-1); s.command('resume'); s.advance(16);
    expect(timestamp).toBe(perf + 16); expect(s.win.Date.now()).toBe(wall + 16);
  });
  it('preserves remaining function timer duration, arguments, intervals and cancellation', () => {
    const s = sandbox(); const calls: string[] = [];
    s.win.setTimeout((arg: string) => calls.push(arg), 100, 'once');
    const repeat = s.win.setInterval(() => calls.push('tick'), 60);
    const canceled = s.win.setTimeout(() => calls.push('bad'), 5); s.win.clearInterval(canceled);
    s.fire('load'); s.command('resume'); s.advance(40); s.command('pause'); s.advance(100000);
    expect(calls).toEqual([]); s.command('resume'); s.advance(20); expect(calls).toEqual(['tick']);
    s.advance(40); expect(calls).toEqual(['tick', 'once']);
    s.win.clearTimeout(repeat); s.advance(1000); expect(calls).toEqual(['tick', 'once']);
    expect(() => s.win.setTimeout('alert(1)', 0)).toThrow(/String timers/);
  });
  it('does not resume after blur or hiding and translates Escape to a fixed safe notice', () => {
    const s = sandbox(); s.fire('load'); s.command('resume'); s.advance(20);
    s.fire('blur'); s.advance(0); expect(s.notices.at(-1)?.type).toBe('paused'); s.advance(1000); expect(s.win.performance.now()).toBe(20);
    s.document.hidden = true; s.command('resume'); expect(s.jobs.size).toBe(0);
    s.document.hidden = false; s.command('resume'); s.advance(5);
    let prevented = false, stopped = false;
    s.fire('keydown', { key: 'Escape', preventDefault: () => { prevented = true; }, stopImmediatePropagation: () => { stopped = true; } });
    expect(prevented && stopped).toBe(true); expect(s.notices.at(-1)).toEqual({ channel: 'momo-local-lab', nonce, type: 'escape' });
    s.advance(1000); expect(s.win.performance.now()).toBe(25);
  });
  it('does not interpret an internal focus transition as leaving the game', () => {
    const s = sandbox(); s.document.hasFocus = () => true;
    s.fire('load'); s.command('resume'); s.advance(20);
    s.fire('blur'); s.advance(0); s.advance(16);
    expect(s.win.performance.now()).toBe(36);
    expect(s.notices.some(item => item.type === 'paused')).toBe(false);
  });
  it('fails closed on setup/runtime errors and unaudited parents, never sending error stacks', () => {
    const s = sandbox(); s.fire('error', { message: 'private diagnostic' }); s.fire('load'); s.command('resume');
    expect(s.notices.map(item => item.type)).toEqual(['error']); expect(JSON.stringify(s.notices)).not.toContain('private');
    const outside = sandbox('https://evil.invalid/'); outside.fire('load'); outside.command('resume');
    outside.advance(1000); expect(outside.notices).toEqual([]); expect(outside.win.performance.now()).toBe(0);
  });
});
