import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUserId } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { idempotencyKey, publicId } from '../community-validation';
import { OfficeBattleService } from './office-battle.service';
import { OfficeBattleFeatureGuard, OfficeBattleVerifiedGuard } from './office-battle-gates';
import {
  battleEquipmentIds,
  battleMode,
  battleProfession,
  battleRequestId,
  battleUuid,
  positiveBattleVersion,
  strictBattleObject,
} from './office-battle-validation';

@Controller('v1/games/office-battle')
@UseGuards(OfficeBattleFeatureGuard, JwtAuthGuard, OfficeBattleVerifiedGuard)
export class OfficeBattleController {
  constructor(private readonly battles: OfficeBattleService) {}

  @Get('catalog')
  catalog() {
    return this.battles.catalog();
  }

  @Get('bootstrap')
  bootstrap(@CurrentUserId() userId: string) {
    return this.battles.bootstrap(userId);
  }

  @Get('leaderboard')
  leaderboard(
    @Query('mode') rawMode?: string,
    @Query('profession') rawProfession?: string,
    @Query('limit') rawLimit?: string,
  ) {
    const mode = rawMode ?? 'pve';
    if (mode !== 'pve' && mode !== 'pvp') throw this.battles.invalid('BATTLE_RANKING_MODE_INVALID');
    const profession = rawProfession ?? 'all';
    if (
      profession !== 'all' &&
      !['developer', 'product', 'qa', 'sales', 'hr'].includes(profession)
    ) {
      throw this.battles.invalid('BATTLE_RANKING_PROFESSION_INVALID');
    }
    const limit = rawLimit === undefined ? 50 : Number(rawLimit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw this.battles.invalid('BATTLE_RANKING_LIMIT_INVALID');
    }
    return this.battles.leaderboard(
      mode,
      profession as 'all' | 'developer' | 'product' | 'qa' | 'sales' | 'hr',
      limit,
    );
  }

  @Put('profile/class')
  chooseProfession(
    @CurrentUserId() userId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') rawKey?: string,
  ) {
    const value = strictBattleObject(body, ['profession', 'expectedVersion']);
    return this.battles.chooseProfession(
      userId,
      battleProfession(value.profession),
      positiveBattleVersion(value.expectedVersion, true),
      idempotencyKey(rawKey),
    );
  }

  @Get('equipment')
  inventory(@CurrentUserId() userId: string, @Query('cursor') cursor?: string) {
    return this.battles.inventory(userId, cursor);
  }

  @Put('loadout')
  updateLoadout(
    @CurrentUserId() userId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') rawKey?: string,
  ) {
    const value = strictBattleObject(body, ['equipmentIds', 'expectedVersion']);
    return this.battles.updateLoadout(
      userId,
      battleEquipmentIds(value.equipmentIds),
      positiveBattleVersion(value.expectedVersion)!,
      idempotencyKey(rawKey),
    );
  }

  @Get('defense-loadout')
  defense(@CurrentUserId() userId: string) {
    return this.battles.getDefense(userId);
  }

  @Put('defense-loadout')
  updateDefense(
    @CurrentUserId() userId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') rawKey?: string,
  ) {
    const value = strictBattleObject(body, [
      'equipmentIds',
      'challengeVisibility',
      'equipmentVisibility',
      'expectedVersion',
    ]);
    if (value.challengeVisibility !== 'friends' && value.challengeVisibility !== 'none') {
      throw this.battles.invalid('INVALID_CHALLENGE_VISIBILITY');
    }
    if (!['public', 'friends', 'private'].includes(String(value.equipmentVisibility))) {
      throw this.battles.invalid('INVALID_EQUIPMENT_VISIBILITY');
    }
    return this.battles.updateDefense(
      userId,
      battleEquipmentIds(value.equipmentIds),
      value.challengeVisibility,
      value.equipmentVisibility as 'public' | 'friends' | 'private',
      positiveBattleVersion(value.expectedVersion)!,
      idempotencyKey(rawKey),
    );
  }

  @Put('equipment/:equipmentId/lock')
  setLock(
    @CurrentUserId() userId: string,
    @Param('equipmentId') equipmentId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') rawKey?: string,
  ) {
    const value = strictBattleObject(body, ['locked', 'expectedInventoryVersion']);
    if (typeof value.locked !== 'boolean') throw this.battles.invalid('INVALID_LOCK_VALUE');
    return this.battles.setEquipmentLock(
      userId,
      battleUuid(equipmentId, 'equipmentId'),
      value.locked,
      positiveBattleVersion(value.expectedInventoryVersion)!,
      idempotencyKey(rawKey),
    );
  }

  @Post('equipment/salvage')
  salvage(
    @CurrentUserId() userId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') rawKey?: string,
  ) {
    const value = strictBattleObject(body, ['equipmentIds', 'expectedInventoryVersion']);
    return this.battles.salvageEquipment(
      userId,
      battleEquipmentIds(value.equipmentIds),
      positiveBattleVersion(value.expectedInventoryVersion)!,
      idempotencyKey(rawKey),
    );
  }

