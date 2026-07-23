import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { JwtPayload } from './auth.service';
import { AuthenticatedRequest, JwtAuthGuard } from './jwt-auth.guard';

/**
 * JwtAuthGuard 单元测试（Requirement 1.5 / 1.6）。
 *
 * 使用真实 JwtService（无 mock）签发/验签，验证：
 * - 有效 JWT 放行且将 sub 写入 request.user.id（Req 1.5）。
 * - 缺失 / 格式错误 / 无效签名 / 过期令牌统一返回未授权错误（Req 1.6）。
 */
const SECRET = 'test-secret';

function createContext(authorization?: string | string[]): {
  context: ExecutionContext;
  request: AuthenticatedRequest;
} {
  const request: AuthenticatedRequest = {
    headers: authorization === undefined ? {} : { authorization },
  };
  const context = {
    switchToHttp: () => ({ getRequest: <T>() => request as unknown as T }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('JwtAuthGuard', () => {
  let jwtService: JwtService;
  let guard: JwtAuthGuard;

  beforeEach(() => {
    jwtService = new JwtService({ secret: SECRET, signOptions: { expiresIn: '1h' } });
    guard = new JwtAuthGuard(jwtService);
  });

  it('放行携带有效 JWT 的请求并写入 request.user.id（Req 1.5）', async () => {
    const payload: JwtPayload = { sub: 'user-123', email: 'a@example.com' };
    const token = await jwtService.signAsync(payload);
    const { context, request } = createContext(`Bearer ${token}`);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({ id: 'user-123' });
  });

  it('缺失 Authorization 头时拒绝（Req 1.6）', async () => {
    const { context } = createContext(undefined);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('非 Bearer 方案时拒绝（Req 1.6）', async () => {
    const { context } = createContext('Basic abc');
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('Bearer 后为空令牌时拒绝（Req 1.6）', async () => {
    const { context } = createContext('Bearer ');
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('签名密钥不匹配的令牌时拒绝（Req 1.6）', async () => {
    const otherService = new JwtService({ secret: 'another-secret' });
    const token = await otherService.signAsync({ sub: 'user-1', email: 'a@example.com' });
    const { context } = createContext(`Bearer ${token}`);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('已过期令牌时拒绝（Req 1.6）', async () => {
    const token = await jwtService.signAsync(
      { sub: 'user-1', email: 'a@example.com' },
      { expiresIn: '-1s' },
    );
    const { context } = createContext(`Bearer ${token}`);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
