import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';

import type { AuthenticatedRequest } from './jwt-auth.guard';

/**
 * @CurrentUserId()：从已认证请求中提取当前用户 id。
 *
 * 依赖 JwtAuthGuard（或 Task 3.4 的真实守卫）先行填充 request.user。
 * 未认证时抛出 401，避免控制器拿到 undefined userId。
 */
export const CurrentUserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Unauthenticated request');
    }
    return userId;
  },
);
