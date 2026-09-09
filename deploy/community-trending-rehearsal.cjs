#!/usr/bin/env node
'use strict';

/**
 * Offline-source / real-PostgreSQL trending acceptance. Run AFTER the play
 * rehearsal restored its empty synthetic tables, using the FINAL 0028 news schema (also works after additive 0029/0030).
 * No external fetch is permitted. Only owned 2099 news rows may be written.
 */
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');
assert.equal(process.env.TRENDING_REHEARSAL_CONFIRMATION, 'ISOLATED_TRENDING_ONLY:20260908');
assert.equal(process.env.DB_DATABASE, 'community_play_rehearsal');
assert.ok(process.env.DB_HOST === '127.0.0.1' || process.env.DB_HOST === 'demon-tower-rehearsal-pg-hgbacy' || /^(?:play|rail)-rehearsal-pg-[a-z0-9]{6,16}$/.test(process.env.DB_HOST || ''), 'Explicit isolated DB_HOST required');
assert.equal(process.env.DB_PORT || '5432', '5432');
assert.ok(process.env.DB_USERNAME && process.env.DB_PASSWORD, 'Explicit dedicated test credentials required');
assert.ok(!process.env.DATABASE_URL, 'Do not pass production connection strings');
const appRoot = process.env.PLAY_REHEARSAL_APP_ROOT || '/app';
const fromApp = createRequire(path.join(appRoot, 'packages/backend/package.json'));
fromApp('reflect-metadata');
const { DataSource } = fromApp('typeorm');
const dist = process.env.PLAY_REHEARSAL_BACKEND_DIST || path.join(appRoot, 'packages/backend/dist');
const load = (name) => fromApp(path.join(dist, name));
const E = load('database/entities');
const { TrendingNewsService, fetchStackOverflow } = load('modules/community/news/trending-news.service');
const BOARDS = ['hacker_news', 'stackoverflow', 'github_rising'];
const HOST_BOARD = {
  'hacker-news.firebaseio.com': 'hacker_news',
  'api.stackexchange.com': 'stackoverflow',
  'api.github.com': 'github_rising',
};
const NativeDate = Date;
const nativeFetch = global.fetch;
let clock = NativeDate.parse('2099-07-01T00:10:00.000Z');
class TestDate extends NativeDate {
  constructor(...args) { super(...(args.length ? args : [clock])); }
  static now() { return clock; }
}
let db;
let baseline;
const usedDates = new Set();
const pendingWorkers = new Set();
const gates = new Set();
const passed = [];
function check(name) { passed.push(name); process.stdout.write(`PASS ${name}\n`); }
function at(value) { clock = typeof value === 'number' ? value : NativeDate.parse(value); return new TestDate(); }
function day(value) { return `${value}T00:10:00.000Z`; }
function serviceDate(now) { return new NativeDate(now.getTime() + 8 * 3600000).toISOString().slice(0, 10); }
function gate() {
  let release;
  const promise = new Promise((resolve) => { release = resolve; });
  const item = { promise, release }; gates.add(item); return item;
}
async function eventually(predicate, message) {
  const end = NativeDate.now() + 7000;
  while (NativeDate.now() < end) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out: ${message}`);
}
function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });
}
function source(tag, options = {}) {
  const calls = [];
  const cancelled = [];
  const fetcher = async (input, init) => {
    const url = new URL(String(input));
    const board = HOST_BOARD[url.hostname];
    assert.ok(board, `Unexpected synthetic request host: ${url.hostname}`);
    assert.equal(url.protocol, 'https:'); assert.equal(init?.redirect, 'manual');
    assert.ok(init.signal, 'Production fetch must carry a timeout signal');
    calls.push({ board, path: url.pathname, url: url.toString() });
    if (options.gate && (!options.gateBoards || options.gateBoards.includes(board))) await options.gate.promise;
    if (options.failBoard === board && (!options.failItem || url.pathname.endsWith(`/item/${options.failItem}.json`))) {
      const body = new ReadableStream({ cancel() { cancelled.push(board); } });
      return new Response(body, { status: options.status || 503, headers: { 'Content-Type': 'application/json', ...(options.failureHeaders || {}) } });
    }
    if (board === 'hacker_news' && url.pathname.endsWith('/topstories.json')) return json([101, 102, 103, 104]);
    if (board === 'hacker_news') {
      const id = Number(url.pathname.match(/\/item\/(\d+)\.json$/)?.[1]);
      assert.ok([101, 102, 103, 104].includes(id));
      return json({ id, type: id === 103 ? 'job' : 'story', deleted: id === 101, title: id === 102 ? `${tag} &lt;b&gt;HN title&lt;/b&gt; &amp; plain` : `${tag} HN ${id}`, score: 500 - id, time: Math.floor(clock / 1000), url: 'javascript:never-follow-this-story-body' });
    }
    if (board === 'stackoverflow') {
      assert.equal(url.searchParams.get('sort'), 'hot'); assert.equal(url.searchParams.get('pagesize'), '10');
      return json({
        items: [
          { question_id: 201, title: `${tag} rejected`, link: 'javascript:alert(1)' },
          { question_id: 202, title: `${tag} &lt;strong&gt;Stack title&lt;/strong&gt; &amp; plain`, link: 'https://stackoverflow.com/questions/202/safe#remove-fragment', score: 30, creation_date: Math.floor(clock / 1000) },
          { question_id: 203, title: `${tag} hostile host`, link: 'https://stackoverflow.com.attacker.invalid/questions/203' },
          { question_id: 204, title: `${tag} <em>Stack second</em>`, link: 'https://stackoverflow.com/questions/204/safe', score: 20, creation_date: Math.floor(clock / 1000) },
        ], quota_remaining: 200, ...(options.stackMetadata || {}),
      });
    }
    assert.equal(url.pathname, '/search/repositories'); assert.equal(url.searchParams.get('sort'), 'stars');
    return json({ incomplete_results: false, items: [
      { id: 301, full_name: `${tag}/rejected`, html_url: 'https://github.com@attacker.invalid/repo' },
      { id: 302, full_name: `${tag}/&lt;b&gt;github-title&lt;/b&gt;`, html_url: `https://github.com/synthetic/${tag}-302#remove-fragment`, stargazers_count: 100, created_at: new TestDate().toISOString() },
      { id: 303, full_name: `${tag}/insecure`, html_url: 'http://github.com/synthetic/insecure' },
      { id: 304, full_name: `${tag}/github-second`, html_url: `https://github.com/synthetic/${tag}-304`, stargazers_count: 90, created_at: new TestDate().toISOString() },
    ] }, 200, options.githubHeaders || {});
  };
  return Object.assign(fetcher, { calls, cancelled });
}
function refresh(fetcher, now = new TestDate()) {
  usedDates.add(serviceDate(now));
  const promise = new TrendingNewsService(db, fetcher).refresh(now);
  pendingWorkers.add(promise);
  void promise.then(() => pendingWorkers.delete(promise), () => pendingWorkers.delete(promise));
  return promise;
}
async function page(now = new TestDate()) { return new TrendingNewsService(db, async () => { throw new Error('Read-only news projection must not fetch'); }).listDaily(now); }
function internal(snapshot) { return snapshot.boards.filter((board) => BOARDS.includes(board.id)); }
async function fingerprints() {
  const tables = await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
  const value = {};
  for (const { tablename } of tables) {
    assert.match(tablename, /^[a-z0-9_]+$/);
    [value[tablename]] = await db.query(`SELECT count(*)::integer AS count, md5(COALESCE(string_agg(to_jsonb(t)::text, E'\\n' ORDER BY to_jsonb(t)::text), '')) AS digest FROM "${tablename}" t`);
  }
  return value;
}

