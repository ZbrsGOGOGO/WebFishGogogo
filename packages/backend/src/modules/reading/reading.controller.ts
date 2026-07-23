import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ArticleViewModel } from '@stealth-reader/shared';

import { CurrentUserId } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateBookmarkDto } from './dto/create-bookmark.dto';
import { SaveProgressDto } from './dto/save-progress.dto';
import {
  BookmarkView,
  ChapterTocItem,
  ReadingService,
} from './reading.service';

/**
 * 皮肤缺省值：未显式指定 ?skin= 时使用 CSDN 伪装皮肤（design.md 6.4）。
 */
const DEFAULT_SKIN_ID = 'csdn';

/**
 * ReadingController：阅读引擎 REST API（design.md 6.4）。
 *
 * - GET    /reading/:docId/article           获取伪装阅读视图（Req 5.1）。
 * - PATCH  /reading/:docId/progress          保存阅读进度（Req 7.1/7.2）。
 * - GET    /reading/:docId/chapters          章节目录（Req 8.1）。
 * - GET    /reading/:docId/bookmarks         列出书签（Req 8.4）。
 * - POST   /reading/:docId/bookmarks         创建书签（Req 8.3）。
 * - DELETE /reading/:docId/bookmarks/:id     删除书签（Req 8.5）。
 *
 * 全部路由经 JwtAuthGuard 保护，userId 由 @CurrentUserId() 从已认证请求派生，
 * 客户端无法伪造他人 userId。文档归属校验在 Service 层完成，越权/不存在统一
 * 抛 ForbiddenException，不泄露文档是否存在（Req 12.3）。
 */
@UseGuards(JwtAuthGuard)
@Controller('reading')
export class ReadingController {
  constructor(private readonly readingService: ReadingService) {}

  /**
   * GET /reading/:docId/article?skin=csdn
   * 按用户当前进度组装伪装文章视图。skin 缺省为 'csdn'。
   *
   * _Requirements: 5.1, 12.3_
   */
  @Get(':docId/article')
  async getArticle(
    @CurrentUserId() userId: string,
    @Param('docId') docId: string,
    @Query('skin') skin?: string,
  ): Promise<ArticleViewModel> {
    const skinId = skin && skin.trim().length > 0 ? skin : DEFAULT_SKIN_ID;
    return this.readingService.getArticleView(userId, docId, skinId);
  }

  /**
   * PATCH /reading/:docId/progress
   * 保存阅读进度（幂等）。documentId 取自路由参数。
   *
   * _Requirements: 7.1, 7.2, 12.3_
   */
  @Patch(':docId/progress')
  @HttpCode(HttpStatus.NO_CONTENT)
  async saveProgress(
    @CurrentUserId() userId: string,
    @Param('docId') docId: string,
    @Body() body: SaveProgressDto,
  ): Promise<void> {
    if (
      !body ||
      typeof body.chapterIdx !== 'number' ||
      typeof body.charOffset !== 'number'
    ) {
      throw new BadRequestException('chapterIdx 与 charOffset 必须为数字');
    }
    await this.readingService.saveProgress(userId, {
      documentId: docId,
      chapterIdx: body.chapterIdx,
      charOffset: body.charOffset,
      percent: typeof body.percent === 'number' ? body.percent : 0,
    });
  }

  /**
   * GET /reading/:docId/chapters
   * 返回按 idx 升序的章节目录。
   *
   * _Requirements: 8.1, 12.3_
   */
  @Get(':docId/chapters')
  async getChapters(
    @CurrentUserId() userId: string,
    @Param('docId') docId: string,
  ): Promise<ChapterTocItem[]> {
    return this.readingService.getChapters(userId, docId);
  }

  /**
   * GET /reading/:docId/bookmarks
   * 列出当前用户在该文档下的书签。
   *
   * _Requirements: 8.4_
   */
  @Get(':docId/bookmarks')
  async listBookmarks(
    @CurrentUserId() userId: string,
    @Param('docId') docId: string,
  ): Promise<BookmarkView[]> {
    return this.readingService.listBookmarks(userId, docId);
  }

  /**
   * POST /reading/:docId/bookmarks
   * 在当前位置创建书签。
   *
   * _Requirements: 8.3, 12.3_
   */
  @Post(':docId/bookmarks')
  async createBookmark(
    @CurrentUserId() userId: string,
    @Param('docId') docId: string,
    @Body() body: CreateBookmarkDto,
  ): Promise<BookmarkView> {
    if (
      !body ||
      typeof body.chapterIdx !== 'number' ||
      typeof body.charOffset !== 'number'
    ) {
      throw new BadRequestException('chapterIdx 与 charOffset 必须为数字');
    }
    return this.readingService.createBookmark(userId, docId, {
      chapterIdx: body.chapterIdx,
      charOffset: body.charOffset,
      note: body.note ?? null,
    });
  }

  /**
   * DELETE /reading/:docId/bookmarks/:bookmarkId
   * 删除本人拥有的书签；归属校验在 Service 层完成。
   *
   * _Requirements: 8.5_
   */
  @Delete(':docId/bookmarks/:bookmarkId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteBookmark(
    @CurrentUserId() userId: string,
    @Param('bookmarkId') bookmarkId: string,
  ): Promise<void> {
    await this.readingService.deleteBookmark(userId, bookmarkId);
  }
}
