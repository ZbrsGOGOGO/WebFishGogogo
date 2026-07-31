import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';

import { AuthService, AuthUserView, LoginResult } from './auth.service';
import { CurrentUserId } from './current-user.decorator';
import { LoginDto, toLoginInput } from './dto/login.dto';
import { RegisterDto, toRegisterInput } from './dto/register.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

/**
 * AuthController：认证 REST API（design.md 6.4，对齐 Requirement 1.1 / 1.3）。
 *
 * - POST /auth/register：创建新账户，成功返回账户视图（Req 1.1）；
 *   邮箱重复由 AuthService 抛出冲突错误（Req 1.2）。
 * - POST /auth/login：校验凭据，成功签发 JWT 访问令牌（Req 1.3）；
 *   凭据不匹配由 AuthService 抛出认证失败错误（Req 1.4）。
 * - GET /auth/me：使用有效 JWT 恢复当前账户视图。
 *
 * register / login 为公开入口；me 单独由 JwtAuthGuard 保护。
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

  /**
   * GET /auth/me：返回当前 JWT 对应的账户视图。
   *
   * 用于 SPA 刷新后只有持久化 token、内存 user 已丢失时恢复会话。
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUserId() userId: string): Promise<AuthUserView> {
    return this.authService.getCurrentUser(userId);
  }
}
