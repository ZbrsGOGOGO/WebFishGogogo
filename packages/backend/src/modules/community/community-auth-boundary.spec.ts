import 'reflect-metadata';

import { GUARDS_METADATA } from '@nestjs/common/constants';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChatController } from '../chat/chat.controller';
import { ContentController } from './content.controller';
import { DeskPlantController } from './desk-plant.controller';
import { GuildController } from './guild.controller';
import { NewsPublicController } from './news/news.controller';
import { OfficeBattleController } from './office-battle/office-battle.controller';
import { PublicProfileController } from './public-profile.controller';
import { RelationshipController } from './relationship.controller';

function classGuards(controller: object): unknown[] {
  return Reflect.getMetadata(GUARDS_METADATA, controller) ?? [];
}

describe('community authenticated access boundary', () => {
  it.each([
    ContentController,
    NewsPublicController,
    PublicProfileController,
    ChatController,
    DeskPlantController,
    GuildController,
    OfficeBattleController,
    RelationshipController,
  ])('requires JwtAuthGuard for %p', (controller) => {
    expect(classGuards(controller)).toContain(JwtAuthGuard);
  });
});
