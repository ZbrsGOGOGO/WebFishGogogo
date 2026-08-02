import { BadRequestException, Body, Controller, Get, Put, UseGuards } from '@nestjs/common';

import { CurrentUserId } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdateMemoDto } from './dto/update-memo.dto';
import { MemoContent, MemoService } from './memo.service';

/**
 * MemoController：便签 REST API（design.md 6.4）。
 *
 * - GET /memo：恢复当前用户上次保存的便签内容（新会话打开便签时调用，Req 10.2）。
 * - PUT /memo：自动保存当前用户便签的最新内容（防抖由前端负责，Req 10.1）。
 *
 * 全部路由经 JwtAuthGuard 保护，userId 由 @CurrentUserId() 从已认证请求派生，
 * 便签内容始终与发起请求的用户 ID 关联（Req 10.3），客户端无法伪造他人 userId。
 */
@UseGuards(JwtAuthGuard)
@Controller('memo')
export class MemoController {
  constructor(private readonly memoService: MemoService) {}

  /**
   * GET /memo：读取当前用户的便签内容。
   * 若从未保存过，返回空内容。
   *
   * _Requirements: 10.2_
   */
  @Get()
  async getMemo(@CurrentUserId() userId: string): Promise<MemoContent> {
    return this.memoService.getMemo(userId);
  }

  /**
   * PUT /memo：保存当前用户便签的最新内容并返回保存结果。
   *
   * _Requirements: 10.1_
   */
  @Put()
  async saveMemo(
    @CurrentUserId() userId: string,
    @Body() body: UpdateMemoDto,
  ): Promise<MemoContent> {
    if (!body || typeof body.content !== 'string') {
      throw new BadRequestException('content 必须为字符串');
    }
    return this.memoService.saveMemo(userId, body.content);
  }
}
