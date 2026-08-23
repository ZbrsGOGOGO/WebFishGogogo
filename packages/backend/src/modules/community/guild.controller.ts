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
  Post,
  UseGuards,
} from '@nestjs/common';

import type { GuildBuildingKey } from '../../database/entities/guild.entity';
import { CurrentUserId } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { idempotencyKey, publicId, requiredObject } from './community-validation';
import { GuildService } from './guild.service';

@Controller('v1/guilds')
@UseGuards(JwtAuthGuard)
export class GuildController {
  constructor(private readonly guilds: GuildService) {}

  @Get('me')
  overview(@CurrentUserId() userId: string) {
    return this.guilds.overview(userId);
  }

  @Post()
  create(
    @CurrentUserId() userId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') rawKey?: string,
  ) {
    const input = requiredObject(body);
    if (typeof input.name !== 'string') {
      throw new BadRequestException({ code: 'GUILD_NAME_INVALID' });
    }
    return this.guilds.create(userId, input.name, idempotencyKey(rawKey));
  }

  @Post(':guildId/join')
  join(
    @CurrentUserId() userId: string,
    @Param('guildId') rawGuildId: string,
    @Headers('idempotency-key') rawKey?: string,
  ) {
    return this.guilds.join(
      userId,
      publicId(rawGuildId, 'guildId'),
      idempotencyKey(rawKey),
    );
  }

  @Post('me/donations')
  donate(
    @CurrentUserId() userId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') rawKey?: string,
  ) {
    const input = requiredObject(body);
    return this.guilds.donate(userId, Number(input.amount), idempotencyKey(rawKey));
  }

  @Post('me/buildings/:buildingKey/upgrade')
  upgradeBuilding(
    @CurrentUserId() userId: string,
    @Param('buildingKey') buildingKey: GuildBuildingKey,
    @Headers('idempotency-key') rawKey?: string,
  ) {
    return this.guilds.upgradeBuilding(userId, buildingKey, idempotencyKey(rawKey));
  }

  @Post('me/boss/attacks')
  attackBoss(
    @CurrentUserId() userId: string,
    @Headers('idempotency-key') rawKey?: string,
  ) {
    return this.guilds.attackBoss(userId, idempotencyKey(rawKey));
  }

  @Delete('me/membership')
  @HttpCode(HttpStatus.NO_CONTENT)
  leave(@CurrentUserId() userId: string): Promise<void> {
    return this.guilds.leave(userId);
  }
}
