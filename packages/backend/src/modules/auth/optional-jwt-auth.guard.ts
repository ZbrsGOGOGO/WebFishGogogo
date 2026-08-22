import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import { AuthenticatedRequest, JwtAuthGuard } from './jwt-auth.guard';

/** 无 Authorization 时允许匿名；一旦携带令牌则必须完整验签并校验服务端会话。 */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly requiredGuard: JwtAuthGuard) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const header = Array.isArray(authorization) ? authorization[0] : authorization;
    return header ? this.requiredGuard.canActivate(context) : true;
  }
}
