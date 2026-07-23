// packages/frontend/src/features/auth/LoginPage.tsx
// 登录页：调用 /auth/login，成功后持久化 JWT 并跳转到受保护页面（Req 1.3, 1.5）。

import { useState, type FormEvent, type JSX } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { useAuthStore } from '../../app/store/auth-store';

interface LocationState {
  from?: { pathname?: string };
}

export function LoginPage(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAuthStore((state) => state.login);
  const loading = useAuthStore((state) => state.loading);
  const error = useAuthStore((state) => state.error);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // 登录后回跳到访问受保护路由时被拦截的原始位置，缺省回到首页。
  const from =
    (location.state as LocationState | null)?.from?.pathname ?? '/';

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    try {
      await login({ email, password });
      navigate(from, { replace: true });
    } catch {
      // 错误信息已存入 store.error，在下方展示，无需额外处理。
    }
  }

  return (
    <section aria-labelledby="login-title">
      <h1 id="login-title">登录</h1>
      <form onSubmit={handleSubmit} noValidate>
        <label>
          邮箱
          <input
            type="email"
            name="email"
            value={email}
            autoComplete="email"
            required
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          密码
          <input
            type="password"
            name="password"
            value={password}
            autoComplete="current-password"
            required
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error ? (
          <p role="alert" style={{ color: 'crimson' }}>
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={loading}>
          {loading ? '登录中…' : '登录'}
        </button>
      </form>
      <p>
        还没有账户？<Link to="/register">去注册</Link>
      </p>
    </section>
  );
}
