import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { DemonTowerSourceProgress, DemonTowerSourceWorld } from '@stealth-reader/shared';

import { communityDemonTowerSourceApi } from '../../../api/community-demon-tower-source';
import { CommunityApiError, getCommunitySessionGeneration } from '../../../api/community-http';
import { useCommunityAuthStore } from '../../../app/store/community-auth-store';
import { useCommunityThemeStore } from '../../../app/store/community-theme-store';
import { useGamePrivacy } from '../GamePrivacyContext';
import styles from './DemonTowerSource.module.css';

const BRIDGE_SOURCE = 'webfish-demon-tower-source-v1';
const MIN_FRAME_HEIGHT = 780;
const MAX_FRAME_HEIGHT = 16_000;
const STARTUP_TIMEOUT_MS = 25_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Phase = 'loading' | 'ready' | 'error';

interface BridgeRequest {
  source: typeof BRIDGE_SOURCE;
  nonce: string;
  kind: 'request';
  id: string;
  method: string;
  args: unknown[];
}

function bridgeNonce(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(24);
  if (typeof globalThis.crypto?.getRandomValues === 'function') globalThis.crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('请求参数无效');
  return value as Record<string, unknown>;
}

function integer(value: unknown, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || Number(value) < minimum || Number(value) > maximum) throw new Error('请求参数超出允许范围');
  return Number(value);
}

function logicalRequestId(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new Error('请求标识无效');
  return value.toLowerCase();
}

function singleArgument(args: unknown[], keys: readonly string[]): Record<string, unknown> {
  if (args.length !== 1) throw new Error('请求参数无效');
  const result = objectValue(args[0]);
  const actual = Object.keys(result);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) throw new Error('请求参数无效');
  return result;
}

function safeBridgeError(error: unknown): { status: number; code: string; message: string } {
  if (error instanceof CommunityApiError) {
    const code = error.body && typeof error.body === 'object' && 'code' in error.body
      ? String((error.body as { code?: unknown }).code ?? '')
      : '';
    if (error.status === 401) return { status: 401, code, message: '登录已失效，请重新登录后再试' };
    if (error.status === 403) return { status: 403, code, message: '当前账号不能执行这项操作' };
    if (error.status === 409) return { status: 409, code, message: '档案已在别处更新，请刷新联网档案' };
    if (error.status === 429) return { status: 429, code, message: '操作较快，请稍候再试' };
    if (error.status === 0 || error.status >= 500) return { status: error.status, code, message: '联网服务暂时不可用，请稍后重试' };
    return { status: error.status, code, message: '操作未完成，请刷新状态后再试' };
  }
  return { status: 400, code: 'INVALID_SOURCE_REQUEST', message: error instanceof Error ? error.message : '请求无效' };
}

function isBridgeRequest(value: unknown, nonce: string): value is BridgeRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const message = value as Partial<BridgeRequest>;
  const keys = Object.keys(message);
  return keys.length === 6 && keys.every((key) => ['source', 'nonce', 'kind', 'id', 'method', 'args'].includes(key)) &&
    message.source === BRIDGE_SOURCE && message.nonce === nonce && message.kind === 'request' &&
    typeof message.id === 'string' && message.id.length > 0 && message.id.length <= 100 &&
    typeof message.method === 'string' && Array.isArray(message.args);
}

export function DemonTowerPage(): JSX.Element {
  const user = useCommunityAuthStore((state) => state.user);
  const generation = getCommunitySessionGeneration();
  if (!user?.publicId) {
    return <section className={styles.page}><p className={styles.error} role="alert">请先登录有效账号，再读取九层妖塔联网档案。</p></section>;
  }
  return <DemonTowerSourceFrame key={`${user.publicId}:${generation}`} displayName={user.displayName ?? user.username ?? '寻道者'} />;
}

