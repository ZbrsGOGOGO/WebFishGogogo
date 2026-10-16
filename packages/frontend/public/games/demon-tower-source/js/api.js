/* =========================================================================
 * 九层妖塔 · 摸摸公司安全桥
 *
 * 玩法代码仍使用原附件的 API 对象；联网动作通过 sandbox iframe 的
 * postMessage 交给站点壳执行。iframe 不持有 JWT、Cookie 或父页面 DOM 权限。
 * ========================================================================= */
(function (global) {
  'use strict';

  const SOURCE = 'webfish-demon-tower-source-v1';
  const params = new URLSearchParams(global.location.search);
  const nonce = params.get('bridge') || '';
  const pending = new Map();
  let nextId = 0;
  let progressReady = false;
  let saveVersion = 0;
  let desiredSave = null;
  let retrySave = null;
  let inFlightSave = null;
  let persistedSave = null;
  let saveTimer = null;
  let saveRetryTimer = null;
  let saveRetryDelay = 1000;
  let saveFlight = null;
  let saveWaiters = [];
  let writeFrozen = null;
  let mutationHold = 0;
  let bridgeReady = false;
  let hydrationAnnounced = false;
  let displayName = '';
  let resolveBridgeReady;
  const whenReady = new Promise(function (resolve) { resolveBridgeReady = resolve; });

  function errorFrom(payload) {
    const error = new Error((payload && payload.message) || '联网档案暂不可用');
    if (payload && payload.code) error.code = payload.code;
    if (payload && typeof payload.status === 'number') error.status = payload.status;
    return error;
  }

  function requestId() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') return global.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    if (global.crypto && typeof global.crypto.getRandomValues === 'function') global.crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, function (value) { return value.toString(16).padStart(2, '0'); }).join('');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
  }

  function rpc(method, args) {
    if (!nonce || global.parent === global) return Promise.reject(new Error('未连接摸摸公司账号桥'));
    const id = ++nextId + '-' + Date.now();
    return new Promise(function (resolve, reject) {
      const timer = global.setTimeout(function () {
        pending.delete(id);
        const error = new Error('联网请求超时，请稍后重试');
        error.status = 0;
        reject(error);
      }, 20000);
      pending.set(id, { resolve: resolve, reject: reject, timer: timer });
      global.parent.postMessage({ source: SOURCE, nonce: nonce, kind: 'request', id: id, method: method, args: args || [] }, '*');
    });
  }

  function publishHeight() {
    if (!nonce || global.parent === global) return;
    const root = document.documentElement;
    const body = document.body;
    const height = Math.max(root.scrollHeight, root.offsetHeight, body ? body.scrollHeight : 0, body ? body.offsetHeight : 0);
    global.parent.postMessage({ source: SOURCE, nonce: nonce, kind: 'resize', height: height }, '*');
  }

  function notifyHydrated() {
    if (hydrationAnnounced || !bridgeReady || !nonce || global.parent === global) return;
    hydrationAnnounced = true;
    global.parent.postMessage({ source: SOURCE, nonce: nonce, kind: 'hydrated' }, '*');
  }

  global.addEventListener('message', function (event) {
    if (event.source !== global.parent) return;
    const message = event.data;
    if (!message || message.source !== SOURCE || message.nonce !== nonce) return;
    if (message.kind === 'init') {
      if (message.theme === 'light' || message.theme === 'dark') document.documentElement.dataset.theme = message.theme;
      if (typeof message.displayName === 'string') displayName = message.displayName.trim().slice(0, 100);
      if (!bridgeReady) {
        bridgeReady = true;
        resolveBridgeReady();
      }
      publishHeight();
      return;
    }
    if (message.kind === 'theme' && (message.theme === 'light' || message.theme === 'dark')) {
      document.documentElement.dataset.theme = message.theme;
      publishHeight();
      return;
    }
    if (message.kind !== 'response' || typeof message.id !== 'string') return;
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    global.clearTimeout(entry.timer);
    if (message.ok) entry.resolve(message.result);
    else entry.reject(errorFrom(message.error));
  });

  function settleSaveWaiters(error) {
    const waiters = saveWaiters;
    saveWaiters = [];
    waiters.forEach(function (waiter) {
      if (error) waiter.reject(error);
      else waiter.resolve({ version: saveVersion });
    });
  }

  function freezeWrites(error) {
    if (writeFrozen) return;
    writeFrozen = error;
    if (saveTimer) global.clearTimeout(saveTimer);
    if (saveRetryTimer) global.clearTimeout(saveRetryTimer);
    saveTimer = null;
    saveRetryTimer = null;
    desiredSave = null;
    retrySave = null;
    settleSaveWaiters(error);
    const banner = document.createElement('div');
    banner.id = 'cloudSaveConflict';
    banner.className = 'cloudSaveConflict';
    banner.setAttribute('role', 'alert');
    const copy = document.createElement('span');
    copy.textContent = error && error.code === 'DEMON_TOWER_SOURCE_VERSION_CONFLICT'
      ? '联网档案已在其他页面更新。当前页面已停止写入，避免覆盖；请重新载入最新档案。'
      : '联网档案当前不能继续安全写入。当前页面已停止写入；请重新载入后再操作。';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '重新载入联网档案';
    button.addEventListener('click', function () { global.location.reload(); });
    banner.appendChild(copy);
    banner.appendChild(button);
    document.body.insertBefore(banner, document.body.firstChild);
    publishHeight();
  }

  function renderMutationLock(active) {
    if (!document.body || typeof document.getElementById !== 'function') return;
    const current = document.getElementById('cloudMutationLock');
    if (!active) {
      if (current && current.parentNode) current.parentNode.removeChild(current);
      document.documentElement.removeAttribute('aria-busy');
      return;
    }
    if (current || typeof document.body.appendChild !== 'function') return;
    const lock = document.createElement('div');
    lock.id = 'cloudMutationLock';
    lock.className = 'cloudMutationLock';
    lock.setAttribute('role', 'status');
    lock.setAttribute('aria-live', 'polite');
    lock.textContent = '正在确认全服进度，请稍候…';
    document.documentElement.setAttribute('aria-busy', 'true');
    document.body.appendChild(lock);
  }

  function guardMutationInput(event) {
    if (!writeFrozen && mutationHold <= 0) return;
    const target = event && event.target;
    if (writeFrozen && target && typeof target.closest === 'function' && target.closest('#cloudSaveConflict button')) return;
    if (event && event.type === 'keydown' && event.key === 'Escape') return;
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    if (event && typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
  }

  ['pointerdown', 'mousedown', 'touchstart', 'click', 'dblclick', 'input', 'change', 'submit', 'keydown'].forEach(function (name) {
    document.addEventListener(name, guardMutationInput, true);
  });

  function shouldFreezeSave(error) {
    return error && typeof error.status === 'number' && error.status >= 400 && error.status < 500;
  }

  function scheduleRetry() {
    if (writeFrozen || mutationHold > 0 || saveRetryTimer || !retrySave) return;
    const delay = saveRetryDelay;
    saveRetryDelay = Math.min(30000, saveRetryDelay * 2);
    saveRetryTimer = global.setTimeout(function () {
      saveRetryTimer = null;
      flushSaves().catch(function () {});
    }, delay);
  }

  function flushSaves() {
    if (writeFrozen) return Promise.reject(writeFrozen);
    if (!progressReady || saveFlight || (!retrySave && !desiredSave)) return saveFlight || Promise.resolve();
    const item = retrySave || desiredSave;
    if (retrySave) retrySave = null;
    else desiredSave = null;
    inFlightSave = item;
    saveFlight = rpc('saveProgress', [{ requestId: item.requestId, expectedVersion: saveVersion, saveData: item.data }])
      .then(function (result) {
        if (result && Number.isInteger(result.version)) saveVersion = result.version;
        persistedSave = item.data;
        saveRetryDelay = 1000;
      })
      .then(function () {
        saveFlight = null;
        inFlightSave = null;
        if (desiredSave && desiredSave.data === persistedSave) desiredSave = null;
        if (retrySave || desiredSave) return flushSaves();
        settleSaveWaiters(null);
      })
      .catch(function (error) {
        saveFlight = null;
        inFlightSave = null;
        if (shouldFreezeSave(error)) freezeWrites(error);
        else {
          retrySave = item;
          scheduleRetry();
        }
        settleSaveWaiters(error);
        throw error;
      });
    return saveFlight;
  }

  function scheduleSave() {
    if (writeFrozen || !progressReady || mutationHold > 0 || saveTimer || saveRetryTimer) return;
    saveTimer = global.setTimeout(function () {
      saveTimer = null;
      flushSaves().catch(function () {});
    }, 120);
  }

  function saveProgress(data) {
    if (writeFrozen) return Promise.reject(writeFrozen);
    const serialized = serializeProgress(data);
    if (!retrySave && !inFlightSave && serialized === persistedSave) {
      desiredSave = null;
      return Promise.resolve({ version: saveVersion, unchanged: true });
    }
    if ((retrySave && retrySave.data === serialized) || (inFlightSave && inFlightSave.data === serialized)) {
      // Latest-wins: a return to the snapshot currently being resolved cancels
      // any stale intermediate desired value (A -> B -> A).
      desiredSave = null;
    } else if (!desiredSave || desiredSave.data !== serialized) {
      desiredSave = { requestId: requestId(), data: serialized };
    }
    scheduleSave();
    return new Promise(function (resolve, reject) {
      saveWaiters.push({ resolve: resolve, reject: reject });
    });
  }

  function drainSaves() {
    if (saveTimer) {
      global.clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (saveRetryTimer) {
      global.clearTimeout(saveRetryTimer);
      saveRetryTimer = null;
    }
    return flushSaves().then(function () {
      return retrySave || desiredSave ? drainSaves() : undefined;
    });
  }

  function beginMutation() {
    if (mutationHold > 0) {
      const error = new Error('上一项全服操作仍在确认，请稍候');
      error.code = 'DEMON_TOWER_SOURCE_MUTATION_IN_PROGRESS';
      error.status = 409;
      return Promise.reject(error);
    }
    mutationHold = 1;
    renderMutationLock(true);
    return drainSaves().catch(function (error) {
      mutationHold = 0;
      renderMutationLock(false);
      throw error;
    });
  }

  function endMutation() {
    mutationHold = 0;
    renderMutationLock(false);
    scheduleSave();
  }

  function serializeProgress(data) {
    const source = data && typeof data === 'object' ? data : {};
    const snapshot = {};
    Object.keys(source).forEach(function (key) {
      if (key !== 'server' && key !== 'layers' && key !== 'power' && key !== '_hasLocal') snapshot[key] = source[key];
    });
    return JSON.stringify(snapshot);
  }

  function committedWorldSave(kind, operation, result) {
    if (kind !== 'channel' || !Number.isInteger(result && result.accepted) || result.accepted >= operation.amount) return operation.saveData;
    let snapshot;
    try { snapshot = JSON.parse(operation.saveData); } catch (_) { throw new Error('联网档案原子回执无效'); }
    const inventory = snapshot && snapshot.inventory;
    if (!inventory || !Number.isSafeInteger(inventory.materials) || inventory.materials < 0) throw new Error('联网档案原子回执无效');
    inventory.materials += operation.amount - result.accepted;
    return JSON.stringify(snapshot);
  }

  function getProgress() {
    return rpc('getProgress').then(function (result) {
      saveVersion = result && Number.isInteger(result.version) ? result.version : 0;
      if (result && typeof result.saveData === 'string') {
        try { persistedSave = serializeProgress(JSON.parse(result.saveData)); }
        catch (_) { persistedSave = result.saveData; }
      } else persistedSave = null;
      progressReady = true;
      // Existing cloud data is applied synchronously by ui.js before this timer
      // runs, replacing the disposable default-state autosave.
      global.setTimeout(scheduleSave, 0);
      return result && result.saveData ? { saveData: result.saveData, version: saveVersion } : null;
    });
  }

  function worldMutation(kind, layerId, amount) {
    const operation = {
      requestId: requestId(),
      amount: amount,
      expectedVersion: saveVersion,
      saveData: serializeProgress(global.ST && global.ST.S),
    };
    const method = kind === 'damage' ? 'postDamage' : kind === 'channel' ? 'postChannel' : 'postClue';
    const payload = kind === 'damage'
      ? { requestId: operation.requestId, layerId: layerId, damage: operation.amount, expectedVersion: operation.expectedVersion, saveData: operation.saveData }
      : kind === 'channel'
        ? { requestId: operation.requestId, layerId: layerId, materials: operation.amount, expectedVersion: operation.expectedVersion, saveData: operation.saveData }
        : { requestId: operation.requestId, layerId: layerId, clues: operation.amount, expectedVersion: operation.expectedVersion, saveData: operation.saveData };
    return rpc(method, [payload]).then(function (result) {
      if (!result || !Number.isInteger(result.profileVersion)) throw new Error('联网档案原子回执无效');
      const committedSave = committedWorldSave(kind, operation, result);
      saveVersion = result.profileVersion;
      persistedSave = committedSave;
      if (desiredSave && (desiredSave.data === operation.saveData || desiredSave.data === committedSave)) desiredSave = null;
      if (!retrySave && !inFlightSave && !desiredSave) settleSaveWaiters(null);
      return result;
    }).catch(function (error) {
      // The parent already retries transport failure once with this exact
      // logical request id. If no definitive receipt reaches us after that,
      // the server may still have committed. Freeze every further write and
      // reload the authoritative cloud snapshot instead of re-running random
      // combat or overwriting it with a local rollback.
      freezeWrites(error);
      throw error;
    });
  }

  global.API = {
    PLAYER: 'current-session',
    whenReady: whenReady,
    getServer: function () { return rpc('getServer'); },
    getLayers: function () { return rpc('getLayers'); },
    getProgress: getProgress,
    saveProgress: saveProgress,
    beginMutation: beginMutation,
    endMutation: endMutation,
    postDamage: function (layerId, damage) {
      return worldMutation('damage', layerId, damage);
    },
    postChannel: function (layerId, materials) {
      return worldMutation('channel', layerId, materials);
    },
    postClue: function (layerId) {
      return worldMutation('clue', layerId, 1);
    },
    // damage/channel/clue already record contribution atomically on the server.
    recordContribution: function () { return Promise.resolve({ recorded: true }); },
    getContribution: function () { return rpc('getContribution'); },
    getFriends: function () { return rpc('getFriends'); },
    getProfile: function (publicId) { return rpc('getProfile', [{ publicId: publicId }]); },
    getSettings: function () { return rpc('getSettings'); },
    saveSetting: function () { return Promise.reject(new Error('普通账号不能修改全服配置')); },
    getStories: function () { return rpc('getStories'); },
    getRanking: function (limit) { return rpc('getRanking', [{ limit: limit || 50 }]); },
    notifyHydrated: notifyHydrated
  };
  global.API.getDisplayName = function () { return displayName; };

  const initialTheme = params.get('theme');
  if (initialTheme === 'dark' || initialTheme === 'light') document.documentElement.dataset.theme = initialTheme;
  if (typeof ResizeObserver === 'function') new ResizeObserver(publishHeight).observe(document.documentElement);
  global.addEventListener('load', publishHeight);
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
    event.preventDefault();
    global.parent.postMessage({ source: SOURCE, nonce: nonce, kind: 'escape' }, '*');
  }, true);
  global.setTimeout(publishHeight, 0);
  function announceReady() {
    if (!bridgeReady && nonce && global.parent !== global) global.parent.postMessage({ source: SOURCE, nonce: nonce, kind: 'ready' }, '*');
  }
  announceReady();
  const readyTimer = global.setInterval(function () {
    if (bridgeReady) global.clearInterval(readyTimer);
    else announceReady();
  }, 500);
})(window);
