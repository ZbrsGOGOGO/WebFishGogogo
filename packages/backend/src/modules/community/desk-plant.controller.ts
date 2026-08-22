import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  UseGuards,
} from '@nestjs/common';

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
}
