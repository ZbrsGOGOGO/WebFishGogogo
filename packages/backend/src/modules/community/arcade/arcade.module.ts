import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ArcadeBestScore, ArcadeGameRun } from '../../../database/entities';
import { AuthModule } from '../../auth/auth.module';
import { ArcadeController } from './arcade.controller';
import { ArcadeService } from './arcade.service';

@Module({
  imports: [TypeOrmModule.forFeature([ArcadeBestScore, ArcadeGameRun]), AuthModule],
  controllers: [ArcadeController],
  providers: [ArcadeService],
})
export class ArcadeModule {}
