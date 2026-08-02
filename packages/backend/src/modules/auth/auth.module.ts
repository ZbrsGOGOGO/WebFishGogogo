import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';

import { buildJwtConfig } from '../../config/jwt.config';
import { User } from '../../database/entities';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
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
    TypeOrmModule.forFeature([User]),
    // global: true 使 JwtService 在全应用可注入，
    // 令依赖它的 JwtAuthGuard 在 memo/preferences 等模块的路由上下文中也能被解析，
    // 而无需这些模块显式 import AuthModule（保持其无改动）。
    JwtModule.register({ ...buildJwtConfig(), global: true }),
  ],
  controllers: [AuthController],
  providers: [UserRepository, AuthService, JwtAuthGuard],
  exports: [UserRepository, AuthService, JwtAuthGuard],
})
export class AuthModule {}
