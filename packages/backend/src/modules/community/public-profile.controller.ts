import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';

import { OptionalCurrentUserId } from '../auth/current-user.decorator';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { publicId } from './community-validation';
import { PublicProfileService } from './public-profile.service';

@Controller('v1/users')
@UseGuards(OptionalJwtAuthGuard)
export class PublicProfileController {
  constructor(private readonly profiles: PublicProfileService) {}

  @Get('search')
  async exactSearch(
    @OptionalCurrentUserId() viewerId: string | null,
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
    @OptionalCurrentUserId() viewerId: string | null,
  ) {
    return this.profiles.get(publicId(value), viewerId);
  }
}
