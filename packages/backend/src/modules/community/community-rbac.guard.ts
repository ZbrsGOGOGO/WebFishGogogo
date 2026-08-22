import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

import { User } from '../../database/entities/user.entity';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';

/** 管理端独立 RBAC：每次从数据库读取角色，不接受请求体或客户端缓存角色。 */
@Injectable()
export class CommunityRbacGuard implements CanActivate {
  constructor(private readonly dataSource: DataSource) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.user?.id;
    if (!userId) throw this.denied();
    const user = await this.dataSource.getRepository(User).findOne({
      where: { id: userId, accountStatus: 'active' },
    });
    if (!user || (user.communityRole !== 'moderator' && user.communityRole !== 'admin')) {
      throw this.denied();
    }
    request.user = {
      ...request.user!,
      communityRole: user.communityRole,
    };
    return true;
  }

  private denied(): ForbiddenException {
    return new ForbiddenException({ code: 'MODERATOR_ACCESS_REQUIRED' });
  }
}
