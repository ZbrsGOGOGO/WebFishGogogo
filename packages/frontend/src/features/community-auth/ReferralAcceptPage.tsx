import { useEffect, useState, type JSX } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import {
  communityInvitesApi,
  type CommunityReferralPreview,
} from '../../api/community';
import { Button } from '../../components/ui';
import { communityRequestErrorMessage } from '../community/request-error';
import { CommunityAuthShell } from './CommunityAuthShell';
import { saveCommunityReferralBinding } from './referral-binding';

export function CommunityReferralAcceptPage(): JSX.Element {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const code = searchParams.get('code')?.trim() ?? '';
  const [preview, setPreview] = useState<CommunityReferralPreview | null>(null);
  const [loading, setLoading] = useState(Boolean(code));
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!code) {
      setError('邀请链接缺少推荐码，请向邀请人重新获取完整链接。');
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(undefined);
    communityInvitesApi.preview(code)
      .then((result) => {
        if (!active) return;
        saveCommunityReferralBinding(result);
        setPreview(result);
      })
      .catch((requestError) => {
        if (active) {
          setError(communityRequestErrorMessage(requestError, '邀请链接无效或已失效'));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [code]);

  return (
    <CommunityAuthShell
      title="接受同事邀请"
      intro="推荐关系和 Beta 准入资格相互独立；接受邀请后仍需填写有效的 Beta 准入码。"
      footer={<Link to="/login">已有账号？去登录</Link>}
    >
      {loading ? <p role="status">正在核验邀请链接…</p> : null}
      {error ? <p className="auth-form__error" role="alert">{error}</p> : null}
      {preview ? (
        <div className="auth-form">
          <p><strong>{preview.inviter.displayName}</strong> 邀请你加入办公室社区。</p>
          <p>推荐绑定将在 {new Date(preview.expiresAt).toLocaleTimeString('zh-CN')} 前有效。</p>
          <Button fullWidth onClick={() => navigate('/register')}>继续创建账号</Button>
        </div>
      ) : null}
    </CommunityAuthShell>
  );
}
