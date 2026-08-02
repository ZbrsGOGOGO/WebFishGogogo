import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from '@stealth-reader/shared';

import { CurrentUserId } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  DocumentsService,
  type PaginatedDocumentView,
  type UploadedDocumentView,
} from './documents.service';

/**
 * multipart 上传文件的最小形态（由 multer 填充）。
 *
 * 避免为编译期类型引入 `@types/multer`/`@types/express` 依赖（沿用 jwt-auth.guard
 * 里"以最小接口替代 express 类型"的做法）。仅声明 Service 需要的字段：
 * - originalname：原始文件名（派生标题 / 校验扩展名）。
 * - mimetype：客户端上报的 MIME 类型（宽松校验）。
 * - buffer：文件原始字节（memoryStorage，未落盘）。
 */
interface UploadedMultipartFile {
  originalname: string;
  mimetype?: string;
  buffer: Buffer;
}

/**
 * DocumentsController：文档库 REST API（design.md 6.4）。
 *
 * - POST   /documents：multipart 上传 .txt 文档（Req 2.1）。自有内容声明由表单字段
 *   `ownedContentDeclarationConfirmed` 传入；ownerId 由 @CurrentUserId() 派生（Req 2.4）。
 * - GET    /documents?page=&pageSize=&q=：分页浏览；带 q 时按标题搜索，均限本人（Req 3.1/3.2/3.3）。
 * - DELETE /documents/:id：软删除自有文档；非本人由 Service 抛 403（Req 3.4/3.5）。
 *
 * 全部路由经 JwtAuthGuard 保护，userId 由已认证请求派生，客户端无法伪造他人归属。
 */
@UseGuards(JwtAuthGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  /**
   * POST /documents：上传并解析 .txt 文档。
   *
   * 使用 FileInterceptor（memoryStorage）将单文件读入内存缓冲区，交由
   * DocumentsService.upload 编排声明校验、类型校验、创建、解析与状态流转。
   *
   * _Requirements: 2.1_
   */
  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async uploadDocument(
    @CurrentUserId() userId: string,
    @UploadedFile() file: UploadedMultipartFile | undefined,
    @Body() body: Record<string, unknown> = {},
  ): Promise<UploadedDocumentView> {
    if (!file) {
      throw new BadRequestException('请选择要上传的 .txt 文档');
    }

    return this.documentsService.upload({
      ownerId: userId,
      originalName: file.originalname,
      mimeType: file.mimetype ?? null,
      buffer: file.buffer,
      ownedContentDeclarationConfirmed: parseBooleanFlag(
        body?.ownedContentDeclarationConfirmed,
      ),
    });
  }

  /**
   * GET /documents：分页浏览或按标题搜索当前用户的文档库。
   *
   * - 带非空 `q` → searchDocuments（标题包含关键字，限本人，Req 3.3）。
   * - 否则 → listDocuments（本人全部未软删除文档，Req 3.1）。
   * 两者均分页（Req 3.2）。page/pageSize 做归一化，防止非法或过大取值。
   *
   * _Requirements: 3.1, 3.2, 3.3_
   */
  @Get()
  async listDocuments(
    @CurrentUserId() userId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('q') q?: string,
  ): Promise<PaginatedDocumentView> {
    const options = {
      page: parsePage(page),
      pageSize: parsePageSize(pageSize),
    };

    const keyword = (q ?? '').trim();
    if (keyword.length > 0) {
      return this.documentsService.searchDocuments(userId, keyword, options);
    }
    return this.documentsService.listDocuments(userId, options);
  }

  /**
   * DELETE /documents/:id：软删除自有文档。
   *
   * Service 仅当文档归属该用户时软删除；非本人 / 不存在统一抛 ForbiddenException
   * （不泄露存在性，Req 3.5）。成功返回 204 No Content。
   *
   * _Requirements: 3.4_
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteDocument(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
  ): Promise<void> {
    await this.documentsService.deleteDocument(userId, id);
  }
}

/**
 * 解析表单里的布尔声明字段。multipart 表单字段为字符串，需将 'true'/'1'/'on'/'yes'
 * 归一化为 true；其余（含缺省、'false'、'0'）为 false。声明未确认的最终拒绝在
 * Service 层（Req 2.2）。
 */
function parseBooleanFlag(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'on' || normalized === 'yes';
  }
  return false;
}

/** 归一化分页页码：非法 / 缺省回退到 DEFAULT_PAGE，最小为 1。 */
function parsePage(raw?: string): number {
  const parsed = Number.parseInt((raw ?? '').trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_PAGE;
  }
  return parsed;
}

/** 归一化每页数量：非法 / 缺省回退到 DEFAULT_PAGE_SIZE，钳制在 [1, MAX_PAGE_SIZE]。 */
function parsePageSize(raw?: string): number {
  const parsed = Number.parseInt((raw ?? '').trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_PAGE_SIZE;
  }
  return Math.min(parsed, MAX_PAGE_SIZE);
}
