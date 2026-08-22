import { create } from 'zustand';

import {
  CommunityApiError,
  communityAuthApi,
  setCommunitySessionInvalidatedHandler,
  type CommunityAccountStatus,
  type CommunityAuthUser,
  type CommunityLoginPayload,
  type CommunityRegisterPayload,
  type PendingCommunityRegistration,
} from '../../api/community';

const PENDING_REGISTRATION_KEY = 'zbrs.community.pending-registration.v1';
let restorePromise: Promise<void> | null = null;

export type CommunitySessionPhase =
  | 'bootstrapping'
  | 'guest'
  | CommunityAccountStatus;

export interface CommunityAuthState {
  phase: CommunitySessionPhase;
  user: CommunityAuthUser | null;
  pendingRegistration: PendingCommunityRegistration | null;
  loading: boolean;
  sessionReady: boolean;
  error: string | null;
  bootstrapError: string | null;
  restoreSession: () => Promise<void>;
  register: (payload: CommunityRegisterPayload) => Promise<PendingCommunityRegistration>;
  verifyEmail: (code: string) => Promise<CommunityAuthUser>;
  resendVerification: () => Promise<void>;
  login: (payload: CommunityLoginPayload) => Promise<CommunitySessionPhase>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  updateUser: (user: CommunityAuthUser) => void;
  clearError: () => void;
  reset: () => void;
}

