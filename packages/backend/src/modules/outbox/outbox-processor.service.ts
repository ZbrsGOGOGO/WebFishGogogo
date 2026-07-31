import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager, LessThanOrEqual } from 'typeorm';

import { OutboxEvent } from '../../database/entities/outbox-event.entity';
import { OutboxReceipt } from '../../database/entities/outbox-receipt.entity';
import { ActivityProjectorService } from '../engagement/activity-projector.service';

const CONSUMER_NAME = 'activity-task-projector-v1';
const MAX_ATTEMPTS = 5;

@Injectable()
export class OutboxProcessorService {
  private readonly logger = new Logger(OutboxProcessorService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly projector: ActivityProjectorService,
  ) {}

  async processBatch(limit = 25): Promise<number> {
    const batchSize = Math.min(Math.max(Math.trunc(limit), 1), 100);
    let processed = 0;
    for (let index = 0; index < batchSize; index += 1) {
      const found = await this.processNext();
      if (!found) break;
      processed += 1;
    }
    return processed;
  }

  private async processNext(): Promise<boolean> {
    let eventId: string | null = null;
    try {
      return await this.dataSource.transaction(async (manager) => {
        const event = await manager.getRepository(OutboxEvent).findOne({
          where: {
            status: 'pending',
            availableAt: LessThanOrEqual(new Date()),
          },
          order: { createdAt: 'ASC' },
          lock: { mode: 'pessimistic_write' },
        });
        if (!event) return false;
        eventId = event.id;

        const receiptRepo = manager.getRepository(OutboxReceipt);
        const receipt = await receiptRepo.findOne({
          where: { consumerName: CONSUMER_NAME, eventId: event.id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!receipt) {
          await this.projector.project(manager, event);
          await receiptRepo.save(
            receiptRepo.create({
              consumerName: CONSUMER_NAME,
              eventId: event.id,
            }),
          );
        }

        event.status = 'processed';
        event.attempts += 1;
        event.processedAt = new Date();
        event.lastError = null;
        await manager.getRepository(OutboxEvent).save(event);
        return true;
      });
    } catch (error) {
      if (!eventId) throw error;
      await this.markFailure(eventId, error);
      return true;
    }
  }

  private async markFailure(eventId: string, error: unknown): Promise<void> {
    const message = this.errorMessage(error);
    await this.dataSource.transaction(async (manager) => {
      const event = await this.lockEvent(manager, eventId);
      if (!event || event.status !== 'pending') return;

      event.attempts += 1;
      event.lastError = message.slice(0, 2_000);
      if (event.attempts >= MAX_ATTEMPTS) {
        event.status = 'failed';
      } else {
        const backoffSeconds = Math.min(60, 2 ** event.attempts);
        event.availableAt = new Date(Date.now() + backoffSeconds * 1_000);
      }
      await manager.getRepository(OutboxEvent).save(event);
    });
    this.logger.warn(`Outbox event ${eventId} failed: ${message}`);
  }

  private lockEvent(
    manager: EntityManager,
    eventId: string,
  ): Promise<OutboxEvent | null> {
    return manager.getRepository(OutboxEvent).findOne({
      where: { id: eventId },
      lock: { mode: 'pessimistic_write' },
    });
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim()) {
      return error.message;
    }
    return 'Unknown outbox processing error';
  }
}
