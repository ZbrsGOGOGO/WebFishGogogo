import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from 'react';
import { Outlet } from 'react-router-dom';
import type { DevelopmentAccess } from '@stealth-reader/shared';

import { communityDevelopmentApi } from '../../api/community-development';
import { getCommunitySessionGeneration } from '../../api/community-http';
import { useCommunityAuthStore } from '../../app/store/community-auth-store';
import { Button, Card, EmptyState, PageHeader } from '../../components/ui';
import styles from './Development.module.css';

export type DevelopmentAccessState =
  | { status: 'loading'; access: null; subjectPublicId: string | null; reload: () => void }
  | { status: 'denied'; access: DevelopmentAccess | null; subjectPublicId: string | null; reload: () => void }
  | { status: 'error'; access: null; subjectPublicId: string; reload: () => void }
  | { status: 'allowed'; access: DevelopmentAccess & { role: 'owner' | 'contributor' }; subjectPublicId: string; reload: () => void };

interface AccessSnapshot {
  subjectPublicId: string | null;
  sessionGeneration: number;
  status: 'loading' | 'denied' | 'error' | 'allowed';
  access: DevelopmentAccess | null;
}

const DevelopmentAccessContext = createContext<DevelopmentAccessState | null>(null);

export function useDevelopmentAccessState(): DevelopmentAccessState {
  // Explicit same-account logins can leave publicId/phase unchanged. Subscribe
  // to the auth transition so an old permission response cannot cross it.
  const auth = useCommunityAuthStore();
  const phase = auth.phase;
  const userPublicId = auth.user?.publicId ?? null;
  const sessionGeneration = getCommunitySessionGeneration();
  const subjectPublicId = phase === 'active' ? userPublicId : null;
  const [reloadRevision, setReloadRevision] = useState(0);
  const requestGeneration = useRef(0);
  const [snapshot, setSnapshot] = useState<AccessSnapshot>({
    subjectPublicId: null,
    sessionGeneration,
    status: 'denied',
    access: null,
  });
  const reload = useCallback(() => setReloadRevision((current) => current + 1), []);

  useEffect(() => {
    const generation = ++requestGeneration.current;
    if (!subjectPublicId) {
      setSnapshot({ subjectPublicId: null, sessionGeneration, status: 'denied', access: null });
      return;
    }

    setSnapshot({ subjectPublicId, sessionGeneration, status: 'loading', access: null });
    void communityDevelopmentApi.getAccess().then((access) => {
      if (generation !== requestGeneration.current || getCommunitySessionGeneration() !== sessionGeneration) return;
      const current = useCommunityAuthStore.getState();
      if (current.phase !== 'active' || current.user?.publicId !== subjectPublicId) return;
      setSnapshot({
        subjectPublicId,
        sessionGeneration,
        status: access.enabled && access.role ? 'allowed' : 'denied',
        access,
      });
    }).catch(() => {
      if (generation !== requestGeneration.current || getCommunitySessionGeneration() !== sessionGeneration) return;
      const current = useCommunityAuthStore.getState();
      if (current.phase !== 'active' || current.user?.publicId !== subjectPublicId) return;
      setSnapshot({ subjectPublicId, sessionGeneration, status: 'error', access: null });
    });

    return () => {
      requestGeneration.current += 1;
    };
  }, [reloadRevision, subjectPublicId, sessionGeneration]);

  return useMemo(() => {
    // Effects run after paint. Deriving from the current identity prevents a
    // one-frame leak of the previous account's access or navigation entry.
    if (!subjectPublicId) {
      return { status: 'denied', access: null, subjectPublicId: null, reload };
    }
    if (snapshot.subjectPublicId !== subjectPublicId || snapshot.sessionGeneration !== sessionGeneration) {
      return { status: 'loading', access: null, subjectPublicId, reload };
    }
    if (
      snapshot.status === 'allowed' &&
      snapshot.access?.enabled &&
      snapshot.access.role
    ) {
      return {
        status: 'allowed',
        access: snapshot.access as DevelopmentAccess & { role: 'owner' | 'contributor' },
        subjectPublicId,
        reload,
      };
    }
    if (snapshot.status === 'error') {
      return { status: 'error', access: null, subjectPublicId, reload };
    }
    if (snapshot.status === 'loading') {
      return { status: 'loading', access: null, subjectPublicId, reload };
    }
    return { status: 'denied', access: snapshot.access, subjectPublicId, reload };
  }, [reload, snapshot, subjectPublicId, sessionGeneration]);
}

export function DevelopmentAccessProvider({
  value,
  children,
}: {
  value: DevelopmentAccessState;
  children: ReactNode;
}): JSX.Element {
  return (
    <DevelopmentAccessContext.Provider value={value}>
      {children}
    </DevelopmentAccessContext.Provider>
  );
}

export function useDevelopmentAccess(): DevelopmentAccessState {
  const value = useContext(DevelopmentAccessContext);
  if (!value) throw new Error('DevelopmentAccessProvider is missing');
  return value;
}

export function DevelopmentAccessGate(): JSX.Element {
  const state = useDevelopmentAccess();

  if (state.status === 'loading') {
    return <main className={styles.page}><p role="status">正在核对开发协作权限…</p></main>;
  }

  if (state.status === 'denied') {
    return (
      <main className={styles.page}>
        <PageHeader title="开发协作" subtitle="这个工作区只向已授权成员开放。" />
        <Card>
          <EmptyState
            icon="🔐"
            title="当前账号没有访问权限"
            message="请由开发区负责人按你的现有用户名授权；这里不会创建共用管理员账号。"
          />
        </Card>
      </main>
    );
  }

  if (state.status === 'error') {
    return (
      <main className={styles.page}>
        <PageHeader title="开发协作" subtitle="暂时无法确认当前账号的权限。" />
        <Card>
          <EmptyState
            icon="↻"
            title="权限检查失败"
            message="网络恢复后可以重新检查，不会沿用上一个账号的权限。"
            actions={<Button onClick={state.reload}>重新检查</Button>}
          />
        </Card>
      </main>
    );
  }

  return <Outlet />;
}
