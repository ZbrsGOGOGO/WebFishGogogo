import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUserId } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { WordFrontMapService } from './word-front-map.service';

@Controller('v1/games/word-front/maps')
@UseGuards(JwtAuthGuard)
export class WordFrontMapController {
  constructor(private readonly maps: WordFrontMapService) {}
  @Get('admin') list(@CurrentUserId() userId: string) { return this.maps.list(userId); }
  @Post('admin/:key') save(@CurrentUserId() userId: string, @Param('key') key: string, @Body() body: unknown) { return this.maps.save(userId,key,body); }
}
