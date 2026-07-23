import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { User } from '../../database/entities';
import { AuthService } from './auth.service';
import { verifyPassword } from './password.util';
import { CreateUserInput, UserRepository } from './user.repository';

/**
 * 内存版 UserRepository：忠实实现 createUser / findByEmail / findById 的持久化语义，
 * 用于在无数据库环境下验证 AuthService 的注册/登录业务规则。
 */
class InMemoryUserRepository
  implements Pick<UserRepository, 'createUser' | 'findByEmail' | 'findById'>
{
  private store = new Map<string, User>();
  private seq = 0;

  async createUser(input: CreateUserInput): Promise<User> {
    const user = new User();
    user.id = `user-${++this.seq}`;
    user.email = input.email;
    user.passwordHash = input.passwordHash;
    user.displayName = input.displayName ?? null;
    user.createdAt = new Date();
    user.updatedAt = new Date();
    this.store.set(user.email, user);
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.store.get(email) ?? null;
  }

  async findById(id: string): Promise<User | null> {
    for (const user of this.store.values()) {
      if (user.id === id) return user;
    }
    return null;
  }
}

describe('AuthService', () => {
  let repo: InMemoryUserRepository;
  let jwtService: JwtService;
  let service: AuthService;

  beforeEach(() => {
    repo = new InMemoryUserRepository();
    jwtService = new JwtService({ secret: 'test-secret', signOptions: { expiresIn: '1h' } });
    service = new AuthService(repo as unknown as UserRepository, jwtService);
  });

  describe('register', () => {
    it('创建新账户并返回不含密码哈希的账户视图（Requirement 1.1）', async () => {
      const view = await service.register({ email: 'a@example.com', password: 'secret123' });

      expect(view.id).toBeDefined();
      expect(view.email).toBe('a@example.com');
      expect(view.displayName).toBeNull();
      expect((view as unknown as Record<string, unknown>).passwordHash).toBeUndefined();
    });

    it('以加盐哈希形式存储密码，绝不存明文（Requirement 1.7）', async () => {
      await service.register({ email: 'a@example.com', password: 'secret123' });

      const stored = await repo.findByEmail('a@example.com');
      expect(stored).not.toBeNull();
      expect(stored!.passwordHash).not.toBe('secret123');
      await expect(verifyPassword('secret123', stored!.passwordHash)).resolves.toBe(true);
    });

    it('重复邮箱注册抛出 ConflictException（Requirement 1.2）', async () => {
      await service.register({ email: 'dup@example.com', password: 'secret123' });

      await expect(
        service.register({ email: 'dup@example.com', password: 'another' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('login', () => {
    it('凭据匹配时签发可验证的 JWT（Requirement 1.3）', async () => {
      const registered = await service.register({ email: 'a@example.com', password: 'secret123' });

      const result = await service.login({ email: 'a@example.com', password: 'secret123' });

      expect(result.accessToken).toBeTruthy();
      const payload = jwtService.verify(result.accessToken);
      expect(payload.sub).toBe(registered.id);
      expect(payload.email).toBe('a@example.com');
      expect(result.user.email).toBe('a@example.com');
    });

    it('密码不匹配时抛出 UnauthorizedException（Requirement 1.4）', async () => {
      await service.register({ email: 'a@example.com', password: 'secret123' });

      await expect(
        service.login({ email: 'a@example.com', password: 'wrong-password' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('邮箱不存在时抛出 UnauthorizedException（Requirement 1.4）', async () => {
      await expect(
        service.login({ email: 'missing@example.com', password: 'whatever' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
