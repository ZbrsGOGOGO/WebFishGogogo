import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CurrentUserId } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FarmOverview, FarmService } from './farm.service';

interface PlantCropBody {
  cropSlug?: unknown;
}

@UseGuards(JwtAuthGuard)
@Controller('v1/farm')
export class FarmController {
  constructor(private readonly farmService: FarmService) {}

  @Get()
  getFarm(@CurrentUserId() userId: string): Promise<FarmOverview> {
    return this.farmService.getFarm(userId);
  }

  @Post('plots/:plotId/plant')
  plant(
    @CurrentUserId() userId: string,
    @Param('plotId') plotId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: PlantCropBody,
  ): Promise<FarmOverview> {
    return this.farmService.plant(
      userId,
      plotId,
      typeof body?.cropSlug === 'string' ? body.cropSlug : '',
      idempotencyKey,
    );
  }

  @Post('plots/:plotId/harvest')
  harvest(
    @CurrentUserId() userId: string,
    @Param('plotId') plotId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): Promise<FarmOverview> {
    return this.farmService.harvest(userId, plotId, idempotencyKey);
  }
}
