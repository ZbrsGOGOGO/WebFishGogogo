import { useEffect, useState, type FormEvent, type JSX } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { COMMUNITY_LEGAL_VERSIONS } from '../../app/community-legal';
import { useCommunityAuthStore } from '../../app/store/community-auth-store';
import { Button, Input } from '../../components/ui';
import { CommunityAuthShell } from './CommunityAuthShell';
import {
  clearCommunityReferralBinding,
  loadCommunityReferralBinding,
} from './referral-binding';
import {
  normalizeCommunityUsername,
  validateCommunityPassword,
  validateCommunityUsername,
} from './validation';

interface RegisterErrors {
  username?: string;
  password?: string;
  confirmPassword?: string;
  consents?: string;
}

export function CommunityRegisterPage(): JSX.Element {
  const navigate = useNavigate();
  const register = useCommunityAuthStore((state) => state.register);
  const loading = useCommunityAuthStore((state) => state.loading);
  const error = useCommunityAuthStore((state) => state.error);
  const clearError = useCommunityAuthStore((state) => state.clearError);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [consentsAccepted, setConsentsAccepted] = useState(false);
  const [errors, setErrors] = useState<RegisterErrors>({});
  const [referralBinding] = useState(loadCommunityReferralBinding);

  useEffect(() => {
    clearError();
    return clearError;
  }, [clearError]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const next: RegisterErrors = {
      username: validateCommunityUsername(username),
      password: validateCommunityPassword(password),
      confirmPassword: confirmPassword === password ? undefined : '两次输入的密码不一致',
      consents: consentsAccepted ? undefined : '请先确认年龄并同意站点规则',
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    try {
      await register({
        ...(referralBinding ? { referralToken: referralBinding.token } : {}),
        username: normalizeCommunityUsername(username),
        password,
        consents: {
          termsVersion: COMMUNITY_LEGAL_VERSIONS.terms,
          privacyVersion: COMMUNITY_LEGAL_VERSIONS.privacy,
          communityGuidelinesVersion: COMMUNITY_LEGAL_VERSIONS.communityGuidelines,
          adultDeclarationVersion: COMMUNITY_LEGAL_VERSIONS.adultDeclaration,
        },
      });
      clearCommunityReferralBinding();
      navigate('/onboarding', { replace: true });
    } catch {
      // store.error 负责展示经过规整的错误。
    }
  }

  return (
    <CommunityAuthShell
      title="创建账号"
      intro="设置账号和密码，注册后即可保存职业档案与游戏进度。"
      footer={<>已有账号？<Link to="/login">去登录</Link></>}
    >
      <form className="auth-form" noValidate onSubmit={submit}>
        {referralBinding ? (
          <p role="status">
            已接受 {referralBinding.inviterDisplayName} 的邀请，注册后会自动绑定。
          </p>
        ) : null}
        <Input
          label="账号"
          name="username"
          autoComplete="username"
          value={username}
          required
          error={errors.username}
          maxLength={20}
          spellCheck={false}
          onChange={(event) => setUsername(event.target.value)}
        />
        <small className="auth-field-hint">4～20 位，以字母开头，可使用字母、数字和下划线</small>
        <Input
          label="密码"
          type={showPassword ? 'text' : 'password'}
          name="password"
          autoComplete="new-password"
          value={password}
          required
          error={errors.password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <Input
          label="确认密码"
          type={showPassword ? 'text' : 'password'}
          name="confirmPassword"
          autoComplete="new-password"
          value={confirmPassword}
          required
          error={errors.confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
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
          <input type="checkbox" checked={consentsAccepted} onChange={(event) => setConsentsAccepted(event.target.checked)} />
          <span>
            我已满 18 周岁，并同意<Link to="/terms-of-service">服务条款</Link>、
            <Link to="/privacy-policy">隐私政策</Link>与
            <Link to="/community-guidelines">社区规范</Link>
          </span>
        </label>
        {errors.consents ? <p className="auth-field-error" role="alert">{errors.consents}</p> : null}
        {error ? <p className="auth-form__error" role="alert">{error}</p> : null}
        <Button type="submit" loading={loading} fullWidth>
          {loading ? '正在创建…' : '注册并进入'}
        </Button>
      </form>
    </CommunityAuthShell>
  );
}
