import { useEffect, useState, type FormEvent, type JSX } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { COMMUNITY_FEATURE_FLAGS } from '../../app/community-nav';
import { useCommunityAuthStore } from '../../app/store/community-auth-store';
import { Button, Input } from '../../components/ui';
import { CommunityAuthShell } from './CommunityAuthShell';
import {
  normalizeCommunityUsername,
  validateCommunityUsername,
} from './validation';

interface LoginLocationState {
  from?: { pathname?: string };
  passwordChanged?: boolean;
}

export function CommunityLoginPage(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const login = useCommunityAuthStore((state) => state.login);
  const loading = useCommunityAuthStore((state) => state.loading);
  const error = useCommunityAuthStore((state) => state.error);
  const clearError = useCommunityAuthStore((state) => state.clearError);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string }>({});

  useEffect(() => {
    clearError();
    return clearError;
  }, [clearError]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const next = {
      username: validateCommunityUsername(username),
      password: password ? undefined : '请输入密码',
    };
    setFieldErrors(next);
    if (next.username || next.password) return;
    try {
      const phase = await login({
        username: normalizeCommunityUsername(username),
        password,
      });
      if (phase === 'active') {
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
      footer={<>还没有账号？<Link to="/register">立即注册</Link></>}
    >
      <form className="auth-form" noValidate onSubmit={submit}>
        {(location.state as LoginLocationState | null)?.passwordChanged ? (
          <p role="status">密码已更新，请使用新密码重新登录。</p>
        ) : null}
        <Input
          label="账号"
          name="username"
          autoComplete="username"
          value={username}
          required
          error={fieldErrors.username}
          spellCheck={false}
          onChange={(event) => setUsername(event.target.value)}
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
          {COMMUNITY_FEATURE_FLAGS.passwordReset ? <Link to="/password/forgot">忘记密码？</Link> : null}
        </div>
        {error ? <p className="auth-form__error" role="alert">{error}</p> : null}
        <Button type="submit" loading={loading} fullWidth>
          {loading ? '登录中…' : '登录'}
        </Button>
      </form>
    </CommunityAuthShell>
  );
}
