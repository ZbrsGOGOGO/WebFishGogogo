import { useEffect, useState, type FormEvent, type JSX } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { CommunityApiError, communityAuthApi } from '../../api/community';
import { Button, Input } from '../../components/ui';
import { CommunityAuthShell } from './CommunityAuthShell';
import {
  normalizeCommunityEmail,
  validateCommunityEmail,
  validateCommunityPassword,
} from './validation';

export function CommunityPasswordResetUnavailablePage(): JSX.Element {
  return (
    <CommunityAuthShell
      title="找回密码暂不可用"
      intro="当前社区版本尚未开放密码找回与重置，页面不会收集邮箱或伪装发送成功。"
      footer={<Link to="/login">返回登录</Link>}
    >
      <p role="status">如需账号协助，请前往隐私政策查看当前联系渠道。</p>
      <Link to="/privacy-policy">查看隐私政策与联系渠道</Link>
    </CommunityAuthShell>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof CommunityApiError && error.status === 429) {
    return '操作过于频繁，请稍后再试';
  }
  return '暂时无法提交请求，请稍后重试';
}

function resetErrorMessage(error: unknown): string {
  if (error instanceof CommunityApiError && error.status === 429) {
    return '操作过于频繁，请稍后再试';
  }
  if (
    error instanceof CommunityApiError &&
    [400, 404, 409, 410, 422].includes(error.status)
  ) {
    return '重置链接无效或已失效，请重新申请';
  }
  return '暂时无法更新密码，请稍后重试';
}

export function CommunityForgotPasswordPage(): JSX.Element {
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const nextError = validateCommunityEmail(email);
    setFieldError(nextError);
    if (nextError) return;
    setLoading(true);
    setError(undefined);
    try {
      await communityAuthApi.forgotPassword(normalizeCommunityEmail(email));
      setSubmitted(true);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <CommunityAuthShell
      title="找回密码"
      intro="无论邮箱是否存在，页面都会返回相同提示。"
      footer={<Link to="/login">返回登录</Link>}
    >
      {submitted ? (
        <p role="status">如果该邮箱对应可用账号，重置说明将会发送；请检查收件箱和垃圾邮件。</p>
      ) : (
        <form className="auth-form" noValidate onSubmit={submit}>
          <Input label="邮箱" type="email" autoComplete="email" value={email} required error={fieldError} onChange={(event) => setEmail(event.target.value)} />
          {error ? <p className="auth-form__error" role="alert">{error}</p> : null}
          <Button type="submit" loading={loading} fullWidth>发送重置说明</Button>
        </form>
      )}
    </CommunityAuthShell>
  );
}

export function CommunityResetPasswordPage(): JSX.Element {
  const [searchParams] = useSearchParams();
  const [token] = useState(() => searchParams.get('token') ?? '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldError, setFieldError] = useState<string>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (!token || typeof window === 'undefined') return;
    // 令牌只需读取一次，随后从地址栏移除，避免被截图、复制或后续同源请求引用。
    window.history.replaceState(
      window.history.state,
      document.title,
      `${window.location.pathname}${window.location.hash}`,
    );
  }, [token]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const nextError = !token
      ? '重置链接无效或已过期'
      : validateCommunityPassword(password) ??
        (password === confirmPassword ? undefined : '两次输入的密码不一致');
    setFieldError(nextError);
    if (nextError) return;
    setLoading(true);
    setError(undefined);
    try {
      await communityAuthApi.resetPassword({ token, newPassword: password });
      setPassword('');
      setConfirmPassword('');
      setCompleted(true);
    } catch (requestError) {
      setError(resetErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <CommunityAuthShell
      title="设置新密码"
      intro="成功后会撤销其他设备上的既有会话。"
      footer={<Link to="/login">返回登录</Link>}
    >
      {completed ? (
        <div role="status">
          <p>密码已经更新，请使用新密码登录。</p>
          <Link to="/login">前往登录</Link>
        </div>
      ) : (
        <form className="auth-form" noValidate onSubmit={submit}>
          <Input label="新密码" type="password" autoComplete="new-password" value={password} required error={fieldError} onChange={(event) => setPassword(event.target.value)} />
          <Input label="确认新密码" type="password" autoComplete="new-password" value={confirmPassword} required onChange={(event) => setConfirmPassword(event.target.value)} />
          {error ? <p className="auth-form__error" role="alert">{error}</p> : null}
          <Button type="submit" loading={loading} fullWidth>更新密码</Button>
        </form>
      )}
    </CommunityAuthShell>
  );
}
