import { Module } from '@nestjs/common';

import { PlatformModule } from '../platform';
import {
  TASKS_CLOCK,
  systemTasksClock,
} from './tasks.constants';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [PlatformModule],
  controllers: [TasksController],
  providers: [
    TasksService,
    {
      provide: TASKS_CLOCK,
      useValue: systemTasksClock,
    },
  ],
  exports: [TasksService],
})
export class TasksModule {}
