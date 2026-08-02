import { Memo } from '../../database/entities';
import { MemoRepository } from './memo.repository';
import { MemoService } from './memo.service';

/**
 * 内存版 MemoRepository，忠实实现 upsert / 取最新 语义，
 * 以便在无数据库环境下真实验证 MemoService 的业务逻辑。
 */
class InMemoryMemoRepository {
  private store = new Map<string, Memo>();

  async findLatestByUserId(userId: string): Promise<Memo | null> {
    return this.store.get(userId) ?? null;
  }

  async saveForUser(userId: string, content: string): Promise<Memo> {
    const existing = this.store.get(userId);
    if (existing) {
      existing.content = content;
      existing.updatedAt = new Date();
      return existing;
    }
    const memo = new Memo();
    memo.id = `memo-${userId}`;
    memo.userId = userId;
    memo.content = content;
    memo.updatedAt = new Date();
    this.store.set(userId, memo);
    return memo;
  }
}

function createService(): MemoService {
  const repo = new InMemoryMemoRepository() as unknown as MemoRepository;
  return new MemoService(repo);
}

describe('MemoService', () => {
  it('returns empty content for a user with no saved memo (new session)', async () => {
    const service = createService();

    const result = await service.getMemo('user-1');

    expect(result.content).toBe('');
    expect(result.updatedAt).toBeNull();
  });

  it('saves memo content associated with the requesting user id', async () => {
    const service = createService();

    const saved = await service.saveMemo('user-1', '待办：写便签模块');

    expect(saved.content).toBe('待办：写便签模块');
    expect(saved.updatedAt).not.toBeNull();
  });

  it('restores the last saved content in a new session', async () => {
    const service = createService();
    await service.saveMemo('user-1', '第一次记录');

    const restored = await service.getMemo('user-1');

    expect(restored.content).toBe('第一次记录');
  });

  it('keeps only the latest content per user across repeated saves', async () => {
    const service = createService();
    await service.saveMemo('user-1', '旧内容');
    await service.saveMemo('user-1', '新内容');

    const restored = await service.getMemo('user-1');

    expect(restored.content).toBe('新内容');
  });

  it('isolates memo content between different users', async () => {
    const service = createService();
    await service.saveMemo('user-1', '用户1的便签');
    await service.saveMemo('user-2', '用户2的便签');

    expect((await service.getMemo('user-1')).content).toBe('用户1的便签');
    expect((await service.getMemo('user-2')).content).toBe('用户2的便签');
  });
});
