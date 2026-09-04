// packages/frontend/src/features/auth/RegisterPage.tsx
// 注册页：调用 /auth/register 创建账户后自动登录并跳转（Req 1.1）。

import { useEffect, useState, type FormEvent, type JSX } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAuthStore } from '../../app/store/auth-store';
import { Button, Card, Input } from '../../components/ui';

export function RegisterPage(): JSX.Element {
  const navigate = useNavigate();
  const register = useAuthStore((state) => state.register);
  const loading = useAuthStore((state) => state.loading);
  const error = useAuthStore((state) => state.error);
  const clearError = useAuthStore((state) => state.clearError);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
    confirmPassword?: string;
    terms?: string;
  }>({});

  useEffect(() => {
    clearError();
    return clearError;
  }, [clearError]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const nextErrors: typeof fieldErrors = {};
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      nextErrors.email = '请输入邮箱地址';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      nextErrors.email = '请输入有效的邮箱地址';
    }
    if (password.length < 8) {
      nextErrors.password = '密码至少需要 8 个字符';
    }
    if (confirmPassword !== password) {
      nextErrors.confirmPassword = '两次输入的密码不一致';
    }
    if (!termsAccepted) {
      nextErrors.terms = '请先阅读并同意隐私政策与服务条款';
    }
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    try {
      await register({
        email: normalizedEmail,
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
    <main className="auth-page">
      <section aria-labelledby="register-title" className="auth-card">
        <div className="auth-card__brand">
          <span className="auth-card__logo" aria-hidden="true">
            摸
          </span>
          <strong className="auth-card__brand-name">
            摸摸公司
          </strong>
        </div>
        <Card>
          <h1 id="register-title" className="auth-card__title">
            创建本机账户
          </h1>
          <p className="auth-card__intro">
            用一个账户保存文档、成长进度和本机游戏记录。
          </p>
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
              autoComplete="new-password"
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
            <Input
              label="确认密码"
              type={showPassword ? 'text' : 'password'}
              name="confirmPassword"
              value={confirmPassword}
              autoComplete="new-password"
              required
              error={fieldErrors.confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                if (fieldErrors.confirmPassword) {
                  setFieldErrors((current) => ({
                    ...current,
                    confirmPassword: undefined,
                  }));
                }
              }}
            />
            <Input
              label="昵称（可选）"
              type="text"
              name="displayName"
              value={displayName}
              autoComplete="nickname"
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <label className="auth-password-toggle">
              <input
                type="checkbox"
                checked={showPassword}
                onChange={(event) => setShowPassword(event.target.checked)}
              />
              显示密码
            </label>
            <label className="auth-terms">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(event) => {
                  setTermsAccepted(event.target.checked);
                  if (fieldErrors.terms) {
                    setFieldErrors((current) => ({
                      ...current,
                      terms: undefined,
                    }));
                  }
                }}
              />
              <span>
                我已阅读并同意<Link to="/privacy-policy">隐私政策</Link>与
                <Link to="/terms-of-service">服务条款</Link>
              </span>
            </label>
            {fieldErrors.terms ? (
              <p className="auth-field-error" role="alert">
                {fieldErrors.terms}
              </p>
            ) : null}
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
    </main>
  );
}
