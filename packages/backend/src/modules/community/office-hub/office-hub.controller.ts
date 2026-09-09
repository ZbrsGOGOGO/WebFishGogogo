import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUserId } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { OfficeHubService } from './office-hub.service';
@Controller('v1/office-hub')
@UseGuards(JwtAuthGuard)
export class OfficeHubController {
    constructor(private readonly hub: OfficeHubService) { }
    @Get('overview')
    overview(
    @CurrentUserId()
    userId: string, @Query('cursor') cursor?: string, @Query('kind') kind?: string) { return this.hub.overview(userId,cursor,kind); }
    @Post('actions')
    action(
    @CurrentUserId()
    userId: string,
    @Body()
    body: unknown) { return this.hub.action(userId, body); }
}
