import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { OutboxProcessorService } from './modules/outbox';
import { WorkerModule } from './worker.module';

const POLL_INTERVAL_MS = 1_000;
const bootstrapLogger = new Logger('WorkerBootstrap');

function delay(milliseconds: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function bootstrapWorker(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  const processor = app.get(OutboxProcessorService);
  const logger = new Logger('Worker');
  let stopping = false;

  const requestStop = (): void => {
    stopping = true;
  };
  process.once('SIGTERM', requestStop);
  process.once('SIGINT', requestStop);

  logger.log('Outbox worker started');
  while (!stopping) {
    let processed = 0;
    try {
      processed = await processor.processBatch();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'unknown processing error';
      logger.error(`Outbox polling failed: ${message}`);
    }
    if (processed === 0) {
      await delay(POLL_INTERVAL_MS);
    }
  }

  await app.close();
  logger.log('Outbox worker stopped');
}

void bootstrapWorker().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : 'unknown bootstrap error';
  bootstrapLogger.error(`Worker failed to start: ${message}`);
  process.exitCode = 1;
});