function DemonTowerSourceFrame({ displayName }: { displayName: string }): JSX.Element {
  const frame = useRef<HTMLIFrameElement>(null);
  const { toggleCover } = useGamePrivacy();
  const toggleCoverRef = useRef(toggleCover);
  toggleCoverRef.current = toggleCover;
  const theme = useCommunityThemeStore((state) => state.resolved);
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') === 'rank' ? 'rank' : '';
  const [attempt, setAttempt] = useState(0);
  // A profile-name change restarts the opaque child as one complete handshake;
  // merely restarting this effect would wait for a `ready` event the old child
  // has already stopped announcing.
  const nonce = useMemo(bridgeNonce, [attempt, displayName]);
  const [phase, setPhase] = useState<Phase>('loading');
  const [frameHeight, setFrameHeight] = useState(MIN_FRAME_HEIGHT);
  const [error, setError] = useState<string | null>(null);
  const worldCache = useRef<{ expiresAt: number; value: Promise<DemonTowerSourceWorld> } | null>(null);
  const startupProgress = useRef<DemonTowerSourceProgress | null>(null);
  const startupProgressPending = useRef<Promise<DemonTowerSourceProgress> | null>(null);
  const startupFailed = useRef(false);
  const startupComplete = useRef(false);
  const hydrationComplete = useRef(false);
  const requestController = useRef<AbortController | null>(null);

  const sourceUrl = useMemo(() => {
    const query = new URLSearchParams({ bridge: nonce });
    if (initialTab) query.set('tab', initialTab);
    return `/games/demon-tower-source/index.html?${query.toString()}`;
  }, [initialTab, nonce]);

  const post = useCallback((message: Record<string, unknown>): void => {
    frame.current?.contentWindow?.postMessage({ source: BRIDGE_SOURCE, nonce, ...message }, '*');
  }, [nonce]);

  const getWorld = useCallback((signal?: AbortSignal): Promise<DemonTowerSourceWorld> => {
    const current = worldCache.current;
    if (current && current.expiresAt > Date.now()) return current.value;
    const value = communityDemonTowerSourceApi.world(signal);
    worldCache.current = { value, expiresAt: Date.now() + 1_000 };
    value.catch(() => { if (worldCache.current?.value === value) worldCache.current = null; });
    return value;
  }, []);

  const runRequest = useCallback(async (request: BridgeRequest): Promise<unknown> => {
    switch (request.method) {
      case 'getServer':
        if (request.args.length) throw new Error('请求参数无效');
        return (await getWorld()).server;
      case 'getLayers':
        if (request.args.length) throw new Error('请求参数无效');
        return (await getWorld()).layers;
      case 'getProgress': {
        if (request.args.length) throw new Error('请求参数无效');
        if (startupProgress.current) {
          const result = startupProgress.current;
          startupProgress.current = null;
          return result;
        }
        return communityDemonTowerSourceApi.progress(requestController.current?.signal);
      }
      case 'saveProgress': {
        const input = singleArgument(request.args, ['requestId', 'expectedVersion', 'saveData']);
        const expectedVersion = integer(input.expectedVersion, 0, 2_147_483_647);
        if (typeof input.saveData !== 'string' || input.saveData.length < 2 || input.saveData.length > 524_288) throw new Error('联网档案大小无效');
        return communityDemonTowerSourceApi.saveProgress({ requestId: logicalRequestId(input.requestId), expectedVersion, saveData: input.saveData }, requestController.current?.signal);
      }
      case 'postDamage': {
        const input = singleArgument(request.args, ['requestId', 'layerId', 'damage', 'expectedVersion', 'saveData']);
        if (typeof input.saveData !== 'string' || input.saveData.length < 2 || input.saveData.length > 524_288) throw new Error('联网档案大小无效');
        const receipt = await communityDemonTowerSourceApi.damage({
          requestId: logicalRequestId(input.requestId),
          layerId: integer(input.layerId, 1, 9),
          amount: integer(input.damage, 0, 100_000),
          expectedVersion: integer(input.expectedVersion, 1, 2_147_483_647),
          saveData: input.saveData,
        }, requestController.current?.signal);
        worldCache.current = null;
        return { ...receipt.layer, accepted: receipt.accepted, unlockedLayer: receipt.unlockedLayer, replayed: receipt.replayed, profileVersion: receipt.profileVersion, profileUpdatedAt: receipt.profileUpdatedAt };
      }
      case 'postChannel': {
        const input = singleArgument(request.args, ['requestId', 'layerId', 'materials', 'expectedVersion', 'saveData']);
        if (typeof input.saveData !== 'string' || input.saveData.length < 2 || input.saveData.length > 524_288) throw new Error('联网档案大小无效');
        const receipt = await communityDemonTowerSourceApi.channel({
          requestId: logicalRequestId(input.requestId),
          layerId: integer(input.layerId, 1, 9),
          amount: integer(input.materials, 1, 20),
          expectedVersion: integer(input.expectedVersion, 1, 2_147_483_647),
          saveData: input.saveData,
        }, requestController.current?.signal);
        worldCache.current = null;
        return { ...receipt.layer, accepted: receipt.accepted, unlockedLayer: receipt.unlockedLayer, replayed: receipt.replayed, profileVersion: receipt.profileVersion, profileUpdatedAt: receipt.profileUpdatedAt };
      }
      case 'postClue': {
        const input = singleArgument(request.args, ['requestId', 'layerId', 'clues', 'expectedVersion', 'saveData']);
        if (typeof input.saveData !== 'string' || input.saveData.length < 2 || input.saveData.length > 524_288) throw new Error('联网档案大小无效');
        const receipt = await communityDemonTowerSourceApi.clue({
          requestId: logicalRequestId(input.requestId),
          layerId: integer(input.layerId, 1, 9),
          amount: integer(input.clues, 1, 1),
          expectedVersion: integer(input.expectedVersion, 1, 2_147_483_647),
          saveData: input.saveData,
        }, requestController.current?.signal);
        worldCache.current = null;
        return { ...receipt.layer, accepted: receipt.accepted, unlockedLayer: receipt.unlockedLayer, replayed: receipt.replayed, profileVersion: receipt.profileVersion, profileUpdatedAt: receipt.profileUpdatedAt };
      }
      case 'getContribution':
        if (request.args.length) throw new Error('请求参数无效');
        return communityDemonTowerSourceApi.contribution(requestController.current?.signal);
      case 'getFriends':
        if (request.args.length) throw new Error('请求参数无效');
        return communityDemonTowerSourceApi.friends(requestController.current?.signal);
      case 'getProfile': {
        const input = singleArgument(request.args, ['publicId']);
        if (typeof input.publicId !== 'string' || input.publicId.length < 1 || input.publicId.length > 100) throw new Error('好友编号无效');
        return communityDemonTowerSourceApi.battleProfile(input.publicId, requestController.current?.signal);
      }
      case 'getSettings':
        if (request.args.length) throw new Error('请求参数无效');
        return communityDemonTowerSourceApi.settings(requestController.current?.signal);
      case 'getStories':
        if (request.args.length) throw new Error('请求参数无效');
        return communityDemonTowerSourceApi.stories(requestController.current?.signal);
      case 'getRanking': {
        const input = singleArgument(request.args, ['limit']);
        return communityDemonTowerSourceApi.ranking(integer(input.limit, 1, 50), requestController.current?.signal);
      }
      default:
        throw new Error('不支持的九层妖塔请求');
    }
  }, [getWorld]);

  useEffect(() => {
    startupFailed.current = false;
    startupProgress.current = null;
    startupProgressPending.current = null;
    worldCache.current = null;
    startupComplete.current = false;
    hydrationComplete.current = false;
    const controller = new AbortController();
    requestController.current = controller;
    setPhase('loading');
    setError(null);
    setFrameHeight(MIN_FRAME_HEIGHT);

    const message = (event: MessageEvent): void => {
      // The iframe deliberately has an opaque origin. Source-window + nonce +
      // strict message validation forms the complete trust boundary.
      if (event.source !== frame.current?.contentWindow || event.origin !== 'null') return;
      const data = event.data as Record<string, unknown> | null;
      if (!data || data.source !== BRIDGE_SOURCE || data.nonce !== nonce) return;
      if (data.kind === 'ready') {
        if (startupFailed.current || startupProgressPending.current) return;
        startupProgressPending.current = Promise.all([
          communityDemonTowerSourceApi.progress(controller.signal),
          getWorld(controller.signal),
        ]).then(([progress]) => progress);
        void startupProgressPending.current.then((progress) => {
          if (controller.signal.aborted) return;
          startupProgress.current = progress;
          startupComplete.current = true;
          post({ kind: 'init', theme: themeRef.current, displayName: displayName.slice(0, 100) });
        }).catch((reason: unknown) => {
          if (controller.signal.aborted) return;
          startupFailed.current = true;
          setError(safeBridgeError(reason).message);
          setPhase('error');
        });
        return;
      }
      if (data.kind === 'hydrated') {
        if (!startupComplete.current || startupFailed.current) return;
        hydrationComplete.current = true;
        setPhase('ready');
        return;
      }
      if (data.kind === 'resize' && typeof data.height === 'number' && Number.isFinite(data.height)) {
        setFrameHeight(Math.min(MAX_FRAME_HEIGHT, Math.max(MIN_FRAME_HEIGHT, Math.ceil(data.height))));
        return;
      }
      if (data.kind === 'escape') {
        toggleCoverRef.current?.();
        return;
      }
      if (!isBridgeRequest(data, nonce)) return;
      if (!startupComplete.current || startupFailed.current) return;
      void runRequest(data).then((result) => post({ kind: 'response', id: data.id, ok: true, result }))
        .catch((reason: unknown) => post({ kind: 'response', id: data.id, ok: false, error: safeBridgeError(reason) }));
    };
    window.addEventListener('message', message);
    const timeout = window.setTimeout(() => {
      if (hydrationComplete.current || startupFailed.current) return;
      startupFailed.current = true;
      controller.abort();
      setError('游戏资源或联网档案未能及时就绪，请重新加载。');
      setPhase('error');
    }, STARTUP_TIMEOUT_MS);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener('message', message);
      startupFailed.current = true;
      controller.abort();
      if (requestController.current === controller) requestController.current = null;
    };
  }, [displayName, getWorld, initialTab, nonce, post, runRequest]);

  useEffect(() => {
    if (phase === 'ready') post({ kind: 'theme', theme });
  }, [phase, post, theme]);

  const reload = (): void => setAttempt((value) => value + 1);

  return <section className={styles.page} aria-label="九层妖塔源码版">
    <header className={styles.heading}>
      <div><span className={styles.eyebrow}>SOURCE EDITION / ONLINE PROFILE</span><h1>九层妖塔</h1><p>已完整切换为你提供的最新源码玩法，角色进度与当前账号绑定。</p></div>
      <div className={styles.headingActions}><Link to="/games">返回小游戏专区</Link><button type="button" onClick={reload}>重新加载</button></div>
    </header>
    <div className={styles.boundary} role="note"><strong>源码版 2fe1c88e</strong><span>联网存档</span><span>塔内办公币为本玩法独立货币，不等于网站办公币，也不会互相扣除或兑换。</span></div>
    {error ? <div className={styles.error} role="alert"><span>{error}</span><button type="button" onClick={reload}>重新连接</button></div> : null}
    <div className={styles.frameShell} data-phase={phase} style={{ minHeight: Math.min(frameHeight, 1_000) }}>
      <iframe
        key={nonce}
        ref={frame}
        title="九层妖塔源码版游戏画面"
        src={sourceUrl}
        sandbox="allow-scripts allow-modals"
        referrerPolicy="no-referrer"
        allow="camera 'none'; microphone 'none'; geolocation 'none'; payment 'none'; autoplay 'none'"
        style={{ height: frameHeight }}
        onError={() => {
          startupFailed.current = true;
          setError('九层妖塔静态资源加载失败，请重新加载。');
          setPhase('error');
        }}
      />
      {phase === 'loading' ? <div className={styles.loading} role="status"><span className={styles.spinner} aria-hidden="true" /><strong>正在核对联网档案…</strong><small>读取完成前不会创建或覆盖存档</small></div> : null}
    </div>
    <details className={styles.details}><summary>存档、安全与来源说明</summary><p>游戏源码在隔离沙箱中运行，不能读取网站 Cookie、令牌或父页面。账号接口只由本站外层白名单桥调用；每次请求同时校验当前画面、临时随机标识和参数范围。</p><p>角色、装备和进度保存到当前网站账号。旧版妖塔数据保留作只读回滚，不与本源码版角色、经济或排行榜混算。</p><p>来源与改动记录见 <a href="/games/demon-tower-source/SOURCE.md" target="_blank" rel="noreferrer">源码清单</a>；许可见 <a href="/licenses/demon-tower-source/LICENSE" target="_blank" rel="noreferrer">MIT License</a>。</p></details>
  </section>;
}
