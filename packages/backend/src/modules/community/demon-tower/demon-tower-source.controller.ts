import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';

import { CurrentUserId } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { DemonTowerSourceService } from './demon-tower-source.service';

@Controller('v1/games/demon-tower/source')
@UseGuards(JwtAuthGuard)
export class DemonTowerSourceController {
  constructor(private readonly source: DemonTowerSourceService) {}

  @Get('progress') progress(@CurrentUserId() userId: string) { return this.source.progress(userId); }
  @Put('progress') save(@CurrentUserId() userId: string, @Body() body: unknown) { return this.source.save(userId, body); }
  @Get('world') world(@CurrentUserId() userId: string) { return this.source.world(userId); }
  @Post('world/damage') damage(@CurrentUserId() userId: string, @Body() body: unknown) { return this.source.damage(userId, body); }
  @Post('world/channel') channel(@CurrentUserId() userId: string, @Body() body: unknown) { return this.source.channel(userId, body); }
  @Post('world/clue') clue(@CurrentUserId() userId: string, @Body() body: unknown) { return this.source.clue(userId, body); }
  @Get('contribution') contribution(@CurrentUserId() userId: string) { return this.source.contribution(userId); }
  @Get('friends') friends(@CurrentUserId() userId: string) { return this.source.friends(userId); }
  @Get('friends/:publicId/battle-profile') battleProfile(@CurrentUserId() userId: string, @Param('publicId') publicId: string) { return this.source.battleProfile(userId, publicId); }
  @Get('ranking') ranking(@CurrentUserId() userId: string, @Query('limit') limit?: string) { return this.source.ranking(userId, limit); }
  @Get('settings') settings() { return this.source.settings(); }
  @Get('stories') stories() { return this.source.stories(); }
}
