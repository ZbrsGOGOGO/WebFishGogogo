import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { User } from '../../database/entities';
import { hashPassword, verifyPassword } from './password.util';
import { UserRepository } from './user.repository';

/**
 * 注册输入。
 */
export interface RegisterInput {
  email: string;
  password: string;
  displayName?: string | null;
}

/**
 * 登录输入。
 */
export interface LoginInput {
  email: string;
  password: string;
}

/**
 * 认证成功后返回的账户视图（绝不包含 passwordHash）。
 */
export interface AuthUserView {
  id: string;
  email: string;
  displayName: string | null;
}

/**
 * 登录结果：签发的 JWT 访问令牌 + 账户视图。
 */
export interface LoginResult {
  accessToken: string;
  user: AuthUserView;
}

/**
 * JWT 载荷。sub 为用户 id（JWT 标准 subject 声明）。
 */
export interface JwtPayload {
  sub: string;
  email: string;
}

/**
 * AuthService：注册 / 登录业务逻辑（对齐 requirements.md Requirement 1.1–1.4, 1.7）。
 *
 * - 密码始终以加盐哈希形式存储（复用 password.util，Requirement 1.7）。
 * - 注册时校验邮箱唯一性，重复邮箱返回冲突错误（Requirement 1.1, 1.2）。
 * - 登录校验凭据，匹配则签发 JWT，不匹配返回认证失败错误（Requirement 1.3, 1.4）。
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * 注册新账户。
   * Preconditions:
   *   - input.email / input.password 为经上层 DTO 校验后的合法值
   * Postconditions:
   *   - 邮箱未被占用时，创建账户并返回账户视图（Requirement 1.1）
   *   - 邮箱已存在时抛出 ConflictException（Requirement 1.2）
   *   - 密码以加盐哈希形式存储，绝不持久化明文（Requirement 1.7）
   */
  async register(input: RegisterInput): Promise<AuthUserView> {
    const existing = await this.userRepository.findByEmail(input.email);
    if (existing) {
      throw new ConflictException('该邮箱已被注册');
    }

    const passwordHash = await hashPassword(input.password);
    const user = await this.userRepository.createUser({
      email: input.email,
      passwordHash,
      displayName: input.displayName ?? null,
    });

    return this.toUserView(user);
  }

  /**
   * 登录并签发 JWT。
   * Postconditions:
   *   - 凭据匹配时签发 JWT 访问令牌并返回账户视图（Requirement 1.3）
   *   - 邮箱不存在或密码不匹配时抛出 UnauthorizedException（Requirement 1.4）
   *   - 为避免泄露邮箱是否存在，两种失败返回同一认证失败错误
   */
  async login(input: LoginInput): Promise<LoginResult> {
    const user = await this.userRepository.findByEmail(input.email);
    if (!user) {
      throw new UnauthorizedException('邮箱或密码不正确');
    }

    const matches = await verifyPassword(input.password, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('邮箱或密码不正确');
    }

    const payload: JwtPayload = { sub: user.id, email: user.email };
    const accessToken = await this.jwtService.signAsync(payload);

    return { accessToken, user: this.toUserView(user) };
  }

  private toUserView(user: User): AuthUserView {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
    };
  }
}
