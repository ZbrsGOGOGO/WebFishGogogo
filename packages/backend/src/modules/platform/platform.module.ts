import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Checkin } from '../../database/entities/checkin.entity';
import { OutboxModule } from '../outbox';
import { CheckinsController } from './checkins.controller';
import { PlatformAssetsModule } from './platform-assets.module';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';

/**
 * 跨阅读、工具、农场和小游戏复用的用户资产底座。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Checkin]),
    PlatformAssetsModule,
    OutboxModule,
  ],
  controllers: [PlatformController, CheckinsController],
  providers: [
    PlatformService,
  ],
  exports: [PlatformService, PlatformAssetsModule],
})
export class PlatformModule {}
