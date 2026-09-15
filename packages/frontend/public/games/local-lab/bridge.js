/* SPDX-License-Identifier: MIT
 * Copyright (c) 2026 ZbrsGOGOGO/WebFishGogogo contributors
 * Full license: /licenses/local-lab-bridge-MIT.txt
 * Momo local work drafts: scheduler isolation, not an account/game API.
 * Loaded before every audited classic game script. No storage, fetch or eval.
 */
(function () {
  'use strict';
  var channel = 'momo-local-lab';
  var nonce = new URLSearchParams(location.hash.slice(1)).get('momo');
  var parentOrigin;
  try { parentOrigin = new URL(document.referrer).origin; } catch (_) { parentOrigin = null; }
  var valid = parent !== window && /^[a-f0-9-]{36}$/i.test(nonce || '') && parentOrigin === location.origin;
  var NativeDate = Date;
  var nativeNow = performance.now.bind(performance);
  var nativeTimeout = window.setTimeout.bind(window);
  var nativeClear = window.clearTimeout.bind(window);
  var nativeRaf = window.requestAnimationFrame.bind(window);
  var nativeCancel = window.cancelAnimationFrame.bind(window);
  var startPerf = nativeNow();
  var startWall = NativeDate.now();
  var frozen = startPerf;
  var offset = 0;
  var active = false;
  var loaded = false;
  var failed = false;
  var nextId = 1;
  var rafs = new Map();
  var timers = new Map();
  var pulse = null;
  function now() { return active ? nativeNow() - offset : frozen; }
  function wallNow() { return startWall + now() - startPerf; }
  function emit(type) { if (valid) parent.postMessage({ channel: channel, nonce: nonce, type: type }, parentOrigin); }
  function fail() { failed = true; pause(false); emit('error'); }
  function draw() {
    pulse = null;
    if (!active) return;
    var batch = Array.from(rafs.entries());
    batch.forEach(function (entry) {
      if (!active || !rafs.has(entry[0])) return;
      rafs.delete(entry[0]);
      try { entry[1](now()); } catch (error) { fail(); console.error(error); }
    });
    scheduleDraw();
  }
  function scheduleDraw() { if (active && pulse === null && rafs.size) pulse = nativeRaf(draw); }
  function scheduleTimer(id, timer) {
    if (!active || timer.native !== null) return;
    timer.native = nativeTimeout(function () {
      timer.native = null;
      if (!active || !timers.has(id)) return;
      if (timer.interval === null) timers.delete(id);
      else timer.deadline = now() + timer.interval;
      try { timer.callback.apply(window, timer.args); } catch (error) { fail(); console.error(error); }
      if (timers.has(id)) scheduleTimer(id, timer);
    }, Math.max(0, timer.deadline - now()));
  }
  function timer(callback, delay, interval, args) {
    // Browser string timers evaluate code; these reviewed games need functions only.
    if (typeof callback !== 'function') throw new TypeError('String timers are not supported in local work drafts');
    var duration = Math.max(interval ? 1 : 0, Number(delay) || 0);
    var id = nextId++;
    var record = { callback: callback, args: args, interval: interval ? duration : null, deadline: now() + duration, native: null };
    timers.set(id, record); scheduleTimer(id, record); return id;
  }
  function clear(id) {
    var record = timers.get(id);
    if (record && record.native !== null) nativeClear(record.native);
    timers.delete(id);
  }
  function pause(notify) {
    if (active) {
      frozen = now(); active = false;
      if (pulse !== null) { nativeCancel(pulse); pulse = null; }
      timers.forEach(function (record) { if (record.native !== null) nativeClear(record.native); record.native = null; });
    }
    document.documentElement.dataset.momoPaused = 'true';
    if (notify) emit('paused');
  }
  function resume() {
    if (!valid || failed || !loaded || document.hidden || active) return;
    offset = nativeNow() - frozen; active = true;
    document.documentElement.dataset.momoPaused = 'false';
    timers.forEach(function (record, id) { scheduleTimer(id, record); }); scheduleDraw();
    // Recalculate canvases after a previously covered work draft becomes visible.
    window.dispatchEvent(new Event('resize'));
  }
  window.requestAnimationFrame = function (callback) { var id = nextId++; rafs.set(id, callback); scheduleDraw(); return id; };
  window.cancelAnimationFrame = function (id) { rafs.delete(id); };
  window.setTimeout = function (callback, delay) { return timer(callback, delay, false, Array.prototype.slice.call(arguments, 2)); };
  window.setInterval = function (callback, delay) { return timer(callback, delay, true, Array.prototype.slice.call(arguments, 2)); };
  window.clearTimeout = window.clearInterval = clear;
  function VirtualDate() {
    var args = Array.prototype.slice.call(arguments);
    if (!new.target) return new NativeDate(wallNow()).toString();
    return Reflect.construct(NativeDate, args.length ? args : [wallNow()], new.target === VirtualDate ? NativeDate : new.target);
  }
  VirtualDate.prototype = NativeDate.prototype;
  Object.setPrototypeOf(VirtualDate, NativeDate);
  VirtualDate.now = wallNow;
  window.Date = VirtualDate;
  try { Object.defineProperty(performance, 'now', { configurable: true, value: now }); } catch (_) { fail(); }
  document.documentElement.dataset.momoPaused = 'true';
  window.addEventListener('message', function (event) {
    if (!valid || event.source !== parent || event.origin !== parentOrigin || !event.data || event.data.channel !== channel || event.data.nonce !== nonce) return;
    if (event.data.command === 'hello') { if (loaded && !failed) emit('ready'); }
    else if (event.data.command === 'resume') resume();
    else if (event.data.command === 'pause') pause(false);
  });
  window.addEventListener('load', function () { loaded = true; if (!failed && valid) emit('ready'); });
  // Script/style/image failures do not bubble; capture prevents a missing
  // runtime asset from reporting a misleading ready document.
  window.addEventListener('error', fail, true);
  window.addEventListener('unhandledrejection', fail);
  window.addEventListener('blur', function () {
    // Internal iframe/input focus transfers may briefly blur the window.
    // Real tab/OS focus loss remains paused; never resume on focus return.
    nativeTimeout(function () { if (!document.hasFocus()) pause(true); }, 0);
  });
  document.addEventListener('visibilitychange', function () { if (document.hidden) pause(true); });
  window.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    event.preventDefault(); event.stopImmediatePropagation(); pause(false); emit('escape');
  }, true);
})();
