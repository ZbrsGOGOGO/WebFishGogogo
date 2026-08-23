import { PATH_METADATA } from '@nestjs/common/constants';

import {
  AuthController,
  CurrentAccountController,
} from './auth.controller';
import type {
  AuthService,
  AuthSessionResult,
  AuthUserView,
  RegistrationResult,
} from './auth.service';
import type { AuthCookieResponse, CookieOptions } from './auth-cookie';

const USER: AuthUserView = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  publicId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  email: 'person@example.com',
  username: null,
  displayName: '测试同事',
  accountStatus: 'active',
  onboardingCompleted: false,
  socialVerificationStatus: 'unverified',
  avatarKey: null,
  battleProfession: null,
  bio: null,
  privacy: {
    equipment: 'friends',
    battleRecord: 'friends',
    plant: 'friends',
    honors: 'friends',
    friendCount: 'self',
    recentActivity: 'self',
  },
  roles: ['member'],
};

const SESSION: AuthSessionResult = {
  accessToken: 'access.jwt',
  refreshToken: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.secret',
  refreshExpiresAt: new Date(Date.now() + 60_000),
  user: USER,
};

const REGISTRATION: RegistrationResult = {
  registrationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  emailMasked: 'pe****@example.com',
  verificationExpiresAt: new Date(Date.now() + 600_000).toISOString(),
  resendAvailableAt: new Date(Date.now() + 60_000).toISOString(),
  accountStatus: 'pending_email',
  devVerificationCode: '123456',
};

function registrationBody() {
  return {
    email: ' Person@Example.com ',
    password: 'Strong-Office#2026',
    displayName: '测试同事',
    betaAccessCode: 'DEV-BETA-100',
    consents: {
      termsVersion: '2026-08-22',
      privacyVersion: '2026-08-22',
      communityGuidelinesVersion: '2026-08-22',
      adultDeclarationVersion: '2026-08-22',
    },
  };
}

function cookieResponse(): AuthCookieResponse & {
  cookie: jest.Mock;
  clearCookie: jest.Mock;
} {
  return {
    cookie: jest.fn<void, [string, string, CookieOptions]>(),
    clearCookie: jest.fn<void, [string, CookieOptions]>(),
  };
}

describe('AuthController community contract', () => {
  const originalEnv = { ...process.env };
  let service: {
    register: jest.Mock;
    registerAccount: jest.Mock;
    verifyEmail: jest.Mock;
    login: jest.Mock;
    loginAccount: jest.Mock;
    refresh: jest.Mock;
    logout: jest.Mock;
    logoutAll: jest.Mock;
    getCurrentUser: jest.Mock;
    resendVerification: jest.Mock;
    listSessions: jest.Mock;
    revokeDeviceSession: jest.Mock;
    updateProfile: jest.Mock;
    updatePrivacy: jest.Mock;
  };
  let controller: AuthController;

  beforeEach(() => {
    process.env.LOCAL_DEV = 'true';
    process.env.NODE_ENV = 'test';
    service = {
      register: jest.fn().mockResolvedValue(REGISTRATION),
      registerAccount: jest.fn().mockResolvedValue(SESSION),
      verifyEmail: jest.fn().mockResolvedValue(SESSION),
      login: jest.fn().mockResolvedValue(SESSION),
      loginAccount: jest.fn().mockResolvedValue(SESSION),
      refresh: jest.fn().mockResolvedValue(SESSION),
      logout: jest.fn().mockResolvedValue(undefined),
      logoutAll: jest.fn().mockResolvedValue(undefined),
      getCurrentUser: jest.fn().mockResolvedValue(USER),
      resendVerification: jest.fn().mockResolvedValue({}),
      listSessions: jest.fn().mockResolvedValue([]),
      revokeDeviceSession: jest.fn().mockResolvedValue({ current: false }),
      updateProfile: jest.fn().mockResolvedValue(USER),
      updatePrivacy: jest.fn().mockResolvedValue(USER),
    };
    controller = new AuthController(service as unknown as AuthService);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('maps both legacy and v1 routes to one controller', () => {
    expect(Reflect.getMetadata(PATH_METADATA, AuthController)).toEqual([
      'auth',
      'v1/auth',
    ]);
  });

  it('validates and normalizes registration input without activating it', async () => {
    await expect(
      controller.register(registrationBody(), '127.0.0.1', 'jest'),
    ).resolves.toEqual(REGISTRATION);
    expect(service.register).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'person@example.com',
        betaAccessCode: 'DEV-BETA-100',
      }),
      { ipAddress: '127.0.0.1', userAgent: 'jest' },
    );
  });

  it('sets HttpOnly refresh cookie but never returns the refresh token', async () => {
    const response = cookieResponse();
    const result = await controller.verifyEmail(
      {
        registrationId: REGISTRATION.registrationId,
        code: '123456',
      },
      response,
      'http://127.0.0.1:5173',
      '127.0.0.1',
      'jest',
    );
    expect(result).toEqual({ accessToken: 'access.jwt', user: USER });
    expect(JSON.stringify(result)).not.toContain(SESSION.refreshToken);
    expect(response.cookie).toHaveBeenCalledWith(
      'zbrs_refresh',
      SESSION.refreshToken,
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'strict',
        path: '/',
      }),
    );
  });

  it('registers a normalized username and immediately sets a refresh cookie', async () => {
    const response = cookieResponse();
    const result = await controller.registerAccount(
      {
        username: ' Office_User ',
        password: 'Strong-Office#2026',
        consents: registrationBody().consents,
      },
      response,
      'http://127.0.0.1:5173',
      '127.0.0.1',
      'jest',
    );
    expect(service.registerAccount).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'office_user' }),
      { ipAddress: '127.0.0.1', userAgent: 'jest' },
    );
    expect(result).toEqual({ accessToken: 'access.jwt', user: USER });
    expect(response.cookie).toHaveBeenCalledWith(
      'zbrs_refresh',
      SESSION.refreshToken,
      expect.objectContaining({ httpOnly: true, sameSite: 'strict' }),
    );
  });

  it('forwards request metadata to the resend abuse limiter', async () => {
    await controller.resendVerification(
      { registrationId: REGISTRATION.registrationId },
      '203.0.113.12',
      'jest-agent',
    );
    expect(service.resendVerification).toHaveBeenCalledWith(
      { registrationId: REGISTRATION.registrationId },
      { ipAddress: '203.0.113.12', userAgent: 'jest-agent' },
    );
  });

  it('rejects login cookie creation from an untrusted production Origin', async () => {
    process.env.LOCAL_DEV = 'false';
    process.env.NODE_ENV = 'production';
    process.env.PUBLIC_SITE_ORIGIN = 'https://zbrshyyzxx.top';

    await expect(
      controller.login(
        { email: 'person@example.com', password: 'Strong-Office#2026' },
        cookieResponse(),
        'https://evil.example',
        '203.0.113.10',
        'jest',
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(service.login).not.toHaveBeenCalled();
  });

  it('reads refresh cookie and enforces local trusted Origin', async () => {
    const response = cookieResponse();
    await controller.refresh(
      `zbrs_refresh=${encodeURIComponent(SESSION.refreshToken)}`,
      'http://127.0.0.1:5173',
      response,
      '127.0.0.1',
      'jest',
    );
    expect(service.refresh).toHaveBeenCalledWith(SESSION.refreshToken, {
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
    });
  });

  it('exposes the same current-user view at /v1/me', async () => {
    const current = new CurrentAccountController(
      service as unknown as AuthService,
    );
    await expect(current.me('internal-user-id')).resolves.toEqual(USER);
  });
});
