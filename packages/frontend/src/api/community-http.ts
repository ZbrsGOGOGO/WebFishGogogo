import { API_BASE_URL } from './config';

export class CommunityApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'CommunityApiError';
    this.status = status;
    this.body = body;
  }
}

export interface CommunitySessionEnvelope<TUser = unknown> {
  accessToken: string;
  csrfToken?: string;
  user: TUser;
}

export interface CommunityRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  auth?: boolean;
  retryAfterRefresh?: boolean;
}

let accessToken: string | null = null;
let csrfToken: string | null = null;
let refreshPromise: Promise<CommunitySessionEnvelope> | null = null;
let invalidatedHandler: (() => void) | null = null;
const COMMUNITY_REFRESH_LOCK_NAME = 'zbrs-community-refresh-v1';
const ROTATION_RACE_RETRY_DELAY_MS = 150;

export function getCommunityAccessToken(): string | null {
  return accessToken;
}

export function setCommunitySessionTokens(
  token: string | null,
  nextCsrfToken?: string | null,
): void {
  accessToken = token;
  csrfToken = nextCsrfToken ?? null;
}

export function setCommunitySessionInvalidatedHandler(
  handler: (() => void) | null,
): void {
  invalidatedHandler = handler;
}

function buildUrl(
  path: string,
  query?: CommunityRequestOptions['query'],
): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${API_BASE_URL}${normalizedPath}`;
  if (!query) return url;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) search.set(key, String(value));
  }
  const suffix = search.toString();
  return suffix ? `${url}?${suffix}` : url;
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractMessage(payload: unknown, fallback: string): string {
  if (typeof payload === 'string' && payload) return payload;
  if (payload && typeof payload === 'object' && 'message' in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
    if (Array.isArray(message)) return message.join('; ');
  }
  return fallback || '请求失败，请稍后重试';
}

async function rawRequest<T>(
  path: string,
  options: CommunityRequestOptions,
  token: string | null,
): Promise<T> {
  const {
    body,
    query,
    auth: _auth,
    retryAfterRefresh: _retryAfterRefresh,
    headers,
    ...requestInit
  } = options;
  const finalHeaders = new Headers(headers);
  let finalBody: BodyInit | undefined;

  if (body !== undefined && body !== null) {
    if (body instanceof FormData) {
      finalBody = body;
    } else {
      finalBody = JSON.stringify(body);
      if (!finalHeaders.has('Content-Type')) {
        finalHeaders.set('Content-Type', 'application/json');
      }
    }
  }
  if (token) finalHeaders.set('Authorization', `Bearer ${token}`);
  const method = (requestInit.method ?? 'GET').toUpperCase();
  if (csrfToken && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    finalHeaders.set('X-CSRF-Token', csrfToken);
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      ...requestInit,
      headers: finalHeaders,
      body: finalBody,
      credentials: 'include',
    });
  } catch (error) {
    throw new CommunityApiError(
      0,
      error instanceof Error ? error.message : '网络请求失败',
    );
  }

  const payload = await parseBody(response);
  if (!response.ok) {
    throw new CommunityApiError(
      response.status,
      extractMessage(payload, response.statusText),
      payload,
    );
  }
  return payload as T;
}

function isRefreshRotationRace(error: unknown): boolean {
  if (!(error instanceof CommunityApiError) || error.status !== 409) return false;
  if (!error.body || typeof error.body !== 'object' || !('code' in error.body)) return false;
  return (error.body as { code?: unknown }).code === 'REFRESH_TOKEN_ROTATION_RACE';
}

function waitForRefreshRotation(): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ROTATION_RACE_RETRY_DELAY_MS);
  });
}

async function requestRefreshOnce(): Promise<CommunitySessionEnvelope> {
  try {
    return await rawRequest<CommunitySessionEnvelope>(
      '/v1/auth/refresh',
      { method: 'POST', auth: false, retryAfterRefresh: false },
      null,
    );
  } catch (error) {
    if (!isRefreshRotationRace(error)) throw error;
    await waitForRefreshRotation();
    // 只对后端明确标记的 refresh 轮换竞态重试一次；第二次失败原样返回。
    return rawRequest<CommunitySessionEnvelope>(
      '/v1/auth/refresh',
      { method: 'POST', auth: false, retryAfterRefresh: false },
      null,
    );
  }
}

function requestRefreshWithCrossTabLock(): Promise<CommunitySessionEnvelope> {
  const lockManager = globalThis.navigator?.locks;
  if (!lockManager || typeof lockManager.request !== 'function') {
    return requestRefreshOnce();
  }
  return lockManager
    .request(
      COMMUNITY_REFRESH_LOCK_NAME,
      { mode: 'exclusive' },
      () => requestRefreshOnce(),
    )
    .then((session) => session);
}

/**
 * 使用 HttpOnly 刷新 Cookie 恢复短期访问令牌。Promise 在模块内单飞，确保
 * 首屏 StrictMode 和并发 401 不会制造多个刷新令牌轮换请求。
 */
export function refreshCommunitySession<TUser = unknown>(): Promise<
  CommunitySessionEnvelope<TUser>
> {
  if (refreshPromise) {
    return refreshPromise as Promise<CommunitySessionEnvelope<TUser>>;
  }

  refreshPromise = requestRefreshWithCrossTabLock()
    .then((session) => {
      if (!session || typeof session.accessToken !== 'string' || !session.accessToken) {
        throw new CommunityApiError(502, '会话响应缺少访问令牌');
      }
      setCommunitySessionTokens(session.accessToken, session.csrfToken);
      return session;
    })
    .catch((error) => {
      setCommunitySessionTokens(null);
      if (
        error instanceof CommunityApiError &&
        (error.status === 401 || error.status === 403)
      ) {
        invalidatedHandler?.();
      }
      throw error;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise as Promise<CommunitySessionEnvelope<TUser>>;
}

export async function communityRequest<T = unknown>(
  path: string,
  options: CommunityRequestOptions = {},
): Promise<T> {
  const auth = options.auth ?? true;
  const method = (options.method ?? 'GET').toUpperCase();
  // 未明确声明幂等的写请求绝不自动重放，避免 401 到达客户端前服务端其实
  // 已完成投喂、邀请、奖励或资产写入。调用方只有在具备幂等键时才可显式开启。
  const retryAfterRefresh =
    options.retryAfterRefresh ?? ['GET', 'HEAD', 'OPTIONS'].includes(method);
  try {
    return await rawRequest<T>(path, options, auth ? accessToken : null);
  } catch (error) {
    if (
      !auth ||
      !retryAfterRefresh ||
      !(error instanceof CommunityApiError) ||
      error.status !== 401
    ) {
      throw error;
    }
    await refreshCommunitySession();
    return rawRequest<T>(
      path,
      { ...options, retryAfterRefresh: false },
      accessToken,
    );
  }
}

export const communityHttp = {
  get: <T>(path: string, options?: CommunityRequestOptions) =>
    communityRequest<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: CommunityRequestOptions) =>
    communityRequest<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, options?: CommunityRequestOptions) =>
    communityRequest<T>(path, { ...options, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, options?: CommunityRequestOptions) =>
    communityRequest<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: CommunityRequestOptions) =>
    communityRequest<T>(path, { ...options, method: 'DELETE' }),
};

export function resetCommunityHttpForTests(): void {
  setCommunitySessionTokens(null);
  setCommunitySessionInvalidatedHandler(null);
  refreshPromise = null;
}
