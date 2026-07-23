// packages/frontend/src/features/auth/RegisterPage.tsx
// 注册页：调用 /auth/register 创建账户后自动登录并跳转（Req 1.1）。

import { useState, type FormEvent, type JSX } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAuthStore } from '../../app/store/auth-store';

export function RegisterPage(): JSX.Element {
  const navigate = useNavigate();
  const register = useAuthStore((state) => state.register);
  const loading = useAuthStore((state) => state.loading);
  const error = useAuthStore((state) => state.error);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    try {
      await register({
        email,
        password,
        displayName: displayName.trim() === '' ? null : displayName,
      });
      // 注册后 store 已自动登录，跳转到首页。
      navigate('/', { replace: true });
    } catch {
      // 错误信息已存入 store.error，在下方展示。
    }
  }

  return (
    <section aria-labelledby="register-title">
      <h1 id="register-title">注册</h1>
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
            autoComplete="new-password"
            required
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label>
          昵称（可选）
          <input
            type="text"
            name="displayName"
            value={displayName}
            autoComplete="nickname"
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </label>
        {error ? (
          <p role="alert" style={{ color: 'crimson' }}>
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={loading}>
          {loading ? '注册中…' : '注册'}
        </button>
      </form>
      <p>
        已有账户？<Link to="/login">去登录</Link>
      </p>
    </section>
  );
}
