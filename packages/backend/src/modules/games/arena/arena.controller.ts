import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CurrentUserId } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import {
  ArenaBattleResponse,
  ArenaBootstrapResponse,
  ArenaService,
} from './arena.service';

interface StartArenaBattleBody {
  offerId?: unknown;
}

@UseGuards(JwtAuthGuard)
@Controller('v1/games/arena')
export class ArenaController {
  constructor(private readonly arenaService: ArenaService) {}

  @Get('bootstrap')
  bootstrap(
    @CurrentUserId() userId: string,
  ): Promise<ArenaBootstrapResponse> {
    return this.arenaService.getBootstrap(userId);
  }

  @Post('battles')
  startBattle(
    @CurrentUserId() userId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: StartArenaBattleBody,
  ): Promise<ArenaBattleResponse> {
    return this.arenaService.startBattle(
      userId,
      typeof body?.offerId === 'string' ? body.offerId : '',
      idempotencyKey,
    );
  }
}
