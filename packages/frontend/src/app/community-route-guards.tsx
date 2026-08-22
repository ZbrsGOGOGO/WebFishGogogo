import { useEffect, useState, type JSX, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { CommunityApiError, communityModerationApi, communityNewsApi } from '../api/community';
import { useCommunityAuthStore } from './store/community-auth-store';

function SessionLoading(): JSX.Element {
  return (
    <div className="route-loading" role="status" aria-live="polite">
      <span className="route-loading__mark" aria-hidden="true">Z</span>
      <span>正在安全恢复会话…</span>
    </div>
  );
}

function content(children?: ReactNode): JSX.Element {
  return <>{children ?? <Outlet />}</>;
}

function restricted(phase: string): boolean {
  return phase === 'suspended' || phase === 'banned' || phase === 'deleting';
}

export function CommunityGuestOnlyRoute({
  children,
}: {
  children?: ReactNode;
}): JSX.Element {
  const { phase, sessionReady, pendingRegistration } = useCommunityAuthStore();
  if (!sessionReady || phase === 'bootstrapping') return <SessionLoading />;
  if (phase === 'active') return <Navigate to="/" replace />;
  if (phase === 'pending_email' || pendingRegistration) {
    return <Navigate to="/register/verify" replace />;
  }
  if (restricted(phase)) return <Navigate to="/account/status" replace />;
  return content(children);
}

export function CommunityVerificationRoute({
  children,
}: {
  children?: ReactNode;
}): JSX.Element {
  const { phase, sessionReady, pendingRegistration, user } = useCommunityAuthStore();
  if (!sessionReady || phase === 'bootstrapping') return <SessionLoading />;
  if (phase === 'active') {
    return <Navigate to={user?.onboardingCompleted ? '/' : '/onboarding'} replace />;
  }
  if (restricted(phase)) return <Navigate to="/account/status" replace />;
  if (!pendingRegistration && phase !== 'pending_email') {
    return <Navigate to="/register" replace />;
  }
  return content(children);
}

export function RequireCommunityAccount({
  children,
  skipOnboarding = false,
}: {
  children?: ReactNode;
  skipOnboarding?: boolean;
}): JSX.Element {
  const { phase, sessionReady, pendingRegistration, user } = useCommunityAuthStore();
  const location = useLocation();
  if (!sessionReady || phase === 'bootstrapping') return <SessionLoading />;
  if (phase === 'guest') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  if (phase === 'pending_email' || pendingRegistration) {
    return <Navigate to="/register/verify" replace />;
  }
  if (restricted(phase)) return <Navigate to="/account/status" replace />;
  if (!skipOnboarding && !user?.onboardingCompleted) {
    return <Navigate to="/onboarding" replace />;
  }
  return content(children);
}

export function RequireRestrictedCommunityAccount({
  children,
}: {
  children?: ReactNode;
}): JSX.Element {
  const { phase, sessionReady, pendingRegistration } = useCommunityAuthStore();
  if (!sessionReady || phase === 'bootstrapping') return <SessionLoading />;
  if (phase === 'guest') return <Navigate to="/login" replace />;
  if (phase === 'pending_email' || pendingRegistration) {
    return <Navigate to="/register/verify" replace />;
  }
  if (phase === 'active') return <Navigate to="/account/security" replace />;
  return content(children);
}

function ModeratorDenied({ message }: { message: string }): JSX.Element {
  return (
    <main className="not-found" aria-labelledby="moderator-denied-title">
      <span className="not-found__code">403</span>
      <h1 id="moderator-denied-title">没有审核权限</h1>
      <p>{message}</p>
      <a href="/">返回社区首页</a>
    </main>
  );
}

/**
 * 审核台使用独立的角色与服务端权限双重守卫。它只改善前端导航体验，真正的
 * 安全边界仍是每个 /v1/admin/moderation API 的服务端 RBAC 与审计。
 */
export function RequireCommunityModerator({
  children,
  scope = 'content',
}: {
  children?: ReactNode;
  scope?: 'content' | 'news';
}): JSX.Element {
  const { phase, sessionReady, pendingRegistration, user } = useCommunityAuthStore();
  const location = useLocation();
  const [access, setAccess] = useState<'checking' | 'allowed' | 'denied' | 'error'>('checking');
  const [message, setMessage] = useState('该页面仅向获得授权的版主或管理员开放。');
  const hasRole = user?.roles?.some((role) => role === 'moderator' || role === 'admin') ?? false;

  useEffect(() => {
    if (!sessionReady || phase !== 'active' || !hasRole) return;
    let active = true;
    setAccess('checking');
    const accessRequest = scope === 'news'
      ? communityNewsApi.listSources()
      : communityModerationApi.getAccess();
    accessRequest
      .then(() => {
        if (active) setAccess('allowed');
      })
      .catch((error) => {
        if (!active) return;
        if (error instanceof CommunityApiError && error.status === 403) {
          setAccess('denied');
          setMessage('服务端确认当前账号没有审核权限。');
        } else {
          setAccess('error');
          setMessage('暂时无法向服务端核验审核权限，请稍后重试。');
        }
      });
    return () => {
      active = false;
    };
  }, [hasRole, phase, scope, sessionReady]);

  if (!sessionReady || phase === 'bootstrapping') return <SessionLoading />;
  if (phase === 'guest') return <Navigate to="/login" replace state={{ from: location }} />;
  if (phase === 'pending_email' || pendingRegistration) return <Navigate to="/register/verify" replace />;
  if (restricted(phase)) return <Navigate to="/account/status" replace />;
  if (!user?.onboardingCompleted) return <Navigate to="/onboarding" replace />;
  if (!hasRole) return <ModeratorDenied message={message} />;
  if (access === 'checking') return <SessionLoading />;
  if (access !== 'allowed') return <ModeratorDenied message={message} />;
  return content(children);
}