async function normalAndFailureChecks() {
  const first = source('first');
  const before = await fingerprints();
  const unavailable = await page();
  assert.ok(internal(unavailable).every((board) => board.status === 'unavailable' && board.items.length === 0));
  assert.deepEqual(await fingerprints(), before, 'Listing must not write any row');
  const concurrent = await Promise.all(Array.from({ length: 6 }, () => refresh(first)));
  assert.equal(concurrent.reduce((sum, result) => sum + result.refreshedBoards.length, 0), 3);
  assert.equal(first.calls.filter((call) => call.path.endsWith('/topstories.json')).length, 1);
  assert.equal(first.calls.filter((call) => /\/item\//.test(call.path)).length, 4);
  assert.equal(first.calls.filter((call) => call.board === 'stackoverflow').length, 1);
  assert.equal(first.calls.filter((call) => call.board === 'github_rising').length, 1);
  const snapshot = await page();
  assert.equal(snapshot.serviceDate, '2099-07-01');
  assert.ok(internal(snapshot).every((board) => board.status === 'fresh' && board.items.length === 2));
  for (const board of internal(snapshot)) {
    assert.deepEqual(board.items.map((item) => item.rank), [2, 4], 'Filtered rows must preserve official source ranks, not renumber');
    for (const item of board.items) {
      assert.ok(!/<\/?(?:b|strong|em|script)\b|&lt;|&gt;/i.test(item.title), 'Decoded HTML must be plain title text');
      assert.ok(item.url.startsWith('https://')); assert.ok(!item.url.includes('#')); assert.ok(!item.url.includes('attacker.invalid'));
      assert.ok(!Object.hasOwn(item, 'body') && !Object.hasOwn(item, 'html'));
    }
  }
  const external = snapshot.boards.filter((board) => !BOARDS.includes(board.id));
  assert.ok(external.length >= 6 && external.every((board) => board.status === 'external_only' && board.items.length === 0));
  const noFetch = source('must-not-replace');
  assert.deepEqual((await refresh(noFetch)).refreshedBoards, []); assert.equal(noFetch.calls.length, 0);
  check('six replicas fetch each official source once; daily completion is idempotent; ranks 2/4, plain text, safe URLs and honest external-only status');

  for (let index = 0; index < BOARDS.length; index += 1) {
    const failedBoard = BOARDS[index]; const previous = internal(await page()).find((board) => board.id === failedBoard);
    at(day(`2099-07-0${index + 2}`));
    const fetcher = source(`failure-${index}`, { failBoard: failedBoard });
    const result = await refresh(fetcher);
    assert.equal(result.refreshedBoards.length, 2); assert.ok(!result.refreshedBoards.includes(failedBoard));
    const current = internal(await page()); const stale = current.find((board) => board.id === failedBoard);
    assert.equal(stale.status, 'stale'); assert.equal(stale.snapshotDate, previous.snapshotDate);
    assert.equal(stale.updatedAt, previous.updatedAt); assert.deepEqual(stale.items, previous.items);
    assert.ok(current.filter((board) => board.id !== failedBoard).every((board) => board.status === 'fresh'));
    const failedRun = await db.getRepository(E.TrendingNewsBoardRun).findOneByOrFail({ serviceDate: serviceDate(new TestDate()), boardId: failedBoard });
    assert.equal(failedRun.status, 'failed'); assert.equal(failedRun.completedAt, null);
    assert.ok(fetcher.cancelled.includes(failedBoard), 'Failed HTTP response body must be cancelled');
  }
  check('each source fails independently, preserves old items/ranks/timestamps, and never blocks the other two sources');
}

async function leaseCheck(date, sameMillisecond, lateFailure = false) {
  at(day(date)); const oldNow = new TestDate(); const oldGate = gate(); const newGate = gate();
  const oldFetch = source('old-worker', { gate: oldGate, gateBoards: ['hacker_news', 'stackoverflow'], ...(lateFailure ? { failBoard: 'hacker_news' } : {}) });
  const newFetch = source('new-worker', { gate: newGate, gateBoards: ['hacker_news', 'stackoverflow'] });
  const oldRefresh = refresh(oldFetch, oldNow);
  const repo = db.getRepository(E.TrendingNewsBoardRun);
  await eventually(async () => (await repo.find({ where: { serviceDate: date, status: 'running' } })).length === 2, 'old two-board leases');
  const oldRuns = await repo.find({ where: { serviceDate: date, status: 'running' } });
  // The board-worker concurrency may leave GitHub either completed already or
  // queued behind both gates. Assert its actual ownership without assuming an
  // implementation-specific worker count.
  const thirdCompleted = await repo.findOneBy({ serviceDate: date, boardId: 'github_rising', status: 'completed' });
  if (sameMillisecond) {
    for (const row of oldRuns) await repo.update({ serviceDate: date, boardId: row.boardId }, { leaseExpiresAt: new TestDate(clock - 1) });
  } else at(clock + 10 * 60_000 + 1);
  const newer = refresh(newFetch, new TestDate());
  await eventually(async () => {
    const claimed = await repo.find({ where: { serviceDate: date, status: 'running' } });
    return oldRuns.every((old) => claimed.some((next) => next.boardId === old.boardId && next.lastError !== old.lastError));
  }, 'new lease tokens');
  const nextRuns = await repo.find({ where: { serviceDate: date, status: 'running' } });
  for (const old of oldRuns) {
    const newerRun = nextRuns.find((row) => row.boardId === old.boardId);
    assert.notEqual(newerRun.lastError, old.lastError);
    if (sameMillisecond) assert.equal(newerRun.startedAt.getTime(), old.startedAt.getTime());
    else assert.ok(newerRun.startedAt > old.startedAt);
  }
  newGate.release(); await newer;
  const beforeRelease = await fingerprints();
  const completed = internal(await page());
  assert.ok(completed.every((board) => board.items.length === 2 && board.items.every((item) => item.title.includes(board.id === 'github_rising' && thirdCompleted ? 'old-worker' : 'new-worker'))), 'Only a completed third source keeps its original owner; new claims publish the new owner snapshot');
  assert.equal(newFetch.calls.filter((call) => call.board === 'github_rising').length, thirdCompleted ? 0 : 1, 'Replacement worker must not refetch a completed third source');
  oldGate.release(); await oldRefresh;
  assert.deepEqual(await fingerprints(), beforeRelease, 'Late old worker must not change any committed row or timestamp');
  check(lateFailure ? 'late old-worker failure cannot downgrade a newer completed lease or change its data' : sameMillisecond ? 'same-millisecond replacement relies on a new UUID token, not just startedAt' : 'expired lease owner cannot overwrite a newer worker snapshot');
}

async function partialSourceCheck() {
  at(day('2099-07-07'));
  const previous = internal(await page()).find((board) => board.id === 'hacker_news');
  const fetcher = source('partial-failure', { failBoard: 'hacker_news', failItem: 102 });
  const result = await refresh(fetcher);
  assert.ok(!result.refreshedBoards.includes('hacker_news'), 'A network-failed story must not silently publish a partial HN snapshot');
  const current = internal(await page()).find((board) => board.id === 'hacker_news');
  assert.equal(current.status, 'stale'); assert.deepEqual(current.items, previous.items);
  check('HN item network failure rejects partial publication while deleted/non-story entries remain normal filters');
}

async function backoffChecks() {
  at(day('2099-07-08'));
  const throttled = source('throttled', { failBoard: 'stackoverflow', status: 429, failureHeaders: { 'Retry-After': '172800' } });
  await refresh(throttled);
  const retry = await db.getRepository(E.TrendingNewsBoardRun).findOneByOrFail({ serviceDate: '2099-07-08', boardId: 'stackoverflow' });
  assert.equal(retry.status, 'failed'); assert.ok(retry.retryNotBefore instanceof NativeDate);
  assert.equal(retry.retryNotBefore.getTime(), clock + 172800000);
  const retryAt = retry.retryNotBefore.getTime();
  at(day('2099-07-09'));
  const blocked = source('too-soon'); await refresh(blocked);
  assert.equal(blocked.calls.filter((call) => call.board === 'stackoverflow').length, 0);
  assert.equal(await db.getRepository(E.TrendingNewsBoardRun).count({ where: { serviceDate: '2099-07-09', boardId: 'stackoverflow' } }), 0);
  at(retryAt);
  const resumed = source('resumed'); await refresh(resumed);
  assert.equal(resumed.calls.filter((call) => call.board === 'stackoverflow').length, 1);
  check('HTTP 429 Retry-After persists across dates/instances, suppresses requests, and resumes exactly at expiry');

  at(day('2099-07-11'));
  const successAt = clock;
  const successful = source('successful-quota', { stackMetadata: { backoff: 172800 }, githubHeaders: { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': String(Math.floor((clock + 172800000) / 1000)) } });
  assert.equal((await refresh(successful)).refreshedBoards.length, 3);
  for (const boardId of ['stackoverflow', 'github_rising']) {
    const row = await db.getRepository(E.TrendingNewsBoardRun).findOneByOrFail({ serviceDate: '2099-07-11', boardId });
    assert.equal(row.status, 'completed'); assert.equal(row.retryNotBefore.getTime(), successAt + 172800000);
  }
  at(day('2099-07-12'));
  const noQuota = source('must-wait'); await refresh(noQuota);
  assert.ok(noQuota.calls.every((call) => call.board === 'hacker_news'));
  const staleBoards = internal(await page()).filter((board) => board.id !== 'hacker_news');
  assert.ok(staleBoards.every((board) => board.status === 'stale' && board.snapshotDate === '2099-07-11'));
  at(day('2099-07-13'));
  const renewed = source('renewed-quota'); assert.equal((await refresh(renewed)).refreshedBoards.length, 3);
  check('successful Stack backoff and exhausted GitHub quota still publish valid items, persist cross-day delay and resume');

  at(day('2099-07-14'));
  const resetAt = clock + 86400000;
  const githubLimited = source('github-403', { failBoard: 'github_rising', status: 403, failureHeaders: { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': String(Math.floor(resetAt / 1000)) } });
  await refresh(githubLimited);
  const limit = await db.getRepository(E.TrendingNewsBoardRun).findOneByOrFail({ serviceDate: '2099-07-14', boardId: 'github_rising' });
  assert.equal(limit.retryNotBefore.getTime(), resetAt);
  at(resetAt); assert.equal((await refresh(source('github-recovered'))).refreshedBoards.length, 3);
  check('GitHub 403 reset headers persist their deadline and recover without authentication or bypass');
}

async function responseCleanupChecks() {
  for (const variant of ['declared', 'streamed', 'mime', 'redirect']) {
    let cancellations = 0;
    const body = new ReadableStream({
      start(controller) {
        if (variant === 'streamed') controller.enqueue(new Uint8Array(2_000_001));
      },
      cancel() { cancellations += 1; },
    });
    const headers = { 'Content-Type': variant === 'mime' ? 'text/html' : 'application/json', ...(variant === 'declared' ? { 'Content-Length': '2000001' } : {}), ...(variant === 'redirect' ? { Location: 'https://attacker.invalid/' } : {}) };
    let fetches = 0;
    await assert.rejects(fetchStackOverflow(async (_input, init) => { fetches += 1; assert.equal(init.redirect, 'manual'); return new Response(body, { status: variant === 'redirect' ? 302 : 200, headers }); }), variant === 'mime' ? /JSON/i : variant === 'redirect' ? /HTTP 302/ : /too large/i);
    assert.equal(fetches, 1); assert.equal(cancellations, 1, `${variant}: abandoned body must be cancelled`);
  }
  check('declared/streamed oversized responses, wrong MIME and manual redirects reject and cancel their bodies');
}

async function cleanup() {
  for (const item of gates) item.release();
  await Promise.allSettled([...pendingWorkers]);
  if (!db?.isInitialized || !baseline) return;
  const runs = await db.getRepository(E.TrendingNewsBoardRun).find();
  assert.ok(runs.every((row) => usedDates.has(row.serviceDate) && /^2099-07-\d{2}$/.test(row.serviceDate) && BOARDS.includes(row.boardId)), 'Refuse to delete any unowned source/date');
  await db.transaction(async (manager) => {
    for (const row of runs) await manager.getRepository(E.TrendingNewsBoardRun).delete({ serviceDate: row.serviceDate, boardId: row.boardId });
  });
  assert.equal(await db.getRepository(E.TrendingNewsItemRecord).count(), 0);
  assert.deepEqual(await fingerprints(), baseline, 'All tables must exactly match their pre-test fingerprints');
  check('only owned 2099 board/date rows removed; complete database fingerprint matches baseline');
}

(async () => {
  let failed;
  try {
    db = await new DataSource({ type: 'postgres', host: process.env.DB_HOST, port: 5432, username: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE, entities: E.entities, synchronize: false, migrationsRun: false, extra: { max: 12, options: '-c statement_timeout=20000 -c lock_timeout=10000 -c idle_in_transaction_session_timeout=20000' } }).initialize();
    assert.equal((await db.query('SELECT current_database() AS name'))[0].name, 'community_play_rehearsal');
    assert.equal(await db.getRepository(E.User).count(), 0, 'Play synthetic users must be fully cleaned before news rehearsal');
    assert.equal(await db.getRepository(E.TrendingNewsBoardRun).count(), 0, 'News test tables must begin empty');
    assert.equal(await db.getRepository(E.TrendingNewsItemRecord).count(), 0);
    assert.equal(Number((await db.query("SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='trending_news_board_runs' AND column_name='retry_not_before'"))[0].count), 1, 'FINAL migration 0028 with persisted backoff required');
    baseline = await fingerprints();
    global.Date = TestDate;
    global.fetch = async () => { throw new Error('Unexpected non-injected network access'); };
    await normalAndFailureChecks();
    await leaseCheck('2099-07-05', false);
    await leaseCheck('2099-07-06', true);
    await partialSourceCheck();
    await backoffChecks();
    await leaseCheck('2099-07-16', true, true);
    await responseCleanupChecks();
  } catch (error) { failed = error; }
  finally {
    try { await cleanup(); } catch (error) { failed = failed || error; process.stderr.write(`TRENDING_CLEANUP_FAILED ${error.message}\n`); }
    global.Date = NativeDate; global.fetch = nativeFetch;
    if (db?.isInitialized) await db.destroy();
  }
  if (failed) { process.stderr.write(`TRENDING_REHEARSAL_FAILED ${failed.stack || failed.message}\n`); process.exitCode = 1; return; }
  process.stdout.write(`${JSON.stringify({ status: 'TRENDING_REHEARSAL_OK', scenarios: passed.length, sourceNetwork: 'fully synthetic injected fetch', database: 'community_play_rehearsal', cleaned: true })}\n`);
})();
