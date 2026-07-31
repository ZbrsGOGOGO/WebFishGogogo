import { Module } from '@nestjs/common';

import { DatabaseModule } from './database/database.module';
import { OutboxModule } from './modules/outbox';

@Module({
  imports: [DatabaseModule, OutboxModule],
})
export class WorkerModule {}
