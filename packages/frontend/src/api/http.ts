// packages/frontend/src/api/http.ts
// 统一 fetch 包装器：注入 Bearer JWT、拼接 base URL、解析 JSON 与错误。
//
// 所有领域 api/ 模块都经此包装器发起请求，保证鉴权头与错误处理一致。

import { API_BASE_URL } from './config';
import { clearStoredToken, getStoredToken } from './token-storage';

/**
 * 结构化 API 错误。
 * - status：HTTP 状态码（网络错误为 0）。
 * - body：后端返回的错误体（若可解析）。
 */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/** 请求选项：在标准 fetch 之上支持 query 参数与鉴权开关。 */
export interface RequestOptions extends Omit<RequestInit, 'body'> {
  /** 查询参数；值为 undefined/null 的键会被忽略。 */
  query?: Record<string, string | number | boolean | undefined | null>;
  /** 请求体：普通对象将以 JSON 序列化；FormData 原样传递（用于 multipart 上传）。 */
  body?: unknown;
  /** 是否附带 Authorization 头（默认 true）。登录/注册等公开端点传 false。 */
  auth?: boolean;
}

/** 拼接 base URL、路径与 query 参数。 */
function buildUrl(
  path: string,
  query?: RequestOptions['query'],
): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${API_BASE_URL}${normalizedPath}`;
  if (!query) {
    return url;
  }
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) {
      search.append(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `${url}?${qs}` : url;
}

/**
 * 发起一次 API 请求并解析响应。
 *
 * - 自动注入 `Authorization: Bearer <jwt>`（除非 auth === false 或无令牌）。
 * - 普通对象 body 自动 JSON 序列化并设置 Content-Type；FormData 保持原样，
 *   由浏览器设置带 boundary 的 multipart Content-Type。
 * - 2xx：204/空响应返回 undefined，否则解析 JSON。
 * - 非 2xx：抛出 {@link ApiError}；401 时清除本地失效令牌。
 */
export async function request<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { query, body, auth = true, headers, ...rest } = options;

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

  if (auth) {
    const token = getStoredToken();
    if (token) {
      finalHeaders.set('Authorization', `Bearer ${token}`);
    }
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      ...rest,
      headers: finalHeaders,
      body: finalBody,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '网络请求失败';
    throw new ApiError(0, message);
  }

  const payload = await parseBody(response);

  if (!response.ok) {
    if (response.status === 401) {
      // 令牌失效：清除本地持久化令牌，避免后续请求继续携带无效凭据。
      clearStoredToken();
    }
    throw new ApiError(
      response.status,
      extractMessage(payload) ?? response.statusText,
      payload,
    );
  }

  return payload as T;
}

/** 解析响应体：无内容返回 undefined，JSON 优先，回退文本。 */
async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return undefined;
  }
  const text = await response.text();
  if (text.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** 从后端错误体中提取可读信息（NestJS 风格 { message } 或字符串）。 */
function extractMessage(payload: unknown): string | null {
  if (typeof payload === 'string') {
    return payload;
  }
  if (payload && typeof payload === 'object' && 'message' in payload) {
    const message = (payload as { message: unknown }).message;
    if (typeof message === 'string') {
      return message;
    }
    if (Array.isArray(message)) {
      return message.join('; ');
    }
  }
  return null;
}

/** 便捷方法：GET / POST / PUT / PATCH / DELETE。 */
export const http = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'DELETE' }),
};
