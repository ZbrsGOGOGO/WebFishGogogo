import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

import { User } from '../../database/entities/user.entity';
import type { AuthenticatedRequest } from './jwt-auth.guard';

/** Appeal decisions are reserved for the admin role and rechecked in the DB. */
@Injectable()
export class AccountAdminGuard implements CanActivate {
  constructor(private readonly dataSource: DataSource) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.user?.id;
    if (!userId) throw this.denied();
    const user = await this.dataSource.getRepository(User).findOne({
      where: { id: userId, accountStatus: 'active', communityRole: 'admin' },
    });
    if (!user) throw this.denied();
    return true;
  }

  private denied(): ForbiddenException {
    return new ForbiddenException({ code: 'ADMIN_ACCESS_REQUIRED' });
  }
}
