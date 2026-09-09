import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { PlatformAssetsModule } from '../../platform/platform-assets.module';
import { OfficeHubModule } from '../office-hub/office-hub.module';
import { TowerDefenseController } from './tower-defense.controller';
import { TowerDefenseService } from './tower-defense.service';

@Module({ imports: [AuthModule, PlatformAssetsModule, OfficeHubModule], controllers: [TowerDefenseController], providers: [TowerDefenseService], exports: [TowerDefenseService] })
export class TowerDefenseModule {}
