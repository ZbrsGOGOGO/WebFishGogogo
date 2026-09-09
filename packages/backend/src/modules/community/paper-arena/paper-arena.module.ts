import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { PaperArenaController } from './paper-arena.controller';
import { PaperArenaGateway } from './paper-arena.gateway';
import { PaperArenaService } from './paper-arena.service';

@Module({ imports: [AuthModule], controllers: [PaperArenaController], providers: [PaperArenaService, PaperArenaGateway], exports: [PaperArenaGateway] })
export class PaperArenaModule {}
