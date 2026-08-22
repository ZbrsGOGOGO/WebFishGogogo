import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  CurrentUserId,
  OptionalCurrentUserId,
} from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { ContentService } from './content.service';
import { CommunityContentFeatureGuard } from './content-gates';
import {
  expectedVersion,
  parseCommentBody,
  parseReportInput,
  parseSavePostInput,
  strictObject,
} from './content-validation';
import { idempotencyKey, publicId } from './community-validation';

@Controller('v1/community')
@UseGuards(CommunityContentFeatureGuard)
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Get('posts')
  @UseGuards(OptionalJwtAuthGuard)
  listPosts(
    @OptionalCurrentUserId() viewerId: string | null,
    @Query() query: Record<string, unknown>,
  ) {
    return this.content.listPosts(viewerId, this.postFilters(query));
  }

  @Get('search')
  @UseGuards(OptionalJwtAuthGuard)
  search(
    @OptionalCurrentUserId() viewerId: string | null,
    @Query() query: Record<string, unknown>,
  ) {
    return this.content.listPosts(viewerId, this.postFilters(query));
  }

  @Get('posts/:id')
  @UseGuards(OptionalJwtAuthGuard)
  getPost(
    @Param('id') id: string,
    @OptionalCurrentUserId() viewerId: string | null,
  ) {
    return this.content.getPost(publicId(id, 'postId'), viewerId);
  }

  @Post('posts')
  @UseGuards(JwtAuthGuard)
  createPost(
    @CurrentUserId() userId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') rawKey?: string,
  ) {
    return this.content.createPost(
      userId,
      parseSavePostInput(body),
      idempotencyKey(rawKey),
    );
  }

  @Patch('posts/:id')
  @UseGuards(JwtAuthGuard)
  updatePost(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('if-match') ifMatch?: string,
    @Headers('idempotency-key') rawKey?: string,
  ) {
    const raw = strictObject(body, [
      'type',
      'channel',
      'title',
      'body',
      'tags',
      'bodyFormat',
      'expectedVersion',
    ]);
    return this.content.updatePost(
      userId,
      publicId(id, 'postId'),
      parseSavePostInput(raw),
      expectedVersion(ifMatch, raw.expectedVersion),
      idempotencyKey(rawKey),
    );
  }

  @Delete('posts/:id')
  @UseGuards(JwtAuthGuard)
  deletePost(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Headers('if-match') ifMatch?: string,
  ) {
    return this.content.deletePost(
      userId,
      publicId(id, 'postId'),
      expectedVersion(ifMatch),
    );
  }

  @Post('posts/:id/restore')
  @UseGuards(JwtAuthGuard)
  restorePost(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('if-match') ifMatch?: string,
  ) {
    const raw = strictObject(body, ['expectedVersion']);
    return this.content.restorePost(
      userId,
      publicId(id, 'postId'),
      expectedVersion(ifMatch, raw.expectedVersion),
    );
  }

  @Post('posts/:id/submit-review')
  @UseGuards(JwtAuthGuard)
  submitPostReview(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('if-match') ifMatch?: string,
  ) {
    const raw = strictObject(body, ['expectedVersion']);
    return this.content.submitPostReview(
      userId,
      publicId(id, 'postId'),
      expectedVersion(ifMatch, raw.expectedVersion),
    );
  }

  @Post('posts/:id/withdraw-review')
  @UseGuards(JwtAuthGuard)
  withdrawPostReview(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('if-match') ifMatch?: string,
  ) {
    const raw = strictObject(body, ['expectedVersion']);
    return this.content.withdrawPostReview(
      userId,
      publicId(id, 'postId'),
      expectedVersion(ifMatch, raw.expectedVersion),
    );
  }

  @Get('posts/:id/revisions')
  @UseGuards(OptionalJwtAuthGuard)
  listPostRevisions(
    @Param('id') id: string,
    @OptionalCurrentUserId() viewerId: string | null,
  ) {
    return this.content.listPostRevisions(publicId(id, 'postId'), viewerId);
  }

  @Get('posts/:id/comments')
  @UseGuards(OptionalJwtAuthGuard)
  listComments(
    @Param('id') id: string,
    @OptionalCurrentUserId() viewerId: string | null,
    @Query('cursor') cursor?: string,
  ) {
    return this.content.listComments(publicId(id, 'postId'), viewerId, cursor);
  }

  @Post('posts/:id/comments')
  @UseGuards(JwtAuthGuard)
  createComment(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') rawKey?: string,
  ) {
    const raw = strictObject(body, ['body', 'parentCommentId']);
    const parentCommentId =
      raw.parentCommentId === null || raw.parentCommentId === undefined
        ? null
        : publicId(raw.parentCommentId, 'parentCommentId');
    return this.content.createComment(
      userId,
      publicId(id, 'postId'),
      parseCommentBody(raw),
      parentCommentId,
      idempotencyKey(rawKey),
    );
  }

  @Patch('comments/:id')
  @UseGuards(JwtAuthGuard)
  updateComment(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('if-match') ifMatch?: string,
    @Headers('idempotency-key') rawKey?: string,
  ) {
    const raw = strictObject(body, ['body', 'expectedVersion']);
    return this.content.updateComment(
      userId,
      publicId(id, 'commentId'),
      parseCommentBody(raw),
      expectedVersion(ifMatch, raw.expectedVersion),
      idempotencyKey(rawKey),
    );
  }

  @Delete('comments/:id')
  @UseGuards(JwtAuthGuard)
  deleteComment(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Headers('if-match') ifMatch?: string,
  ) {
    return this.content.deleteComment(
      userId,
      publicId(id, 'commentId'),
      expectedVersion(ifMatch),
    );
  }

  @Post('comments/:id/restore')
  @UseGuards(JwtAuthGuard)
  restoreComment(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('if-match') ifMatch?: string,
  ) {
    const raw = strictObject(body, ['expectedVersion']);
    return this.content.restoreComment(
      userId,
      publicId(id, 'commentId'),
      expectedVersion(ifMatch, raw.expectedVersion),
    );
  }

  @Post('comments/:id/submit-review')
  @UseGuards(JwtAuthGuard)
  submitCommentReview(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('if-match') ifMatch?: string,
  ) {
    const raw = strictObject(body, ['expectedVersion']);
    return this.content.submitCommentReview(
      userId,
      publicId(id, 'commentId'),
      expectedVersion(ifMatch, raw.expectedVersion),
    );
  }

  @Post('comments/:id/withdraw-review')
  @UseGuards(JwtAuthGuard)
  withdrawCommentReview(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('if-match') ifMatch?: string,
  ) {
    const raw = strictObject(body, ['expectedVersion']);
    return this.content.withdrawCommentReview(
      userId,
      publicId(id, 'commentId'),
      expectedVersion(ifMatch, raw.expectedVersion),
    );
  }

  @Get('comments/:id/revisions')
  @UseGuards(OptionalJwtAuthGuard)
  listCommentRevisions(
    @Param('id') id: string,
    @OptionalCurrentUserId() viewerId: string | null,
  ) {
    return this.content.listCommentRevisions(publicId(id, 'commentId'), viewerId);
  }

  @Put('posts/:id/bookmark')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  setBookmark(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.content.setBookmark(userId, publicId(id, 'postId'), true);
  }

  @Delete('posts/:id/bookmark')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  clearBookmark(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.content.setBookmark(userId, publicId(id, 'postId'), false);
  }

  @Put('posts/:id/follow')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  setFollow(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.content.setFollow(userId, publicId(id, 'postId'), true);
  }

  @Delete('posts/:id/follow')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  clearFollow(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.content.setFollow(userId, publicId(id, 'postId'), false);
  }

  @Put('posts/:id/useful')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  setUseful(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.content.setUseful(userId, publicId(id, 'postId'), true);
  }

  @Delete('posts/:id/useful')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  clearUseful(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.content.setUseful(userId, publicId(id, 'postId'), false);
  }

  @Put('posts/:id/accepted-comment')
  @UseGuards(JwtAuthGuard)
  acceptAnswer(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('if-match') ifMatch?: string,
  ) {
    const raw = strictObject(body, ['commentId', 'expectedVersion']);
    return this.content.acceptAnswer(
      userId,
      publicId(id, 'postId'),
      publicId(raw.commentId, 'commentId'),
      expectedVersion(ifMatch, raw.expectedVersion),
    );
  }

  @Delete('posts/:id/accepted-comment')
  @UseGuards(JwtAuthGuard)
  clearAcceptedAnswer(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Headers('if-match') ifMatch?: string,
  ) {
    return this.content.acceptAnswer(
      userId,
      publicId(id, 'postId'),
      null,
      expectedVersion(ifMatch),
    );
  }

  @Post('content/:type/:id/report')
  @UseGuards(JwtAuthGuard)
  report(
    @CurrentUserId() userId: string,
    @Param('type') type: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') rawKey?: string,
  ) {
    if (type !== 'post' && type !== 'comment') {
      throw new BadRequestException({ code: 'INVALID_CONTENT_TYPE' });
    }
    const input = parseReportInput(body);
    return this.content.report(
      userId,
      type,
      publicId(id, 'contentId'),
      input.reason,
      input.details,
      idempotencyKey(rawKey),
    );
  }

  private postFilters(query: Record<string, unknown>) {
    const allowed = ['channel', 'type', 'tag', 'q', 'sort', 'cursor'];
    if (Object.keys(query).some((key) => !allowed.includes(key))) {
      throw new BadRequestException({ code: 'INVALID_CONTENT_FILTER' });
    }
    const string = (value: unknown): string | undefined =>
      typeof value === 'string' ? value : value === undefined ? undefined : String(value);
    return {
      channel: string(query.channel),
      type: string(query.type),
      tag: string(query.tag),
      q: query.q,
      sort: string(query.sort),
      cursor: string(query.cursor),
    };
  }
}
