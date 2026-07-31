import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { OutboxEvent } from '../../database/entities/outbox-event.entity';
import { OutboxReceipt } from '../../database/entities/outbox-receipt.entity';
import { ActivityProjectorService } from '../engagement/activity-projector.service';
import { LocalOutboxPumpService } from './local-outbox-pump.service';
import { OutboxProcessorService } from './outbox-processor.service';
import { OutboxService } from './outbox.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([OutboxEvent, OutboxReceipt]),
  ],
  providers: [
    OutboxService,
    ActivityProjectorService,
    OutboxProcessorService,
    LocalOutboxPumpService,
  ],
  exports: [OutboxService, OutboxProcessorService],
})
export class OutboxModule {}
