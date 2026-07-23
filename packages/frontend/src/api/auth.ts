// packages/frontend/src/api/auth.ts
// 认证领域 API 客户端：注册 / 登录（对齐 backend AuthController）。

import { http } from './http';

/** 认证成功后返回的账户视图（对齐 backend AuthUserView）。 */
export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
}

/** 登录结果：JWT 访问令牌 + 账户视图（对齐 backend LoginResult）。 */
export interface LoginResult {
  accessToken: string;
  user: AuthUser;
}

/** 注册请求体（对齐 backend RegisterDto）。 */
export interface RegisterPayload {
  email: string;
  password: string;
  displayName?: string | null;
}

/** 登录请求体（对齐 backend LoginDto）。 */
export interface LoginPayload {
  email: string;
  password: string;
}

/**
 * POST /auth/register：创建账户。公开端点，不附带鉴权头。
 * _Requirements: 1.1_
 */
export function register(payload: RegisterPayload): Promise<AuthUser> {
  return http.post<AuthUser>('/auth/register', payload, { auth: false });
}

/**
 * POST /auth/login：登录并获取 JWT。公开端点，不附带鉴权头。
 * _Requirements: 1.3_
 */
export function login(payload: LoginPayload): Promise<LoginResult> {
  return http.post<LoginResult>('/auth/login', payload, { auth: false });
}

export const authApi = { register, login };
