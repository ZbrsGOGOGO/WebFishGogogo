import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { WordFrontRoomController } from './word-front-room.controller';
import { WordFrontRoomService } from './word-front-room.service';

@Module({ imports: [AuthModule], controllers: [WordFrontRoomController], providers: [WordFrontRoomService] })
export class WordFrontRoomModule {}
