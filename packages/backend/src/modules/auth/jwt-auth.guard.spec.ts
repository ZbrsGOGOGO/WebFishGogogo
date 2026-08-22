import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { DataSource } from 'typeorm';

import { AuthSession } from '../../database/entities/auth-session.entity';
import { User } from '../../database/entities/user.entity';
import {
  AuthenticatedRequest,
  JwtAuthGuard,
} from './jwt-auth.guard';

const SECRET = 'guard-test-secret-with-at-least-32-characters';

function contextWith(token: string): {
  context: ExecutionContext;
  request: AuthenticatedRequest;
} {
  const request: AuthenticatedRequest = {
    headers: { authorization: `Bearer ${token}` },
  };
  return {
    request,
    context: {
      switchToHttp: () => ({
        getRequest: <T>() => request as unknown as T,
      }),
    } as unknown as ExecutionContext,
  };
}

describe('JwtAuthGuard session-aware authorization', () => {
  let jwt: JwtService;

  beforeEach(() => {
    jwt = new JwtService({ secret: SECRET });
  });

  function guardFor(accountStatus: User['accountStatus'], revoked = false) {
    const session = {
      id: 'session-1',
      userId: 'user-1',
      revokedAt: revoked ? new Date() : null,
      expiresAt: new Date(Date.now() + 60_000),
    } as AuthSession;
    const user = { id: 'user-1', accountStatus } as User;
    const dataSource = {
      getRepository: (entity: unknown) => ({
        findOne: jest
          .fn()
          .mockResolvedValue(entity === AuthSession ? session : user),
      }),
    } as unknown as DataSource;
    return new JwtAuthGuard(jwt, dataSource);
  }

  it('requires typ=access and sid, then attaches both user and session ids', async () => {
    const token = await jwt.signAsync({
      sub: 'user-1',
      sid: 'session-1',
      typ: 'access',
    });
    const { context, request } = contextWith(token);
    await expect(guardFor('active').canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({ id: 'user-1', sessionId: 'session-1' });
  });

  it.each(['pending_email', 'banned', 'suspended', 'deleting', 'deleted'] as const)(
    'rejects a valid token when account status is %s',
    async (status) => {
      const token = await jwt.signAsync({
        sub: 'user-1',
        sid: 'session-1',
        typ: 'access',
      });
      const { context } = contextWith(token);
      await expect(guardFor(status).canActivate(context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    },
  );

  it('rejects a revoked server-side session immediately', async () => {
    const token = await jwt.signAsync({
      sub: 'user-1',
      sid: 'session-1',
      typ: 'access',
    });
    const { context } = contextWith(token);
    await expect(
      guardFor('active', true).canActivate(context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects legacy tokens without sid', async () => {
    const token = await jwt.signAsync({ sub: 'user-1' });
    const { context } = contextWith(token);
    await expect(guardFor('active').canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
