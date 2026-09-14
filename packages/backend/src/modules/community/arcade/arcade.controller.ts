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
    const gameKey = this.gameKey(String(value.gameKey ?? ''));
    const requested = value.rulesVersion;
    const v2 = gameKey === 'word_story_v2' || gameKey === 'word_endless_v2';
    const v3 = gameKey === 'word_story_v3' || gameKey === 'word_endless_v3';
    const v1 = gameKey === 'word_story' || gameKey === 'word_endless';
    if ((requested !== undefined && !v1 && !v2 && !v3) ||
      (v1 && requested !== undefined && requested !== 1) || (v2 && requested !== 2) || (v3 && requested !== 3)) {
      throw new BadRequestException({ code: 'ARCADE_RULES_VERSION_INVALID' });
    }
    const chapter = v2 || v3 ? value.chapter : undefined;
    if ((v2 || v3) && (!Number.isSafeInteger(chapter) || Number(chapter) < 1 || Number(chapter) > (gameKey === 'word_endless_v2' || gameKey === 'word_endless_v3' ? 1 : 6))) {
      throw new BadRequestException({ code: 'ARCADE_CHAPTER_INVALID' });
    }
    return this.arcade.startRun(userId, gameKey, v3 ? 3 : v2 ? 2 : 1, v2 || v3 ? Number(chapter) : undefined);
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
