import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  // 健康检查端点（对齐 M1 验收标准：健康检查通过）
  @Get('health')
  getHealth(): { status: string } {
    return { status: 'ok' };
  }
}
