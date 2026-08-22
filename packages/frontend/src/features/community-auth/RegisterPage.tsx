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
  normalizeCommunityEmail,
  validateCommunityDisplayName,
  validateCommunityEmail,
  validateCommunityPassword,
} from './validation';

interface RegisterErrors {
  betaAccessCode?: string;
  email?: string;
  displayName?: string;
  password?: string;
  confirmPassword?: string;
  consents?: string;
  adult?: string;
}

export function CommunityRegisterPage(): JSX.Element {
  const navigate = useNavigate();
  const register = useCommunityAuthStore((state) => state.register);
  const loading = useCommunityAuthStore((state) => state.loading);
  const error = useCommunityAuthStore((state) => state.error);
  const clearError = useCommunityAuthStore((state) => state.clearError);
  const [betaAccessCode, setBetaAccessCode] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [guidelinesAccepted, setGuidelinesAccepted] = useState(false);
  const [adultDeclared, setAdultDeclared] = useState(false);
  const [errors, setErrors] = useState<RegisterErrors>({});
  const [referralBinding] = useState(loadCommunityReferralBinding);

  useEffect(() => {
    clearError();
    return clearError;
  }, [clearError]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const next: RegisterErrors = {
      betaAccessCode: betaAccessCode.trim() ? undefined : '请输入 Beta 准入码',
      email: validateCommunityEmail(email),
      displayName: validateCommunityDisplayName(displayName),
      password: validateCommunityPassword(password),
      confirmPassword: confirmPassword === password ? undefined : '两次输入的密码不一致',
      consents:
        termsAccepted && privacyAccepted && guidelinesAccepted
          ? undefined
          : '请分别阅读并同意三份规则',
      adult: adultDeclared ? undefined : '首版账号仅向已满 18 周岁的用户开放',
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    try {
      await register({
        betaAccessCode: betaAccessCode.trim(),
        ...(referralBinding ? { referralToken: referralBinding.token } : {}),
        email: normalizeCommunityEmail(email),
        displayName: displayName.trim(),
        password,
        consents: {
          termsVersion: COMMUNITY_LEGAL_VERSIONS.terms,
          privacyVersion: COMMUNITY_LEGAL_VERSIONS.privacy,
          communityGuidelinesVersion: COMMUNITY_LEGAL_VERSIONS.communityGuidelines,
          adultDeclarationVersion: COMMUNITY_LEGAL_VERSIONS.adultDeclaration,
        },
      });
      clearCommunityReferralBinding();
      navigate('/register/verify', { replace: true });
    } catch {
      // store.error 负责展示经过规整的错误。
    }
  }

  return (
    <CommunityAuthShell
      title="使用邀请码创建账号"
      intro="先验证 Beta 准入资格和邮箱，再进入职业设置。"
      footer={<>已有账号？<Link to="/login">去登录</Link></>}
    >
      <form className="auth-form" noValidate onSubmit={submit}>
        {referralBinding ? (
          <p role="status">
            已接受 {referralBinding.inviterDisplayName} 的推荐；你仍需填写独立的 Beta 准入码。
          </p>
        ) : null}
        <Input
          label="Beta 准入码"
          name="betaAccessCode"
          autoComplete="off"
          value={betaAccessCode}
          required
          error={errors.betaAccessCode}
          onChange={(event) => setBetaAccessCode(event.target.value)}
        />
        <Input
          label="邮箱"
          type="email"
          name="email"
          autoComplete="email"
          value={email}
          required
          error={errors.email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Input
          label="昵称"
          name="displayName"
          autoComplete="nickname"
          value={displayName}
          required
          error={errors.displayName}
          maxLength={40}
          onChange={(event) => setDisplayName(event.target.value)}
        />
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

        <fieldset className="community-consents">
          <legend>请分别确认以下规则</legend>
          <label className="auth-terms">
            <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} />
            <span>我同意<Link to="/terms-of-service">服务条款</Link>（{COMMUNITY_LEGAL_VERSIONS.terms}）</span>
          </label>
          <label className="auth-terms">
            <input type="checkbox" checked={privacyAccepted} onChange={(event) => setPrivacyAccepted(event.target.checked)} />
            <span>我同意<Link to="/privacy-policy">隐私政策</Link>（{COMMUNITY_LEGAL_VERSIONS.privacy}）</span>
          </label>
          <label className="auth-terms">
            <input type="checkbox" checked={guidelinesAccepted} onChange={(event) => setGuidelinesAccepted(event.target.checked)} />
            <span>我同意<Link to="/community-guidelines">社区规范</Link>（{COMMUNITY_LEGAL_VERSIONS.communityGuidelines}）</span>
          </label>
          {errors.consents ? <p className="auth-field-error" role="alert">{errors.consents}</p> : null}
        </fieldset>
        <label className="auth-terms">
          <input type="checkbox" checked={adultDeclared} onChange={(event) => setAdultDeclared(event.target.checked)} />
          <span>我声明本人已满 18 周岁</span>
        </label>
        {errors.adult ? <p className="auth-field-error" role="alert">{errors.adult}</p> : null}
        {error ? <p className="auth-form__error" role="alert">{error}</p> : null}
        <Button type="submit" loading={loading} fullWidth>
          {loading ? '正在提交…' : '提交并验证邮箱'}
        </Button>
      </form>
    </CommunityAuthShell>
  );
}
