import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

import { User } from '../../../database/entities/user.entity';
import type { AuthenticatedRequest } from '../../auth/jwt-auth.guard';

export function officeBattleEnabled(): boolean {
  const configured = process.env.FEATURE_COMMUNITY_BATTLE_ENABLED;
  return configured === 'true' || (configured === undefined && process.env.LOCAL_DEV === 'true');
}

@Injectable()
export class OfficeBattleFeatureGuard implements CanActivate {
  canActivate(): boolean {
    if (officeBattleEnabled()) return true;
    throw new ServiceUnavailableException({ code: 'COMMUNITY_BATTLE_DISABLED' });
  }
}

/** Every Office Battle endpoint requires a currently socially verified account. */
@Injectable()
export class OfficeBattleVerifiedGuard implements CanActivate {
  constructor(private readonly dataSource: DataSource) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user?.id) throw new UnauthorizedException({ code: 'INVALID_SESSION' });
    const user = await this.dataSource.getRepository(User).findOne({
      where: { id: request.user.id },
      select: { id: true, accountStatus: true, socialVerificationStatus: true },
    });
    if (!user || user.accountStatus !== 'active') {
      throw new UnauthorizedException({ code: 'INVALID_SESSION' });
    }
    if (user.socialVerificationStatus !== 'verified') {
      throw new ForbiddenException({ code: 'SOCIAL_VERIFICATION_REQUIRED' });
    }
    return true;
  }
}
