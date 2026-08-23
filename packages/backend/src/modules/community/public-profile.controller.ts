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
    if (
      Object.keys(query).some((key) => key !== 'publicId') ||
      query.publicId === undefined
    ) {
      throw new BadRequestException({ code: 'PUBLIC_ID_ONLY_SEARCH' });
    }
    try {
      return {
        items: [await this.profiles.get(publicId(query.publicId), viewerId)],
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
