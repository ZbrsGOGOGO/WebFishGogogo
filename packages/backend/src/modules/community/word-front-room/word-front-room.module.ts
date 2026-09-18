import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { WordFrontRoomController } from './word-front-room.controller';
import { WordFrontRoomService } from './word-front-room.service';
import { WordFrontMapController } from './word-front-map.controller';
import { WordFrontMapService } from './word-front-map.service';

@Module({ imports: [AuthModule], controllers: [WordFrontRoomController, WordFrontMapController], providers: [WordFrontRoomService, WordFrontMapService] })
export class WordFrontRoomModule {}
