import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';

import { OutboxProcessorService } from './outbox-processor.service';

/**
 * pg-mem 只存在于当前进程，独立本地 Worker 无法与 API 共享它。
 * 因此仅在 LOCAL_DEV=true 时由 API 内部轻量轮询；生产始终使用独立 Worker。
 */
@Injectable()
export class LocalOutboxPumpService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(LocalOutboxPumpService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly processor: OutboxProcessorService) {}

  onApplicationBootstrap(): void {
    if (process.env.LOCAL_DEV !== 'true') return;
    this.timer = setInterval(() => {
      void this.drain();
    }, 500);
    this.timer.unref();
    this.logger.log('Local outbox pump enabled');
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.processor.processBatch();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'unknown processing error';
      this.logger.error(`Local outbox pump failed: ${message}`);
    } finally {
      this.running = false;
    }
  }
}
