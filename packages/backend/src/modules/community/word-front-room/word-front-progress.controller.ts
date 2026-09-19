import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUserId } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { WordFrontProgressService } from './word-front-progress.service';

@Controller('v1/games/word-front')
@UseGuards(JwtAuthGuard)
export class WordFrontProgressController {
  constructor(private readonly progress: WordFrontProgressService) {}
  @Get('progress') get(@CurrentUserId() userId: string) { return this.progress.get(userId); }
  @Post('progress/shop') buy(@CurrentUserId() userId: string, @Body() body: unknown) { return this.progress.buy(userId, body); }
  @Get('maps/admin/balance') balance(@CurrentUserId() userId: string) { return this.progress.balance(userId); }
}
