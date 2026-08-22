import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource, In } from 'typeorm';

import { AuthSession } from '../../database/entities/auth-session.entity';
import { User } from '../../database/entities/user.entity';
import type { JwtPayload } from './auth.service';
import type { AuthenticatedRequest } from './jwt-auth.guard';

const RESTRICTED_SESSION_STATUSES: User['accountStatus'][] = [
  'active',
  'suspended',
  'banned',
  'deleting',
];

/** Only account-status, appeal and deletion routes may use this guard. */
@Injectable()
export class RestrictedJwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const raw = request.headers.authorization;
    const header = Array.isArray(raw) ? raw[0] : raw;
    if (!header?.startsWith('Bearer ')) throw this.invalid();
    const token = header.slice('Bearer '.length).trim();
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      throw this.invalid();
    }
    if (
      payload?.typ !== 'access' ||
      typeof payload.sub !== 'string' ||
      typeof payload.sid !== 'string'
    ) {
      throw this.invalid();
    }
    const session = await this.dataSource.getRepository(AuthSession).findOne({
      where: { id: payload.sid, userId: payload.sub },
    });
    if (
      !session ||
      session.revokedAt !== null ||
      session.expiresAt.getTime() <= Date.now()
    ) {
      throw this.invalid();
    }
    const user = await this.dataSource.getRepository(User).findOne({
      where: {
        id: payload.sub,
        accountStatus: In(RESTRICTED_SESSION_STATUSES),
      },
    });
    if (!user) throw this.invalid();
    request.user = { id: user.id, sessionId: session.id };
    return true;
  }

  private invalid(): UnauthorizedException {
    return new UnauthorizedException({ code: 'INVALID_SESSION' });
  }
}
