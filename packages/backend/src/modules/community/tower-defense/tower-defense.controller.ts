import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUserId } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { TowerDefenseService } from './tower-defense.service';

@Controller('v1/games/workstation')
@UseGuards(JwtAuthGuard)
export class TowerDefenseController {
  constructor(private readonly tower: TowerDefenseService) {}
  @Get('overview') overview(@CurrentUserId() userId: string) { return this.tower.overview(userId); }
  @Post('start') start(@CurrentUserId() userId: string, @Body() body: unknown) { return this.tower.start(userId, body); }
  @Post('sync') sync(@CurrentUserId() userId: string, @Body() body: unknown) { return this.tower.sync(userId, body); }
  @Post('command') command(@CurrentUserId() userId: string, @Body() body: unknown) { return this.tower.command(userId, body); }
  @Post('talents') talents(@CurrentUserId() userId: string, @Body() body: unknown) { return this.tower.talents(userId, body); }
  @Post('formation') formation(@CurrentUserId() userId: string, @Body() body: unknown) { return this.tower.formation(userId, body); }
  @Get('leaderboard') leaderboard(@Query('mode') mode?: string, @Query('date') date?: string) { return this.tower.leaderboard(mode, date); }
}
