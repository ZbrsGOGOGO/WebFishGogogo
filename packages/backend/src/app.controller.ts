import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import {
  STORAGE_PORT,
  type StoragePort,
} from './modules/documents/storage';

@Controller()
export class AppController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

  /** Liveness: the Nest process is able to answer requests. */
  @Get('health')
  getHealth(): { status: string } {
    return { status: 'ok' };
  }

  /** Readiness: both persistent dependencies required by user traffic work. */
  @Get('health/ready')
  async getReadiness(): Promise<{
    status: 'ready';
    checks: { database: 'ok'; storage: 'ok' };
  }> {
    const [database, storage] = await Promise.allSettled([
      this.dataSource.query('SELECT 1'),
      this.storage.checkHealth(),
    ]);
    const checks = {
      database: database.status === 'fulfilled' ? 'ok' : 'failed',
      storage: storage.status === 'fulfilled' ? 'ok' : 'failed',
    } as const;

    if (database.status === 'rejected' || storage.status === 'rejected') {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        checks,
      });
    }

    return {
      status: 'ready',
      checks: { database: 'ok', storage: 'ok' },
    };
  }
}
