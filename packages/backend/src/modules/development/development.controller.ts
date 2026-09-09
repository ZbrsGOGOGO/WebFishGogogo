import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { DEVELOPMENT_LIMITS } from '@stealth-reader/shared';

import { CurrentUserId } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DevelopmentAccessGuard } from './development-access.guard';
import { DevelopmentAttachmentAuthorGuard } from './development-attachment-author.guard';
import {
  DevelopmentService,
  type DevelopmentUploadFile,
} from './development.service';
import {
  developmentCommentInput,
  developmentCreateInput,
  developmentDecisionInput,
  developmentId,
  developmentMemberInput,
  developmentPage,
  developmentVersion,
  developmentProgressInput,
  optionalDevelopmentStatus,
} from './development-validation';

interface HeaderResponse {
  setHeader(name: string, value: string): void;
}

// Multer 2.3's array-index bound is opt-in; both supplied form fields are flat.
// Nest 11.2's public limits type predates these options, so extend it explicitly.
type MultipartLimits = NonNullable<NonNullable<Parameters<typeof FileInterceptor>[1]>['limits']>;
const DEVELOPMENT_MULTIPART_LIMITS = {
  files: 1,
  fileSize: DEVELOPMENT_LIMITS.fileBytes,
  fields: 1,
  fieldSize: 32,
  fieldNestingDepth: 0,
  fieldArrayIndexLimit: 0,
  // Busboy emits partsLimit at the threshold: permit one field + one file.
  parts: 3,
} satisfies MultipartLimits & {
  fieldNestingDepth: number;
  fieldArrayIndexLimit: number;
};

@Controller('v1/development')
@UseGuards(JwtAuthGuard)
export class DevelopmentAccessController {
  constructor(private readonly development: DevelopmentService) {}

  @Get('access')
  access(@CurrentUserId() userId: string) {
    return this.development.access(userId);
  }
}

@Controller('v1/development')
@UseGuards(JwtAuthGuard, DevelopmentAccessGuard)
export class DevelopmentController {
  constructor(private readonly development: DevelopmentService) {}

  @Get('requests')
  requests(
    @CurrentUserId() userId: string,
    @Query('status') rawStatus?: string,
    @Query('page') rawPage?: string,
  ) {
    return this.development.listRequests(
      userId,
      optionalDevelopmentStatus(rawStatus),
      developmentPage(rawPage),
    );
  }

  @Post('requests')
  createRequest(
    @CurrentUserId() userId: string,
    @Body() body: unknown,
  ) {
    return this.development.createRequest(userId, developmentCreateInput(body));
  }

  @Get('review-export')
  reviewExport(
    @CurrentUserId() userId: string,
    @Query('status') rawStatus?: string,
  ) {
    return this.development.reviewExport(
      userId,
      rawStatus === 'all' ? 'all' : optionalDevelopmentStatus(rawStatus),
    );
  }

  @Get('members')
  members(@CurrentUserId() userId: string) {
    return this.development.listMembers(userId);
  }

  @Post('requests/:id/progress')
  progress(@CurrentUserId() userId: string, @Param('id') rawId: string, @Body() body: unknown) {
    return this.development.saveProgress(userId, developmentId(rawId), developmentProgressInput(body));
  }

  @Post('members')
  grantMember(
    @CurrentUserId() userId: string,
    @Body() body: unknown,
  ) {
    return this.development.grantMember(
      userId,
      developmentMemberInput(body).username,
    );
  }

  @Delete('members/:publicId')
  revokeMember(
    @CurrentUserId() userId: string,
    @Param('publicId') rawPublicId: string,
  ) {
    return this.development.revokeMember(
      userId,
      developmentId(rawPublicId, 'publicId'),
    );
  }

  @Get('requests/:id')
  detail(
    @CurrentUserId() userId: string,
    @Param('id') rawId: string,
  ) {
    return this.development.detail(userId, developmentId(rawId));
  }

  @Post('requests/:id/comments')
  comment(
    @CurrentUserId() userId: string,
    @Param('id') rawId: string,
    @Body() body: unknown,
  ) {
    const input = developmentCommentInput(body);
    return this.development.addComment(
      userId,
      developmentId(rawId),
      input.body,
      input.expectedVersion,
    );
  }

  @Post('requests/:id/decision')
  decision(
    @CurrentUserId() userId: string,
    @Param('id') rawId: string,
    @Body() body: unknown,
  ) {
    const input = developmentDecisionInput(body);
    return this.development.decide(
      userId,
      developmentId(rawId),
      input.status,
      input.note,
      input.expectedVersion,
    );
  }

  @Post('requests/:id/attachments')
  @UseGuards(DevelopmentAttachmentAuthorGuard)
  @UseInterceptors(FileInterceptor('file', {
    limits: DEVELOPMENT_MULTIPART_LIMITS,
  }))
  attachment(
    @CurrentUserId() userId: string,
    @Param('id') rawId: string,
    @UploadedFile() file: DevelopmentUploadFile | undefined,
    @Body('expectedVersion') rawExpectedVersion: unknown,
  ) {
    if (!file) {
      throw new BadRequestException({ code: 'DEVELOPMENT_ATTACHMENT_REQUIRED' });
    }
    return this.development.addAttachment(
      userId,
      developmentId(rawId),
      developmentVersion(rawExpectedVersion),
      file,
    );
  }

  @Get('requests/:id/attachments/:attachmentId/content')
  async attachmentContent(
    @CurrentUserId() userId: string,
    @Param('id') rawId: string,
    @Param('attachmentId') rawAttachmentId: string,
    @Res({ passthrough: true }) response: HeaderResponse,
  ): Promise<StreamableFile> {
    const result = await this.development.attachmentContent(
      userId,
      developmentId(rawId),
      developmentId(rawAttachmentId, 'attachmentId'),
    );
    response.setHeader('Content-Type', 'application/octet-stream');
    response.setHeader('Content-Length', String(result.content.byteLength));
    response.setHeader('Content-Disposition', contentDisposition(result.filename));
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    return new StreamableFile(result.content);
  }
}

function contentDisposition(filename: string): string {
  let encoded = 'attachment';
  try {
    encoded = encodeURIComponent(filename)
      .replace(/['()*]/g, (character) =>
        `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
      );
  } catch {
    // Invalid unicode never becomes a header value.
  }
  return `attachment; filename="attachment"; filename*=UTF-8''${encoded}`;
}
