// packages/frontend/src/features/auth/LoginPage.tsx
// 登录页：调用 /auth/login，成功后持久化 JWT 并跳转到受保护页面（Req 1.3, 1.5）。

import { useEffect, useState, type FormEvent, type JSX } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { useAuthStore } from '../../app/store/auth-store';
import { Button, Card, Input } from '../../components/ui';

interface LocationState {
  from?: { pathname?: string };
}

export function LoginPage(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAuthStore((state) => state.login);
  const loading = useAuthStore((state) => state.loading);
  const error = useAuthStore((state) => state.error);
  const clearError = useAuthStore((state) => state.clearError);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
  }>({});

  useEffect(() => {
    clearError();
    return clearError;
  }, [clearError]);

  // 登录后回跳到访问受保护路由时被拦截的原始位置，缺省回到首页。
  const from =
    (location.state as LocationState | null)?.from?.pathname ?? '/';

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const nextErrors: typeof fieldErrors = {};
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      nextErrors.email = '请输入邮箱地址';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      nextErrors.email = '请输入有效的邮箱地址';
    }
    if (!password) nextErrors.password = '请输入密码';
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    try {
      await login({ email: normalizedEmail, password });
      navigate(from, { replace: true });
    } catch {
      // 错误信息已存入 store.error，在下方展示，无需额外处理。
    }
  }

  return (
    <main className="auth-page">
      <section aria-labelledby="login-title" className="auth-card">
        <div className="auth-card__brand">
          <span className="auth-card__logo" aria-hidden="true">
            摸
          </span>
          <strong className="auth-card__brand-name">
            摸摸公司
          </strong>
        </div>
        <Card>
          <h1 id="login-title" className="auth-card__title">
            欢迎回来
          </h1>
          <p className="auth-card__intro">登录你的本机工作台，继续上次的进度。</p>
          <form onSubmit={handleSubmit} noValidate className="auth-form">
            <Input
              label="邮箱"
              type="email"
              name="email"
              value={email}
              autoComplete="email"
              placeholder="name@example.com"
              required
              error={fieldErrors.email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (fieldErrors.email) {
                  setFieldErrors((current) => ({ ...current, email: undefined }));
                }
              }}
            />
            <Input
              label="密码"
              type={showPassword ? 'text' : 'password'}
              name="password"
              value={password}
              autoComplete="current-password"
              required
              error={fieldErrors.password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (fieldErrors.password) {
                  setFieldErrors((current) => ({
                    ...current,
                    password: undefined,
                  }));
                }
              }}
            />
            <label className="auth-password-toggle">
              <input
                type="checkbox"
                checked={showPassword}
                onChange={(event) => setShowPassword(event.target.checked)}
              />
              显示密码
            </label>
            {error ? (
              <p role="alert" className="auth-form__error">
                {error}
              </p>
            ) : null}
            <Button type="submit" loading={loading} fullWidth>
              {loading ? '登录中…' : '登录'}
            </Button>
          </form>
          <p className="auth-footer">
            还没有账户？<Link to="/register">去注册</Link>
          </p>
        </Card>
      </section>
    </main>
  );
}
