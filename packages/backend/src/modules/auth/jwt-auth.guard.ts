import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';

import { AuthSession } from '../../database/entities/auth-session.entity';
import { User } from '../../database/entities/user.entity';
import type { JwtPayload } from './auth.service';

export interface AuthenticatedUser {
  id: string;
  sessionId: string;
  communityRole?: User['communityRole'];
}

export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthenticatedUser;
}

/** JWT 验签后仍校验服务端会话和账号状态，支持即时退出与封禁。 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request);

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      throw this.invalidSession();
    }
    if (
      payload?.typ !== 'access' ||
      typeof payload.sub !== 'string' ||
      !payload.sub ||
      typeof payload.sid !== 'string' ||
      !payload.sid
    ) {
      throw this.invalidSession();
    }

    const session = await this.dataSource.getRepository(AuthSession).findOne({
      where: { id: payload.sid, userId: payload.sub },
    });
    const now = Date.now();
    if (
      !session ||
      session.revokedAt !== null ||
      session.expiresAt.getTime() <= now
    ) {
      throw this.invalidSession();
    }

    const user = await this.dataSource.getRepository(User).findOne({
      where: { id: payload.sub },
    });
    if (!user || user.accountStatus !== 'active') {
      throw this.invalidSession();
    }

    request.user = { id: payload.sub, sessionId: payload.sid };
    return true;
  }

  private extractBearerToken(request: AuthenticatedRequest): string {
    const raw = request.headers.authorization;
    const header = Array.isArray(raw) ? raw[0] : raw;
    if (!header || !header.startsWith('Bearer ')) {
      throw this.invalidSession();
    }
    const token = header.slice('Bearer '.length).trim();
    if (!token) throw this.invalidSession();
    return token;
  }

  private invalidSession(): UnauthorizedException {
    return new UnauthorizedException({ code: 'INVALID_SESSION' });
  }
}
