import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUserId } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CommunityProgressionService } from './community-progression.service';

@Controller('v1/community/progression')
export class CommunityProgressionController {
  constructor(private readonly progression: CommunityProgressionService) {}
  @Get('catalog') catalog() { return this.progression.catalog(); }
  @Get('me') @UseGuards(JwtAuthGuard) me(@CurrentUserId() userId: string) { return this.progression.me(userId); }
  @Post('refresh') @UseGuards(JwtAuthGuard) refresh(@CurrentUserId() userId: string, @Body() body: unknown) { return this.progression.refresh(userId, body); }
  @Post('title') @UseGuards(JwtAuthGuard) title(@CurrentUserId() userId: string, @Body() body: unknown) { return this.progression.equip(userId, body); }
}
