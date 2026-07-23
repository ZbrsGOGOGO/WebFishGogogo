// packages/frontend/src/api/config.ts
// API 客户端运行时配置：后端 base URL（可经 Vite env 配置）与 JWT 存取键名。

/**
 * 后端 API 基址。
 *
 * 后端在 main.ts 中设置了全局前缀 `api` 且默认监听 3000 端口，
 * 故默认基址为 `http://localhost:3000/api`。可通过 Vite 环境变量
 * `VITE_API_BASE_URL` 覆盖（如生产环境指向反向代理路径 `/api`）。
 */
export const API_BASE_URL: string =
  (import.meta.env?.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ??
  'http://localhost:3000/api';

/** localStorage 中持久化 JWT 访问令牌的键名。 */
export const AUTH_TOKEN_STORAGE_KEY = 'stealth-reader.token';
