import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';

import { AuthService, AuthUserView, LoginResult } from './auth.service';
import { LoginDto, toLoginInput } from './dto/login.dto';
import { RegisterDto, toRegisterInput } from './dto/register.dto';

/**
 * AuthController：认证 REST API（design.md 6.4，对齐 Requirement 1.1 / 1.3）。
 *
 * - POST /auth/register：创建新账户，成功返回账户视图（Req 1.1）；
 *   邮箱重复由 AuthService 抛出冲突错误（Req 1.2）。
 * - POST /auth/login：校验凭据，成功签发 JWT 访问令牌（Req 1.3）；
 *   凭据不匹配由 AuthService 抛出认证失败错误（Req 1.4）。
 *
 * 两个接口均为公开（无 JwtAuthGuard），是获取访问令牌的入口。
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /auth/register：注册新账户。
   *
   * _Requirements: 1.1_
   */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() body: RegisterDto): Promise<AuthUserView> {
    const input = toRegisterInput(body);
    return this.authService.register(input);
  }

  /**
   * POST /auth/login：登录并签发 JWT 访问令牌。
   *
   * _Requirements: 1.3_
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: LoginDto): Promise<LoginResult> {
    const input = toLoginInput(body);
    return this.authService.login(input);
  }
}
