import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUserId } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import {
  ARCADE_GAME_KEYS,
  type ArcadeGameKey,
} from '../../../database/entities/arcade-score.entity';
import { ArcadeService } from './arcade.service';

@Controller('v1/games/arcade')
export class ArcadeController {
  constructor(private readonly arcade: ArcadeService) {}

  @Get('leaderboards/:gameKey')
  leaderboard(@Param('gameKey') rawGameKey: string, @Query('limit') rawLimit?: string) {
    const gameKey = this.gameKey(rawGameKey);
    const limit = rawLimit === undefined ? 20 : Number(rawLimit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException({ code: 'ARCADE_LIMIT_INVALID' });
    }
    return this.arcade.leaderboard(gameKey, limit);
  }

  @Post('runs')
  @UseGuards(JwtAuthGuard)
  start(@CurrentUserId() userId: string, @Body() body: unknown) {
    const value = this.object(body);
    return this.arcade.startRun(userId, this.gameKey(String(value.gameKey ?? '')));
  }

  @Post('runs/:runId/finish')
  @UseGuards(JwtAuthGuard)
  finish(
    @CurrentUserId() userId: string,
    @Param('runId') runId: string,
    @Body() body: unknown,
  ) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runId)) {
      throw new BadRequestException({ code: 'ARCADE_RUN_ID_INVALID' });
    }
    const value = this.object(body);
    return this.arcade.finishRun(userId, runId, {
      score: Number(value.score),
      metrics: value.metrics,
    });
  }

  private gameKey(value: string): ArcadeGameKey {
    if (!ARCADE_GAME_KEYS.includes(value as ArcadeGameKey)) {
      throw new BadRequestException({ code: 'ARCADE_GAME_INVALID' });
    }
    return value as ArcadeGameKey;
  }

  private object(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException({ code: 'ARCADE_REQUEST_INVALID' });
    }
    return value as Record<string, unknown>;
  }
}
