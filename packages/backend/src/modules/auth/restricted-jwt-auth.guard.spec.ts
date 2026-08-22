import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { DataSource } from 'typeorm';

import { AuthSession } from '../../database/entities/auth-session.entity';
import { User } from '../../database/entities/user.entity';
import type { AuthenticatedRequest } from './jwt-auth.guard';
import { RestrictedJwtAuthGuard } from './restricted-jwt-auth.guard';

const SECRET = 'restricted-guard-test-secret-with-at-least-32-characters';

describe('RestrictedJwtAuthGuard', () => {
  let jwt: JwtService;

  beforeEach(() => {
    jwt = new JwtService({ secret: SECRET });
  });

  it.each(['active', 'suspended', 'banned', 'deleting'] as const)(
    'allows an intact restricted session for a %s account',
    async (accountStatus) => {
      const request: AuthenticatedRequest = {
        headers: {
          authorization: `Bearer ${await token(jwt)}`,
        },
      };
      const guard = guardFor(jwt, accountStatus);
      await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
      expect(request.user).toEqual({ id: 'user-1', sessionId: 'session-1' });
    },
  );

  it.each(['pending_email', 'deleted'] as const)(
    'rejects a %s account even with a correctly signed token',
    async (accountStatus) => {
      const request: AuthenticatedRequest = {
        headers: { authorization: `Bearer ${await token(jwt)}` },
      };
      await expect(
        guardFor(jwt, accountStatus).canActivate(contextFor(request)),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    },
  );

  it('rejects a revoked server-side session', async () => {
    const request: AuthenticatedRequest = {
      headers: { authorization: `Bearer ${await token(jwt)}` },
    };
    await expect(
      guardFor(jwt, 'deleting', true).canActivate(contextFor(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

function guardFor(
  jwt: JwtService,
  accountStatus: User['accountStatus'],
  revoked = false,
): RestrictedJwtAuthGuard {
  const session = {
    id: 'session-1',
    userId: 'user-1',
    revokedAt: revoked ? new Date() : null,
    expiresAt: new Date(Date.now() + 60_000),
  } as AuthSession;
  const user = { id: 'user-1', accountStatus } as User;
  const eligibleUser = ['active', 'suspended', 'banned', 'deleting'].includes(
    accountStatus,
  )
    ? user
    : null;
  const dataSource = {
    getRepository: (entity: unknown) => ({
      findOne: jest
        .fn()
        .mockResolvedValue(entity === AuthSession ? session : eligibleUser),
    }),
  } as unknown as DataSource;
  return new RestrictedJwtAuthGuard(jwt, dataSource);
}

async function token(jwt: JwtService): Promise<string> {
  return jwt.signAsync({ sub: 'user-1', sid: 'session-1', typ: 'access' });
}

function contextFor(request: AuthenticatedRequest): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: <T>() => request as unknown as T,
    }),
  } as unknown as ExecutionContext;
}
