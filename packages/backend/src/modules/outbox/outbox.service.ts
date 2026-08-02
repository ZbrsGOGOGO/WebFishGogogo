import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { OutboxEvent } from '../../database/entities/outbox-event.entity';

export interface EnqueueOutboxEvent {
  userId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  availableAt?: Date;
}

@Injectable()
export class OutboxService {
  async enqueue(
    manager: EntityManager,
    command: EnqueueOutboxEvent,
  ): Promise<OutboxEvent> {
    this.required(command.userId, 'userId', 100);
    this.required(command.eventType, 'eventType', 50);
    this.required(command.aggregateType, 'aggregateType', 50);
    this.required(command.aggregateId, 'aggregateId', 100);
    this.required(command.idempotencyKey, 'idempotencyKey', 200);

    const repo = manager.getRepository(OutboxEvent);
    const existing = await repo.findOne({
      where: { idempotencyKey: command.idempotencyKey },
    });
    if (existing) return existing;

    return repo.save(
      repo.create({
        userId: command.userId,
        eventType: command.eventType,
        aggregateType: command.aggregateType,
        aggregateId: command.aggregateId,
        payload: command.payload,
        status: 'pending',
        attempts: 0,
        availableAt: command.availableAt ?? new Date(),
        processedAt: null,
        lastError: null,
        idempotencyKey: command.idempotencyKey,
      }),
    );
  }

  private required(value: string, field: string, maxLength: number): void {
    if (
      typeof value !== 'string' ||
      value.trim() === '' ||
      value.length > maxLength
    ) {
      throw new BadRequestException(`${field} is invalid`);
    }
  }
}
