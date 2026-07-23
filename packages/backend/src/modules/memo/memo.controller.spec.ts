import { BadRequestException } from '@nestjs/common';

import { MemoController } from './memo.controller';
import { MemoContent, MemoService } from './memo.service';

/**
 * MemoController 单元测试。
 *
 * 使用轻量 fake MemoService 验证控制器的路由行为：
 * - GET /memo 透传 userId 并返回 service 结果（Req 10.2）。
 * - PUT /memo 透传 userId + content 并返回保存结果（Req 10.1）。
 * - PUT /memo 对非字符串 content 返回 400。
 * 守卫/装饰器负责 userId 派生，这里直接以 userId 参数模拟其效果。
 */
class FakeMemoService {
  saveCalls: Array<{ userId: string; content: string }> = [];
  getCalls: string[] = [];

  async getMemo(userId: string): Promise<MemoContent> {
    this.getCalls.push(userId);
    return { content: `stored-for-${userId}`, updatedAt: '2024-01-01T00:00:00.000Z' };
  }

  async saveMemo(userId: string, content: string): Promise<MemoContent> {
    this.saveCalls.push({ userId, content });
    return { content, updatedAt: '2024-01-02T00:00:00.000Z' };
  }
}

function createController(): { controller: MemoController; service: FakeMemoService } {
  const service = new FakeMemoService();
  const controller = new MemoController(service as unknown as MemoService);
  return { controller, service };
}

describe('MemoController', () => {
  it('GET /memo returns the memo for the authenticated user', async () => {
    const { controller, service } = createController();

    const result = await controller.getMemo('user-1');

    expect(result.content).toBe('stored-for-user-1');
    expect(service.getCalls).toEqual(['user-1']);
  });

  it('PUT /memo saves content associated with the authenticated user', async () => {
    const { controller, service } = createController();

    const result = await controller.saveMemo('user-1', { content: '记一笔' });

    expect(result.content).toBe('记一笔');
    expect(service.saveCalls).toEqual([{ userId: 'user-1', content: '记一笔' }]);
  });

  it('PUT /memo accepts empty string content (clearing the memo)', async () => {
    const { controller, service } = createController();

    const result = await controller.saveMemo('user-1', { content: '' });

    expect(result.content).toBe('');
    expect(service.saveCalls).toEqual([{ userId: 'user-1', content: '' }]);
  });

  it('PUT /memo rejects a non-string content with 400', async () => {
    const { controller, service } = createController();

    await expect(
      controller.saveMemo('user-1', { content: 123 as unknown as string }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.saveCalls).toEqual([]);
  });
});