  @Post('equipment/:equipmentId/enhance')
  enhance(
    @CurrentUserId() userId: string,
    @Param('equipmentId') equipmentId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') rawKey?: string,
  ) {
    const value = strictBattleObject(body, ['expectedInventoryVersion']);
    return this.battles.enhanceEquipment(
      userId,
      battleUuid(equipmentId, 'equipmentId'),
      positiveBattleVersion(value.expectedInventoryVersion)!,
      idempotencyKey(rawKey),
    );
  }

  @Post('skills/:skillId/upgrade')
  upgradeSkill(
    @CurrentUserId() userId: string,
    @Param('skillId') skillId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') rawKey?: string,
  ) {
    if (!/^[a-z][a-z0-9_]{2,39}$/.test(skillId)) {
      throw this.battles.invalid('BATTLE_SKILL_ID_INVALID');
    }
    const value = strictBattleObject(body, ['expectedProfileVersion']);
    return this.battles.upgradeSkill(
      userId,
      skillId,
      positiveBattleVersion(value.expectedProfileVersion)!,
      idempotencyKey(rawKey),
    );
  }

  @Get('rewards/pending')
  pendingRewards(@CurrentUserId() userId: string) {
    return this.battles.pendingRewards(userId);
  }

  @Post('rewards/:rewardId/claim')
  claimReward(
    @CurrentUserId() userId: string,
    @Param('rewardId') rewardId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') rawKey?: string,
  ) {
    const value = strictBattleObject(body, ['expectedInventoryVersion']);
    return this.battles.resolvePendingReward(
      userId,
      battleUuid(rewardId, 'rewardId'),
      'claim',
      positiveBattleVersion(value.expectedInventoryVersion)!,
      idempotencyKey(rawKey),
    );
  }

  @Post('rewards/:rewardId/salvage')
  salvageReward(
    @CurrentUserId() userId: string,
    @Param('rewardId') rewardId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') rawKey?: string,
  ) {
    const value = strictBattleObject(body, ['expectedInventoryVersion']);
    return this.battles.resolvePendingReward(
      userId,
      battleUuid(rewardId, 'rewardId'),
      'salvage',
      positiveBattleVersion(value.expectedInventoryVersion)!,
      idempotencyKey(rawKey),
    );
  }

  @Post('battles')
  createBattle(
    @CurrentUserId() userId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') rawKey?: string,
  ) {
    const value = strictBattleObject(body, [
      'battleRequestId',
      'opponent',
      'mode',
      'loadoutVersion',
    ]);
    const requestId = battleRequestId(value.battleRequestId);
    const opponent = strictBattleObject(value.opponent, ['kind', 'offerId', 'publicId']);
    if (opponent.kind === 'npc') {
      if (Object.prototype.hasOwnProperty.call(opponent, 'publicId')) {
        throw this.battles.invalid('INVALID_BATTLE_OPPONENT');
      }
      return this.battles.createBattle(userId, {
        battleRequestId: requestId,
        opponent: { kind: 'npc', offerId: battleUuid(opponent.offerId, 'offerId') },
        mode: battleMode(value.mode),
        loadoutVersion: positiveBattleVersion(value.loadoutVersion)!,
      }, idempotencyKey(rawKey));
    }
    if (opponent.kind === 'friend') {
      if (Object.prototype.hasOwnProperty.call(opponent, 'offerId')) {
        throw this.battles.invalid('INVALID_BATTLE_OPPONENT');
      }
      return this.battles.createBattle(userId, {
        battleRequestId: requestId,
        opponent: { kind: 'friend', publicId: publicId(opponent.publicId) },
        mode: battleMode(value.mode),
        loadoutVersion: positiveBattleVersion(value.loadoutVersion)!,
      }, idempotencyKey(rawKey));
    }
    throw this.battles.invalid('INVALID_BATTLE_OPPONENT');
  }

  @Post('friends/:publicId/challenges')
  createFriendBattle(
    @CurrentUserId() userId: string,
    @Param('publicId') targetPublicId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') rawKey?: string,
  ) {
    const value = strictBattleObject(body, ['battleRequestId', 'mode', 'loadoutVersion']);
    const requestId = battleRequestId(value.battleRequestId);
    return this.battles.createBattle(userId, {
      battleRequestId: requestId,
      opponent: { kind: 'friend', publicId: publicId(targetPublicId) },
      mode: battleMode(value.mode),
      loadoutVersion: positiveBattleVersion(value.loadoutVersion)!,
    }, idempotencyKey(rawKey));
  }

  @Get('battles/by-request/:battleRequestId')
  byRequest(
    @CurrentUserId() userId: string,
    @Param('battleRequestId') rawRequestId: string,
  ) {
    return this.battles.getBattleByRequest(userId, battleRequestId(rawRequestId));
  }

  @Get('battles')
  history(@CurrentUserId() userId: string, @Query('cursor') cursor?: string) {
    return this.battles.history(userId, cursor);
  }

  @Get('battles/:battleId')
  battle(@CurrentUserId() userId: string, @Param('battleId') battleId: string) {
    return this.battles.getBattle(userId, battleUuid(battleId, 'battleId'));
  }

  @Get('public/users/:publicId/record')
  publicRecord(
    @CurrentUserId() userId: string,
    @Param('publicId') targetPublicId: string,
  ) {
    return this.battles.publicRecord(userId, publicId(targetPublicId));
  }
}
