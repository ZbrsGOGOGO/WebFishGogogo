import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * 社区进程只检查自己实际依赖的数据库。
 *
 * 旧 AppController 还会检查文档对象存储；把它复用到社区进程会迫使账号服务
 * 配置一个不会使用的上传存储，也会模糊部署白名单的边界。
 */
@Controller()
export class CommunityHealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get('health')
  getHealth(): { status: 'ok'; mode: 'community' } {
    return { status: 'ok', mode: 'community' };
  }

  @Get('health/ready')
  async getReadiness(): Promise<{
    status: 'ready';
    mode: 'community';
    checks: { database: 'ok' };
  }> {
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        mode: 'community',
        checks: { database: 'failed' },
      });
    }

    return {
      status: 'ready',
      mode: 'community',
      checks: { database: 'ok' },
    };
  }
}
