import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';

import { AuthController } from './auth.controller';
import { AuthService, AuthUserView, LoginInput, LoginResult, RegisterInput } from './auth.service';

/**
 * AuthController 单元测试（Requirement 1.1–1.4）。
 *
 * 使用轻量 fake AuthService 验证控制器路由行为与请求体校验：
 * - POST /auth/register 透传规整后的输入并返回账户视图（Req 1.1）。
 * - POST /auth/login 透传凭据并返回签发结果（Req 1.3）。
 * - 非法请求体返回 400；service 抛出的领域错误（冲突/认证失败）向上冒泡。
 */
class FakeAuthService {
  registerCalls: RegisterInput[] = [];
  loginCalls: LoginInput[] = [];
  conflictOn: string | null = null;
  rejectLogin = false;

  async register(input: RegisterInput): Promise<AuthUserView> {
    this.registerCalls.push(input);
    if (this.conflictOn === input.email) {
      throw new ConflictException('该邮箱已被注册');
    }
    return { id: 'user-1', email: input.email, displayName: input.displayName ?? null };
  }

  async login(input: LoginInput): Promise<LoginResult> {
    this.loginCalls.push(input);
    if (this.rejectLogin) {
      throw new UnauthorizedException('邮箱或密码不正确');
    }
    return {
      accessToken: 'signed.jwt.token',
      user: { id: 'user-1', email: input.email, displayName: null },
    };
  }
}

function createController(): { controller: AuthController; service: FakeAuthService } {
  const service = new FakeAuthService();
  const controller = new AuthController(service as unknown as AuthService);
  return { controller, service };
}

describe('AuthController', () => {
  describe('POST /auth/register', () => {
    it('创建账户并返回账户视图（Req 1.1）', async () => {
      const { controller, service } = createController();

      const result = await controller.register({ email: 'a@example.com', password: 'secret123' });

      expect(result.email).toBe('a@example.com');
      expect(service.registerCalls).toEqual([
        { email: 'a@example.com', password: 'secret123', displayName: undefined },
      ]);
    });

    it('透传 displayName', async () => {
      const { controller, service } = createController();

      await controller.register({ email: 'a@example.com', password: 'secret123', displayName: '小明' });

      expect(service.registerCalls[0].displayName).toBe('小明');
    });

    it('缺少 email 时返回 400', async () => {
      const { controller } = createController();

      await expect(
        controller.register({ password: 'secret123' } as unknown as { email: string; password: string }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('重复邮箱冲突错误向上冒泡（Req 1.2）', async () => {
      const { controller, service } = createController();
      service.conflictOn = 'dup@example.com';

      await expect(
        controller.register({ email: 'dup@example.com', password: 'secret123' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('POST /auth/login', () => {
    it('凭据匹配时返回访问令牌（Req 1.3）', async () => {
      const { controller, service } = createController();

      const result = await controller.login({ email: 'a@example.com', password: 'secret123' });

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(service.loginCalls).toEqual([{ email: 'a@example.com', password: 'secret123' }]);
    });

    it('缺少 password 时返回 400', async () => {
      const { controller } = createController();

      await expect(
        controller.login({ email: 'a@example.com' } as unknown as { email: string; password: string }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('凭据不匹配时认证失败错误向上冒泡（Req 1.4）', async () => {
      const { controller, service } = createController();
      service.rejectLogin = true;

      await expect(
        controller.login({ email: 'a@example.com', password: 'wrong' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