function loadPendingRegistration(): PendingCommunityRegistration | null {
  try {
    const raw = globalThis.sessionStorage?.getItem(PENDING_REGISTRATION_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PendingCommunityRegistration>;
    return typeof value.registrationId === 'string' &&
      typeof value.emailMasked === 'string' &&
      value.accountStatus === 'pending_email'
      ? (value as PendingCommunityRegistration)
      : null;
  } catch {
    return null;
  }
}

function savePendingRegistration(value: PendingCommunityRegistration | null): void {
  try {
    if (value) {
      globalThis.sessionStorage?.setItem(PENDING_REGISTRATION_KEY, JSON.stringify(value));
    } else {
      globalThis.sessionStorage?.removeItem(PENDING_REGISTRATION_KEY);
    }
  } catch {
    // 注册上下文仍保存在内存；浏览器禁用 sessionStorage 不阻断当前流程。
  }
}

function messageFrom(error: unknown): string {
  if (error instanceof CommunityApiError) {
    const code =
      error.body && typeof error.body === 'object' && 'code' in error.body
        ? (error.body as { code?: unknown }).code
        : undefined;
    if (code === 'INVALID_CREDENTIALS') return '邮箱或密码不正确';
    if (code === 'EMAIL_NOT_VERIFIED') return '邮箱尚未验证，请继续完成验证码流程';
    if (code === 'ACCOUNT_UNAVAILABLE') return '账号当前不可用，请查看账号状态或申诉说明';
    if (code === 'INVALID_BETA_ACCESS_CODE') return 'Beta 准入码无效或已失效';
    if (code === 'VERIFICATION_CODE_INVALID') return '验证码不正确，请检查后重试';
    if (code === 'VERIFICATION_CODE_EXPIRED') return '验证码已过期，请重新发送';
    if (code === 'VERIFICATION_ATTEMPTS_EXCEEDED') return '验证码尝试次数已达上限，请稍后重试';
    if (error.status === 409) return '该注册信息暂时无法使用，请检查后重试';
    if (error.status === 429) return '操作过于频繁，请稍后再试';
  }
  return error instanceof Error && error.message
    ? error.message
    : '请求失败，请稍后重试';
}

function phaseOf(user: CommunityAuthUser): CommunityAccountStatus {
  return user.accountStatus;
}

const initialPendingRegistration = loadPendingRegistration();

export const useCommunityAuthStore = create<CommunityAuthState>((set, get) => ({
  phase: 'bootstrapping',
  user: null,
  pendingRegistration: initialPendingRegistration,
  loading: false,
  sessionReady: false,
  error: null,
  bootstrapError: null,

  restoreSession: () => {
    if (restorePromise) return restorePromise;
    if (get().sessionReady) return Promise.resolve();
    set({ phase: 'bootstrapping', loading: true, bootstrapError: null });
    restorePromise = communityAuthApi
      .refresh()
      .then((session) => {
        savePendingRegistration(null);
        set({
          phase: phaseOf(session.user),
          user: session.user,
          pendingRegistration: null,
          loading: false,
          sessionReady: true,
          error: null,
          bootstrapError: null,
        });
      })
      .catch((error) => {
        const expectedGuest =
          error instanceof CommunityApiError &&
          (error.status === 401 || error.status === 403);
        set({
          phase: get().pendingRegistration ? 'pending_email' : 'guest',
          user: null,
          loading: false,
          sessionReady: true,
          error: null,
          bootstrapError: expectedGuest ? null : messageFrom(error),
        });
      })
      .finally(() => {
        restorePromise = null;
      });
    return restorePromise;
  },

  register: async (payload) => {
    set({ loading: true, error: null });
    try {
      const registration = await communityAuthApi.register(payload);
      savePendingRegistration(registration);
      set({
        phase: 'pending_email',
        pendingRegistration: registration,
        loading: false,
        sessionReady: true,
      });
      return registration;
    } catch (error) {
      set({ loading: false, error: messageFrom(error) });
      throw error;
    }
  },

  verifyEmail: async (code) => {
    const registration = get().pendingRegistration;
    if (!registration) throw new Error('注册验证信息已失效，请重新注册');
    set({ loading: true, error: null });
    try {
      const session = await communityAuthApi.verifyEmail({
        registrationId: registration.registrationId,
        code,
      });
      savePendingRegistration(null);
      set({
        phase: phaseOf(session.user),
        user: session.user,
        pendingRegistration: null,
        loading: false,
        sessionReady: true,
      });
      return session.user;
    } catch (error) {
      set({ loading: false, error: messageFrom(error) });
      throw error;
    }
  },

  resendVerification: async () => {
    const registration = get().pendingRegistration;
    if (!registration) throw new Error('注册验证信息已失效，请重新注册');
    set({ loading: true, error: null });
    try {
      const timing = await communityAuthApi.resendVerification(
        registration.registrationId,
      );
      const next = { ...registration, ...timing };
      savePendingRegistration(next);
      set({ pendingRegistration: next, loading: false });
    } catch (error) {
      set({ loading: false, error: messageFrom(error) });
      throw error;
    }
  },

  login: async (payload) => {
    set({ loading: true, error: null });
    try {
      const session = await communityAuthApi.login(payload);
      const phase = phaseOf(session.user);
      savePendingRegistration(null);
      set({
        phase,
        user: session.user,
        pendingRegistration: null,
        loading: false,
        sessionReady: true,
      });
      return phase;
    } catch (error) {
      set({ loading: false, error: messageFrom(error) });
      throw error;
    }
  },

  logout: async () => {
    try {
      await communityAuthApi.logout();
    } catch {
      // 即使网络不可用也立即清理浏览器内存会话；服务端短期令牌会自行过期。
    } finally {
      savePendingRegistration(null);
      set({
        phase: 'guest',
        user: null,
        pendingRegistration: null,
        loading: false,
        sessionReady: true,
      });
    }
  },

  logoutAll: async () => {
    try {
      await communityAuthApi.logoutAll();
    } catch {
      // 与单设备退出一致，前端不得因网络错误继续保留可用访问令牌。
    } finally {
      savePendingRegistration(null);
      set({
        phase: 'guest',
        user: null,
        pendingRegistration: null,
        loading: false,
        sessionReady: true,
      });
    }
  },

  updateUser: (user) => set({ user, phase: phaseOf(user) }),
  clearError: () => set({ error: null }),
  reset: () => {
    savePendingRegistration(null);
    set({
      phase: 'guest',
      user: null,
      pendingRegistration: null,
      loading: false,
      sessionReady: true,
      error: null,
      bootstrapError: null,
    });
  },
}));

setCommunitySessionInvalidatedHandler(() => {
  useCommunityAuthStore.setState({
    phase: 'guest',
    user: null,
    loading: false,
    sessionReady: true,
  });
});

export function resetCommunityAuthStoreForTests(): void {
  restorePromise = null;
  savePendingRegistration(null);
  useCommunityAuthStore.setState({
    phase: 'guest',
    user: null,
    pendingRegistration: null,
    loading: false,
    sessionReady: true,
    error: null,
    bootstrapError: null,
  });
}
