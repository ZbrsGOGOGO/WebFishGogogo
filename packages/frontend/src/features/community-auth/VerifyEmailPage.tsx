import { useEffect, useMemo, useState, type FormEvent, type JSX } from 'react';
import { useNavigate } from 'react-router-dom';

import { useCommunityAuthStore } from '../../app/store/community-auth-store';
import { Button, Input } from '../../components/ui';
import { CommunityAuthShell } from './CommunityAuthShell';
import { validateVerificationCode } from './validation';

export function CommunityVerifyEmailPage(): JSX.Element {
  const navigate = useNavigate();
  const registration = useCommunityAuthStore((state) => state.pendingRegistration);
  const verifyEmail = useCommunityAuthStore((state) => state.verifyEmail);
  const resendVerification = useCommunityAuthStore((state) => state.resendVerification);
  const loading = useCommunityAuthStore((state) => state.loading);
  const error = useCommunityAuthStore((state) => state.error);
  const reset = useCommunityAuthStore((state) => state.reset);
  const [code, setCode] = useState(registration?.devVerificationCode ?? '');
  const [codeError, setCodeError] = useState<string>();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const resendSeconds = useMemo(() => {
    const readyAt = Date.parse(registration?.resendAvailableAt ?? '');
    return Number.isFinite(readyAt) ? Math.max(0, Math.ceil((readyAt - now) / 1_000)) : 0;
  }, [now, registration?.resendAvailableAt]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const nextError = validateVerificationCode(code);
    setCodeError(nextError);
    if (nextError) return;
    try {
      const user = await verifyEmail(code.trim());
      navigate(user.onboardingCompleted ? '/' : '/onboarding', { replace: true });
    } catch {
      // store.error 负责展示。
    }
  }

  async function resend(): Promise<void> {
    try {
      await resendVerification();
    } catch {
      // store.error 已提供可读错误，避免按钮事件产生未处理 Promise。
    }
  }

  function leaveRegistration(target: '/register' | '/login'): void {
    reset();
    navigate(target, { replace: true });
  }

  return (
    <CommunityAuthShell
      title="验证邮箱"
      intro={registration ? <>验证码已发送至 <strong>{registration.emailMasked}</strong>，10 分钟内有效。</> : '注册验证信息已失效。'}
      footer="验证码只会发送到上方显示的邮箱。"
    >
      {registration ? (
        <form className="auth-form" noValidate onSubmit={submit}>
          <Input
            label="6 位验证码"
            name="verificationCode"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            maxLength={6}
            required
            error={codeError}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
          />
          {registration.devVerificationCode ? (
            <p className="community-dev-code" role="status">
              本地开发验证码：<strong>{registration.devVerificationCode}</strong>
            </p>
          ) : null}
          {error ? <p className="auth-form__error" role="alert">{error}</p> : null}
          <Button type="submit" loading={loading} fullWidth>
            {loading ? '验证中…' : '验证并继续'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={loading || resendSeconds > 0}
            onClick={() => void resend()}
          >
            {resendSeconds > 0 ? `${resendSeconds} 秒后可重新发送` : '重新发送验证码'}
          </Button>
          <div className="community-auth-row">
            <Button type="button" variant="ghost" size="sm" onClick={() => leaveRegistration('/register')}>重新填写资料</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => leaveRegistration('/login')}>改用其他账号登录</Button>
          </div>
        </form>
      ) : (
        <div className="auth-form">
          <p className="auth-form__error" role="alert">请重新提交 Beta 准入码和注册资料。</p>
          <Button onClick={() => leaveRegistration('/register')}>重新注册</Button>
        </div>
      )}
    </CommunityAuthShell>
  );
}
