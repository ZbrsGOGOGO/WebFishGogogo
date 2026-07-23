// packages/frontend/src/app/store/auth-store.ts
// 全局认证状态（Zustand）：持有 JWT 访问令牌与当前用户。
//
// 令牌以 localStorage 为持久化来源（token-storage），store 在初始化时读取，
// 并在登录/登出时同步写入/清除，保证刷新页面后仍保持登录态（Req 1.5 受保护路由）。

import { create } from 'zustand';

import type { AuthUser, LoginPayload, RegisterPayload } from '../../api';
import {
  authApi,
  clearStoredToken,
  getStoredToken,
  setStoredToken,
} from '../../api';

export interface AuthState {
  /** JWT 访问令牌；null 表示未登录。 */
  token: string | null;
  /** 当前登录用户；登录成功后填充。 */
  user: AuthUser | null;
  /** 登录/注册请求进行中。 */
  loading: boolean;
  /** 最近一次认证错误信息（供表单展示）。 */
  error: string | null;

  /** 是否已认证（存在令牌）。 */
  isAuthenticated: () => boolean;
  /** 登录：调用 /auth/login，成功后持久化令牌并载入用户。 */
  login: (payload: LoginPayload) => Promise<void>;
  /** 注册：调用 /auth/register 后自动登录。 */
  register: (payload: RegisterPayload) => Promise<void>;
  /** 登出：清除内存与持久化令牌。 */
  logout: () => void;
  /** 直接设置令牌与用户（供测试或外部注入）。 */
  setSession: (token: string, user: AuthUser) => void;
  /** 清除错误信息。 */
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  // 初始化时从持久化存储恢复令牌，实现刷新后保持登录态。
  token: getStoredToken(),
  user: null,
  loading: false,
  error: null,

  isAuthenticated: () => get().token !== null,

  setSession: (token, user) => {
    setStoredToken(token);
    set({ token, user, error: null });
  },

  login: async (payload) => {
    set({ loading: true, error: null });
    try {
      const result = await authApi.login(payload);
      setStoredToken(result.accessToken);
      set({ token: result.accessToken, user: result.user, loading: false });
    } catch (error) {
      set({ loading: false, error: toMessage(error) });
      throw error;
    }
  },

  register: async (payload) => {
    set({ loading: true, error: null });
    try {
      await authApi.register(payload);
      // 注册成功后自动登录，直接得到 JWT 与用户视图。
      const result = await authApi.login({
        email: payload.email,
        password: payload.password,
      });
      setStoredToken(result.accessToken);
      set({ token: result.accessToken, user: result.user, loading: false });
    } catch (error) {
      set({ loading: false, error: toMessage(error) });
      throw error;
    }
  },

  logout: () => {
    clearStoredToken();
    set({ token: null, user: null, error: null });
  },

  clearError: () => set({ error: null }),
}));

/** 将任意错误规整为可展示的消息。 */
function toMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return '认证失败，请稍后重试';
}
