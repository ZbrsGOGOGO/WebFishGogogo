import { useEffect, useState, type FormEvent, type JSX } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { COMMUNITY_FEATURE_FLAGS } from '../../app/community-nav';
import { useCommunityAuthStore } from '../../app/store/community-auth-store';
import { Button, Input } from '../../components/ui';
import { CommunityAuthShell } from './CommunityAuthShell';
import { normalizeCommunityEmail, validateCommunityEmail } from './validation';

interface LoginLocationState {
  from?: { pathname?: string };
}

export function CommunityLoginPage(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const login = useCommunityAuthStore((state) => state.login);
  const loading = useCommunityAuthStore((state) => state.loading);
  const error = useCommunityAuthStore((state) => state.error);
  const clearError = useCommunityAuthStore((state) => state.clearError);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  useEffect(() => {
    clearError();
    return clearError;
  }, [clearError]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const next = {
      email: validateCommunityEmail(email),
      password: password ? undefined : '请输入密码',
    };
    setFieldErrors(next);
    if (next.email || next.password) return;
    try {
      const phase = await login({
        email: normalizeCommunityEmail(email),
        password,
      });
      if (phase === 'pending_email') {
        navigate('/register/verify', { replace: true });
      } else if (phase === 'active') {
        const from = (location.state as LoginLocationState | null)?.from?.pathname;
        const currentUser = useCommunityAuthStore.getState().user;
        navigate(currentUser?.onboardingCompleted ? (from ?? '/') : '/onboarding', {
          replace: true,
        });
      } else {
        navigate('/account/status', { replace: true });
      }
    } catch {
      // store.error 展示通用错误。
    }
  }

  return (
    <CommunityAuthShell
      title="欢迎回来"
      intro="登录后继续你的职业档案与社区进度。"
      footer={<>还没有账号？<Link to="/register">使用邀请码注册</Link></>}
    >
      <form className="auth-form" noValidate onSubmit={submit}>
        <Input
          label="邮箱"
          type="email"
          name="email"
          autoComplete="email"
          value={email}
          required
          error={fieldErrors.email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Input
          label="密码"
          type={showPassword ? 'text' : 'password'}
          name="password"
          autoComplete="current-password"
          value={password}
          required
          error={fieldErrors.password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <div className="community-auth-row">
          <label className="auth-password-toggle">
            <input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} />
            显示密码
          </label>
          {COMMUNITY_FEATURE_FLAGS.passwordReset ? <Link to="/password/forgot">忘记密码？</Link> : <span>找回密码暂未开放</span>}
        </div>
        {error ? <p className="auth-form__error" role="alert">{error}</p> : null}
        <Button type="submit" loading={loading} fullWidth>
          {loading ? '登录中…' : '登录'}
        </Button>
      </form>
    </CommunityAuthShell>
  );
}
