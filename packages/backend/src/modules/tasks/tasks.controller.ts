import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';

import { CurrentUserId } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  ClaimTaskResult,
  TasksService,
  TodayTasksResponse,
} from './tasks.service';

@UseGuards(JwtAuthGuard)
@Controller('v1/tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  /** GET /api/v1/tasks/today */
  @Get('today')
  getToday(@CurrentUserId() userId: string): Promise<TodayTasksResponse> {
    return this.tasksService.getToday(userId);
  }

  /** POST /api/v1/tasks/:taskKey/claim */
  @Post(':taskKey/claim')
  claim(
    @CurrentUserId() userId: string,
    @Param('taskKey') taskKey: string,
  ): Promise<ClaimTaskResult> {
    return this.tasksService.claimToday(userId, taskKey);
  }
}
