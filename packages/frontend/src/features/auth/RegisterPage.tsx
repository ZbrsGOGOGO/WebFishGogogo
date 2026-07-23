// packages/frontend/src/features/auth/RegisterPage.tsx
// 注册页：调用 /auth/register 创建账户后自动登录并跳转（Req 1.1）。

import { useState, type FormEvent, type JSX } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAuthStore } from '../../app/store/auth-store';
import { Button, Card, Input } from '../../components/ui';

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
    <div className="auth-page">
      <section aria-labelledby="register-title" className="auth-card">
        <div className="auth-card__brand">
          <span className="auth-card__logo" aria-hidden="true">
            C
          </span>
        </div>
        <Card>
          <h1 id="register-title" className="auth-card__title">
            注册
          </h1>
          <form onSubmit={handleSubmit} noValidate className="auth-form">
            <Input
              label="邮箱"
              type="email"
              name="email"
              value={email}
              autoComplete="email"
              required
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              label="密码"
              type="password"
              name="password"
              value={password}
              autoComplete="new-password"
              required
              onChange={(e) => setPassword(e.target.value)}
            />
            <Input
              label="昵称（可选）"
              type="text"
              name="displayName"
              value={displayName}
              autoComplete="nickname"
              onChange={(e) => setDisplayName(e.target.value)}
            />
            {error ? (
              <p role="alert" className="auth-form__error">
                {error}
              </p>
            ) : null}
            <Button type="submit" loading={loading} fullWidth>
              {loading ? '注册中…' : '注册'}
            </Button>
          </form>
          <p className="auth-footer">
            已有账户？<Link to="/login">去登录</Link>
          </p>
        </Card>
      </section>
    </div>
  );
}
