import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';

import {
  AuthRequestMetadata,
  AuthDeviceSessionView,
  AuthService,
  AuthSessionResult,
  AuthUserView,
  LoginResult,
  RegistrationResult,
  VerificationDeliveryResult,
} from './auth.service';
import {
  AuthCookieResponse,
  assertTrustedCookieOrigin,
  readRefreshCookie,
  refreshCookieName,
  refreshCookieOptions,
} from './auth-cookie';
import { CurrentSessionId, CurrentUserId } from './current-user.decorator';
import { LoginDto, toLoginInput } from './dto/login.dto';
import { RegisterDto, toRegisterInput } from './dto/register.dto';
import {
  AccountLoginDto,
  AccountRegisterDto,
  toAccountLoginInput,
  toAccountRegisterInput,
} from './dto/account-credentials.dto';
import {
  ResendVerificationDto,
  toResendVerificationInput,
} from './dto/resend-verification.dto';
import { toUpdateProfileInput, UpdateProfileDto } from './dto/update-profile.dto';
import { toPrivacySettings, UpdatePrivacyDto } from './dto/update-privacy.dto';
import { validateUuid } from './dto/auth-validation';
import {
  toVerifyEmailInput,
  VerifyEmailDto,
} from './dto/verify-email.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

/** 旧 /auth 与新 /v1/auth 共用同一控制器，避免旧注册入口绕过 Beta。 */
@Controller(['auth', 'v1/auth'])
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(
    @Body() body: RegisterDto,
    @Ip() ipAddress?: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<RegistrationResult> {
    return this.authService.register(
      toRegisterInput(body),
      this.metadata(ipAddress, userAgent),
    );
  }

  @Post('account/register')
  @HttpCode(HttpStatus.CREATED)
  async registerAccount(
    @Body() body: AccountRegisterDto,
    @Res({ passthrough: true }) response: AuthCookieResponse,
    @Headers('origin') origin: string | undefined,
    @Ip() ipAddress?: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<LoginResult> {
    assertTrustedCookieOrigin(origin);
    const result = await this.authService.registerAccount(
      toAccountRegisterInput(body),
      this.metadata(ipAddress, userAgent),
    );
    this.setRefreshCookie(response, result);
    return this.publicLoginResult(result);
  }

  @Post(['verify-email', 'email/verify'])
  @HttpCode(HttpStatus.OK)
  async verifyEmail(
    @Body() body: VerifyEmailDto,
    @Res({ passthrough: true }) response: AuthCookieResponse,
    @Headers('origin') origin: string | undefined,
    @Ip() ipAddress?: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<LoginResult> {
    assertTrustedCookieOrigin(origin);
    const result = await this.authService.verifyEmail(
      toVerifyEmailInput(body),
      this.metadata(ipAddress, userAgent),
    );
    this.setRefreshCookie(response, result);
    return this.publicLoginResult(result);
  }

  @Post('email/verification-requests')
  @HttpCode(HttpStatus.OK)
  resendVerification(
    @Body() body: ResendVerificationDto,
    @Ip() ipAddress?: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<VerificationDeliveryResult> {
    return this.authService.resendVerification(
      toResendVerificationInput(body),
      this.metadata(ipAddress, userAgent),
    );
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) response: AuthCookieResponse,
    @Headers('origin') origin: string | undefined,
    @Ip() ipAddress?: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<LoginResult> {
    assertTrustedCookieOrigin(origin);
    const result = await this.authService.login(
      toLoginInput(body),
      this.metadata(ipAddress, userAgent),
    );
    this.setRefreshCookie(response, result);
    return this.publicLoginResult(result);
  }

  @Post('account/login')
  @HttpCode(HttpStatus.OK)
  async loginAccount(
    @Body() body: AccountLoginDto,
    @Res({ passthrough: true }) response: AuthCookieResponse,
    @Headers('origin') origin: string | undefined,
    @Ip() ipAddress?: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<LoginResult> {
    assertTrustedCookieOrigin(origin);
    const result = await this.authService.loginAccount(
      toAccountLoginInput(body),
      this.metadata(ipAddress, userAgent),
    );
    this.setRefreshCookie(response, result);
    return this.publicLoginResult(result);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Headers('cookie') cookieHeader: string | undefined,
    @Headers('origin') origin: string | undefined,
    @Res({ passthrough: true }) response: AuthCookieResponse,
    @Ip() ipAddress?: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<LoginResult> {
    assertTrustedCookieOrigin(origin);
    const result = await this.authService.refresh(
      readRefreshCookie(cookieHeader),
      this.metadata(ipAddress, userAgent),
    );
    this.setRefreshCookie(response, result);
    return this.publicLoginResult(result);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Headers('cookie') cookieHeader: string | undefined,
    @Headers('origin') origin: string | undefined,
    @Res({ passthrough: true }) response: AuthCookieResponse,
  ): Promise<void> {
    assertTrustedCookieOrigin(origin);
    await this.authService.logout(readRefreshCookie(cookieHeader));
    this.clearRefreshCookie(response);
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async logoutAll(
    @CurrentUserId() userId: string,
    @Headers('origin') origin: string | undefined,
    @Res({ passthrough: true }) response: AuthCookieResponse,
  ): Promise<void> {
    assertTrustedCookieOrigin(origin);
    await this.authService.logoutAll(userId);
    this.clearRefreshCookie(response);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUserId() userId: string): Promise<AuthUserView> {
    return this.authService.getCurrentUser(userId);
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  sessions(
    @CurrentUserId() userId: string,
    @CurrentSessionId() sessionId: string,
  ): Promise<AuthDeviceSessionView[]> {
    return this.authService.listSessions(userId, sessionId);
  }

  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSession(
    @Param('id') rawSessionId: string,
    @CurrentUserId() userId: string,
    @CurrentSessionId() currentSessionId: string,
    @Res({ passthrough: true }) response: AuthCookieResponse,
  ): Promise<void> {
    const sessionId = validateUuid(rawSessionId, 'sessionId');
    const result = await this.authService.revokeDeviceSession(
      userId,
      currentSessionId,
      sessionId,
    );
    if (result.current) this.clearRefreshCookie(response);
  }

  private metadata(
    ipAddress: string | undefined,
    userAgent: string | undefined,
  ): AuthRequestMetadata {
    return { ipAddress: ipAddress ?? null, userAgent: userAgent ?? null };
  }

  private setRefreshCookie(
    response: AuthCookieResponse,
    result: AuthSessionResult,
  ): void {
    const remaining = Math.max(
      0,
      result.refreshExpiresAt.getTime() - Date.now(),
    );
    response.cookie(
      refreshCookieName(),
      result.refreshToken,
      refreshCookieOptions(remaining),
    );
  }

  private clearRefreshCookie(response: AuthCookieResponse): void {
    response.clearCookie(refreshCookieName(), refreshCookieOptions(0));
  }

  private publicLoginResult(result: AuthSessionResult): LoginResult {
    return { accessToken: result.accessToken, user: result.user };
  }
}

/** PRD 的正式当前用户入口；与 /auth/me 返回完全相同的视图。 */
@Controller('v1')
export class CurrentAccountController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUserId() userId: string): Promise<AuthUserView> {
    return this.authService.getCurrentUser(userId);
  }

  @Patch('me/profile')
  @UseGuards(JwtAuthGuard)
  updateProfile(
    @CurrentUserId() userId: string,
    @Body() body: UpdateProfileDto,
  ): Promise<AuthUserView> {
    return this.authService.updateProfile(userId, toUpdateProfileInput(body));
  }

  @Patch('me/privacy')
  @UseGuards(JwtAuthGuard)
  updatePrivacy(
    @CurrentUserId() userId: string,
    @Body() body: UpdatePrivacyDto,
  ): Promise<AuthUserView> {
    return this.authService.updatePrivacy(userId, toPrivacySettings(body));
  }
}
