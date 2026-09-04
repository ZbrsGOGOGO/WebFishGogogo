import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUserId } from '../auth/current-user.decorator';
import { normalizeUsername } from '../auth/dto/auth-validation';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { publicId } from './community-validation';
import { PublicProfileService } from './public-profile.service';

@Controller('v1/users')
@UseGuards(JwtAuthGuard)
export class PublicProfileController {
  constructor(private readonly profiles: PublicProfileService) {}

  @Get('search')
  async exactSearch(
    @CurrentUserId() viewerId: string,
    @Query() query: Record<string, unknown>,
  ) {
    const keys = Object.keys(query);
    if (
      keys.length !== 1 ||
      (keys[0] !== 'publicId' && keys[0] !== 'username')
    ) throw new BadRequestException({ code: 'EXACT_ACCOUNT_SEARCH_ONLY' });
    try {
      return {
        items: [query.username === undefined
          ? await this.profiles.get(publicId(query.publicId), viewerId)
          : await this.profiles.getByUsername(
              normalizeUsername(
                typeof query.username === 'string'
                  ? query.username.replace(/^@/, '')
                  : query.username,
              ),
              viewerId,
            )],
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      if (error instanceof NotFoundException) return { items: [] };
      throw error;
    }
  }

  @Get(':publicId')
  get(
    @Param('publicId') value: string,
    @CurrentUserId() viewerId: string,
  ) {
    return this.profiles.get(publicId(value), viewerId);
  }
}
