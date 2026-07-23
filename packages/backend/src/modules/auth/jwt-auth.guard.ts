import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import type { JwtPayload } from './auth.service';

/**
 * 认证后请求上携带的用户主体（最小形态）。
 * 由 JwtAuthGuard 在验签成功后填充 request.user。
 */
export interface AuthenticatedUser {
  id: string;
}

/**
 * 受保护路由所需的请求最小形态（避免引入 @types/express 依赖）。
 * 可替换为 express.Request 类型而不影响调用方契约。
 */
export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthenticatedUser;
}

/**
 * JwtAuthGuard：受保护路由的 JWT 鉴权守卫（Task 3.4，对齐 Requirement 1.5 / 1.6）。
 *
 * - 从 `Authorization: Bearer <token>` 头提取访问令牌。
 * - 使用 JwtService 以与签发时一致的密钥/算法验签并解析声明。
 * - 验签成功：将 payload.sub（JWT subject = userId）写入 request.user 并放行（Req 1.5）。
 * - 缺失 / 格式错误 / 无效 / 过期令牌：抛出 UnauthorizedException（Req 1.6）。
 *
 * 对外契约（request.user.id 与 @CurrentUserId()）与此前的临时守卫保持一致，
 * 依赖它的受保护控制器（memo / preferences 等）无需改动。
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(req);

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      // 无效 / 过期 / 篡改的令牌统一按未授权处理，且不泄露具体原因。
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (!payload || typeof payload.sub !== 'string' || payload.sub.length === 0) {
      throw new UnauthorizedException('Invalid token payload');
    }

    req.user = { id: payload.sub };
    return true;
  }

  private extractBearerToken(req: AuthenticatedRequest): string {
    const rawHeader = req.headers.authorization;
    const header = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    const token = header.slice('Bearer '.length).trim();
    if (!token) {
      throw new UnauthorizedException('Empty bearer token');
    }
    return token;
  }
}
