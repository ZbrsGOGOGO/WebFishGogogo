import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';

import type { DeskPlantSkillId, DeskPlantToolId } from '../../database/entities/desk-plant.entity';
import { CurrentUserId } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  idempotencyKey,
  publicId,
  requiredObject,
} from './community-validation';
import { DeskPlantService } from './desk-plant.service';

@Controller('v1/farm')
@UseGuards(JwtAuthGuard)
export class DeskPlantController {
  constructor(private readonly plants: DeskPlantService) {}

  @Get()
  overview(@CurrentUserId() userId: string) {
    return this.plants.overview(userId);
  }

  @Post('care')
  care(
    @CurrentUserId() userId: string,
    @Headers('idempotency-key') rawKey?: string,
  ) {
    return this.plants.care(userId, idempotencyKey(rawKey));
  }

  @Post('harvest-and-care')
  harvestAndCare(
    @CurrentUserId() userId: string,
    @Headers('idempotency-key') rawKey?: string,
  ) {
    return this.plants.harvestAndCare(userId, idempotencyKey(rawKey));
  }

  @Put('crop')
  selectCrop(
    @CurrentUserId() userId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') rawKey?: string,
  ) {
    const input = requiredObject(body);
    if (typeof input.cropKey !== 'string' || !input.cropKey.trim()) {
      throw new BadRequestException({ code: 'FARM_CROP_KEY_INVALID' });
    }
    return this.plants.selectCrop(
      userId,
      input.cropKey,
      this.positiveVersion(input.expectedVersion),
      idempotencyKey(rawKey),
    );
  }

  @Post('tools/:toolId/upgrade')
  upgradeTool(
    @CurrentUserId() userId: string,
    @Param('toolId') rawToolId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') rawKey?: string,
  ) {
    const toolIds: DeskPlantToolId[] = ['watering_can', 'planter_box', 'harvest_basket'];
    if (!toolIds.includes(rawToolId as DeskPlantToolId)) {
      throw new BadRequestException({ code: 'FARM_TOOL_NOT_FOUND' });
    }
    const input = requiredObject(body);
    return this.plants.upgradeTool(
      userId,
      rawToolId as DeskPlantToolId,
      this.positiveVersion(input.expectedVersion),
      idempotencyKey(rawKey),
    );
  }

  @Post('skills/:skillId/upgrade')
  upgradeSkill(
    @CurrentUserId() userId: string,
    @Param('skillId') rawSkillId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') rawKey?: string,
  ) {
    const skillIds: DeskPlantSkillId[] = ['quick_care', 'green_thumb', 'abundant_harvest'];
    if (!skillIds.includes(rawSkillId as DeskPlantSkillId)) {
      throw new BadRequestException({ code: 'FARM_SKILL_NOT_FOUND' });
    }
    const input = requiredObject(body);
    return this.plants.upgradeSkill(
      userId,
      rawSkillId as DeskPlantSkillId,
      this.positiveVersion(input.expectedVersion),
      idempotencyKey(rawKey),
    );
  }

  @Post('encouragements')
  encourage(
    @CurrentUserId() userId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') rawKey?: string,
  ) {
    const input = requiredObject(body);
    return this.plants.encourage(
      userId,
      publicId(input.publicId),
      idempotencyKey(rawKey),
    );
  }

  private positiveVersion(value: unknown): number {
    if (!Number.isSafeInteger(value) || Number(value) < 1) {
      throw new BadRequestException({ code: 'FARM_VERSION_INVALID' });
    }
    return Number(value);
  }
}
