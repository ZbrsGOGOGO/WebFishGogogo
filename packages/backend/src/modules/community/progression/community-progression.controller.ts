import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUserId } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CommunityProgressionService } from './community-progression.service';
import { FishGrowthService } from './fish-growth.service';
import { SupportLedgerService } from './support-ledger.service';

@Controller('v1/community/progression')
export class CommunityProgressionController {
  constructor(private readonly progression: CommunityProgressionService, private readonly fish: FishGrowthService, private readonly supports: SupportLedgerService) {}
  @Get('catalog') catalog() { return this.progression.catalog(); }
  @Get('me') @UseGuards(JwtAuthGuard) me(@CurrentUserId() userId: string) { return this.progression.me(userId); }
  @Post('refresh') @UseGuards(JwtAuthGuard) refresh(@CurrentUserId() userId: string, @Body() body: unknown) { return this.progression.refresh(userId, body); }
  @Post('title') @UseGuards(JwtAuthGuard) title(@CurrentUserId() userId: string, @Body() body: unknown) { return this.progression.equip(userId, body); }
  @Post('heartbeat') @UseGuards(JwtAuthGuard) heartbeat(@CurrentUserId() userId: string, @Body() body: unknown) { return this.fish.heartbeat(userId, body); }
  @Get('support/admin') @UseGuards(JwtAuthGuard) supportAdmin(@CurrentUserId() userId: string, @Query('offset') offset?: string) { return this.supports.adminView(userId, offset); }
  @Post('support/admin') @UseGuards(JwtAuthGuard) grant(@CurrentUserId() userId: string, @Body() body: unknown) { return this.supports.grant(userId, body); }
  @Post('support/admin/:id/revoke') @UseGuards(JwtAuthGuard) revoke(@CurrentUserId() userId: string, @Param('id') id: string, @Body() body: unknown) { return this.supports.revoke(userId, id, body); }
}
