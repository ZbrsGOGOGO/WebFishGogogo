import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  AuthSession,
  ChatMessage,
  ChatMessageMention,
  ChatMessageReport,
  ChatRoom,
  ChatSocketTicket,
  CommunityNotification,
  Friendship,
  PlayerProfile,
  User,
  UserBlock,
} from '../../database/entities';
import { AuthModule } from '../auth/auth.module';
import { ChatController } from './chat.controller';
import { ChatModerationService } from './chat-moderation.service';
import { ChatRealtimeService } from './chat-realtime.service';
import { ChatService } from './chat.service';
import { ChatWebSocketGateway } from './chat-websocket.gateway';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AuthSession,
      ChatMessage,
      ChatMessageMention,
      ChatMessageReport,
      ChatRoom,
      ChatSocketTicket,
      CommunityNotification,
      Friendship,
      PlayerProfile,
      User,
      UserBlock,
    ]),
    AuthModule,
  ],
  controllers: [ChatController],
  providers: [
    ChatService,
    ChatModerationService,
    ChatRealtimeService,
    ChatWebSocketGateway,
  ],
  exports: [ChatService, ChatRealtimeService, ChatWebSocketGateway],
})
export class ChatModule {}
