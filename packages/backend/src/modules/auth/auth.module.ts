import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { APP_FILTER } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';

import { buildJwtConfig } from '../../config/jwt.config';
import {
  AccountAppeal,
  AccountDeletionRequest,
  AccountRestriction,
  AdminAuditLog,
  AuthEmailOutbox,
  AuthRateLimitBucket,
  AuthRefreshToken,
  AuthSession,
  BetaAccessCode,
  BetaAccessReservation,
  CommunityCapacityGuard,
  ConsentRecord,
  EmailVerification,
  PlayerProfile,
  PasswordResetToken,
  ReferralClaimToken,
  ReferralCode,
  ReferralRedemption,
  SocialVerificationCallbackReceipt,
  SocialVerificationSession,
  User,
} from '../../database/entities';
import { AuthEmailOutboxService } from './auth-email-outbox.service';
import { AccountAdminGuard } from './account-admin.guard';
import {
  AccountAppealAdminController,
  AccountLifecycleController,
  AccountSecurityPublicController,
  SocialVerificationController,
} from './account-security.controller';
import { AccountLifecycleService } from './account-lifecycle.service';
import { AuthRateLimitExceptionFilter } from './auth-rate-limit.filter';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { AuthController, CurrentAccountController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthSensitiveDataService } from './auth-sensitive-data.service';
import { BetaAccessService } from './beta-access.service';
import { CommunityCapacityService } from './community-capacity.service';
import { EmailDeliveryService } from './email-delivery.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';
import { PasswordResetService } from './password-reset.service';
import { RestrictedJwtAuthGuard } from './restricted-jwt-auth.guard';
import { SocialVerificationProviderService } from './social-verification-provider.service';
import { SocialVerificationService } from './social-verification.service';
import { UserRepository } from './user.repository';

/**
 * Auth 模块。
 *
 * 注册 User 实体仓储、UserRepository（Task 3.1）、AuthService（Task 3.2）、
 * AuthController（Task 3.4：POST /auth/register、POST /auth/login）以及
 * 真实的 JwtAuthGuard（Task 3.4：JWT 验签鉴权）。
 * JwtModule 提供 JwtService：既用于登录签发访问令牌，也供 JwtAuthGuard 验签，
 * 密钥/有效期通过 buildJwtConfig 从环境变量加载（签发与校验使用同一密钥）。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AccountAppeal,
      AccountDeletionRequest,
      AccountRestriction,
      AdminAuditLog,
      User,
      AuthEmailOutbox,
      AuthRateLimitBucket,
      BetaAccessCode,
      BetaAccessReservation,
      EmailVerification,
      AuthSession,
      AuthRefreshToken,
      ConsentRecord,
      PlayerProfile,
      PasswordResetToken,
      ReferralClaimToken,
      ReferralCode,
      ReferralRedemption,
      SocialVerificationCallbackReceipt,
      SocialVerificationSession,
      CommunityCapacityGuard,
    ]),
    // global: true 使 JwtService 在全应用可注入，
    // 令依赖它的 JwtAuthGuard 在 memo/preferences 等模块的路由上下文中也能被解析，
    // 而无需这些模块显式 import AuthModule（保持其无改动）。
    JwtModule.register({ ...buildJwtConfig(), global: true }),
  ],
  controllers: [
    AuthController,
    CurrentAccountController,
    AccountSecurityPublicController,
    SocialVerificationController,
    AccountLifecycleController,
    AccountAppealAdminController,
  ],
  providers: [
    UserRepository,
    AuthService,
    AccountLifecycleService,
    AuthSensitiveDataService,
    AuthEmailOutboxService,
    AuthRateLimitService,
    BetaAccessService,
    CommunityCapacityService,
    EmailDeliveryService,
    PasswordResetService,
    SocialVerificationProviderService,
    SocialVerificationService,
    {
      provide: APP_FILTER,
      useClass: AuthRateLimitExceptionFilter,
    },
    JwtAuthGuard,
    OptionalJwtAuthGuard,
    RestrictedJwtAuthGuard,
    AccountAdminGuard,
  ],
  exports: [
    UserRepository,
    AuthService,
    JwtAuthGuard,
    OptionalJwtAuthGuard,
    RestrictedJwtAuthGuard,
  ],
})
export class AuthModule {}
