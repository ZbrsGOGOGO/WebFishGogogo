import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ArenaBattle } from '../../../database/entities/arena-battle.entity';
import { ArenaOpponentOffer } from '../../../database/entities/arena-opponent-offer.entity';
import { ArenaProfile } from '../../../database/entities/arena-profile.entity';
import { OutboxModule } from '../../outbox';
import { PlatformModule } from '../../platform';
import {
  ARENA_CLOCK,
  systemArenaClock,
} from './arena.constants';
import { ArenaController } from './arena.controller';
import { ArenaService } from './arena.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ArenaProfile,
      ArenaOpponentOffer,
      ArenaBattle,
    ]),
    PlatformModule,
    OutboxModule,
  ],
  controllers: [ArenaController],
  providers: [
    ArenaService,
    {
      provide: ARENA_CLOCK,
      useValue: systemArenaClock,
    },
  ],
  exports: [ArenaService],
})
export class ArenaModule {}
