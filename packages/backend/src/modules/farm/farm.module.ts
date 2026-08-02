import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CropDefinition } from '../../database/entities/crop-definition.entity';
import { FarmPlanting } from '../../database/entities/farm-planting.entity';
import { FarmPlot } from '../../database/entities/farm-plot.entity';
import { UserFarm } from '../../database/entities/user-farm.entity';
import { OutboxModule } from '../outbox';
import { PlatformModule } from '../platform';
import { FARM_CLOCK, systemFarmClock } from './farm.constants';
import { FarmController } from './farm.controller';
import { FarmService } from './farm.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserFarm,
      FarmPlot,
      CropDefinition,
      FarmPlanting,
    ]),
    PlatformModule,
    OutboxModule,
  ],
  controllers: [FarmController],
  providers: [
    FarmService,
    {
      provide: FARM_CLOCK,
      useValue: systemFarmClock,
    },
  ],
  exports: [FarmService],
})
export class FarmModule {}
