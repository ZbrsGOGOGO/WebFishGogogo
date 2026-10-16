import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { CommunityModule } from '../community.module';
import { DemonTowerController } from './demon-tower.controller';
import { DemonTowerSourceController } from './demon-tower-source.controller';
import { DemonTowerSourceService } from './demon-tower-source.service';

@Module({ imports: [AuthModule, CommunityModule], controllers: [DemonTowerController, DemonTowerSourceController], providers: [DemonTowerSourceService] })
export class DemonTowerModule {}
