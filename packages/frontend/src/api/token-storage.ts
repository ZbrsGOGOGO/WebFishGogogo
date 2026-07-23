// packages/frontend/src/api/token-storage.ts
// JWT 访问令牌的持久化存取（localStorage）。
//
// 该模块是 api 层与 UI 状态层之间的令牌单一来源：fetch 包装器从此读取
// Bearer 令牌，auth store 在登录/登出时写入/清除。抽成独立模块可避免
// api 层反向依赖状态层，同时便于测试时替换存储实现。

import { AUTH_TOKEN_STORAGE_KEY } from './config';

/** 读取已持久化的 JWT；无令牌或环境无 localStorage 时返回 null。 */
export function getStoredToken(): string | null {
  try {
    return globalThis.localStorage?.getItem(AUTH_TOKEN_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

/** 持久化 JWT 访问令牌。 */
export function setStoredToken(token: string): void {
  try {
    globalThis.localStorage?.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  } catch {
    // 忽略隐私模式 / 存储不可用等异常，令牌仍保留在内存状态中。
  }
}

/** 清除已持久化的 JWT（登出或令牌失效时）。 */
export function clearStoredToken(): void {
  try {
    globalThis.localStorage?.removeItem(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    // 同上，忽略存储异常。
  }
}
