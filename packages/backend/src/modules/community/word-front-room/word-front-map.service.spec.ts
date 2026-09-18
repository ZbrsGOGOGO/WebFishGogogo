import type { DataSource } from 'typeorm';
import { User, WordFrontMapDraft } from '../../../database/entities';
import { WordFrontMapService } from './word-front-map.service';

describe('WordFrontMapService', () => {
  const old = { ...process.env };
  const adminId = '00000000-0000-4000-8000-000000000001';
  const userId = '00000000-0000-4000-8000-000000000002';
  const users = new Map([
    [adminId, { id: adminId, accountStatus: 'active', communityRole: 'admin' }],
    [userId, { id: userId, accountStatus: 'active', communityRole: 'user' }],
  ]);
  const drafts = new Map<string, Record<string, unknown>>();
  const valid = {
    name: '长坂坡测试图',
    cells: [
      'A######S',
      'P##ooo#P',
      'P##ooo#P',
      'P##PPPPP',
      'PPPPpppp',
      'ppppp##p',
      'ppppp##p',
      'p#...##p',
      'p#...##p',
      'S######A',
    ],
    expectedVersion: 0,
  };
  let service: WordFrontMapService;

  beforeEach(() => {
    drafts.clear();
    process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'true';
    const userRepo = { findOneBy: jest.fn(async ({ id }: { id: string }) => users.get(id) ?? null) };
    const draftRepo = {
      find: jest.fn(async () => [...drafts.values()]),
      findOne: jest.fn(async ({ where }: { where: { key: string } }) => drafts.get(where.key) ?? null),
      create: jest.fn((value: Record<string, unknown>) => value),
      save: jest.fn(async (value: Record<string, unknown>) => {
        const row = { ...value };
        drafts.set(String(row.key), row);
        return row;
      }),
    };
    const getRepository = jest.fn((entity: unknown) => entity === User ? userRepo : draftRepo);
    const db = {
      getRepository,
      transaction: jest.fn(async (work: (manager: { getRepository: typeof getRepository }) => unknown) => work({ getRepository })),
    } as unknown as DataSource;
    service = new WordFrontMapService(db);
  });

  afterAll(() => { process.env = old; });

  it('keeps map drafts admin-only and exposes the fixed 8x10 contract', async () => {
    await expect(service.list(userId)).rejects.toMatchObject({ response: { code: 'ADMIN_ACCESS_REQUIRED' } });
    await expect(service.list('00000000-0000-4000-8000-000000000099')).rejects.toMatchObject({ response: { code: 'INVALID_SESSION' } });
    const result = await service.list(adminId);
    expect(result).toMatchObject({ rulesVersion: 4, width: 8, height: 10, items: [] });
  });

  it('validates topology and rejects extra fields before any write', async () => {
    await expect(service.save(adminId, 'bad key', valid)).rejects.toMatchObject({ response: { code: 'WORD_MAP_INVALID' } });
    await expect(service.save(adminId, 'test-map', { ...valid, cells: valid.cells.slice(0, 9) })).rejects.toMatchObject({ response: { code: 'WORD_MAP_INVALID' } });
    await expect(service.save(adminId, 'test-map', { ...valid, extra: true })).rejects.toMatchObject({ response: { code: 'WORD_MAP_INVALID' } });
    await expect(service.save(adminId, 'test-map', { ...valid, cells: valid.cells.map(row => row.replaceAll('p', '.')) })).rejects.toMatchObject({ response: { code: 'WORD_MAP_INVALID' } });
  });

  it('uses optimistic versions so two editors cannot silently overwrite each other', async () => {
    const first = await service.save(adminId, 'test-map', valid);
    expect(first).toMatchObject({ key: 'test-map', name: valid.name, version: 1, cells: valid.cells });
    await expect(service.save(adminId, 'test-map', { ...valid, name: '过期修改' })).rejects.toMatchObject({
      response: { code: 'WORD_MAP_VERSION_CONFLICT', version: 1 },
    });
    const second = await service.save(adminId, 'test-map', { ...valid, name: '有效修改', expectedVersion: 1 });
    expect(second).toMatchObject({ key: 'test-map', name: '有效修改', version: 2 });
  });

  it('fails closed while community writes are under maintenance', async () => {
    process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'false';
    await expect(service.save(adminId, 'test-map', valid)).rejects.toMatchObject({ response: { code: 'COMMUNITY_WRITES_DISABLED' } });
    expect(drafts.size).toBe(0);
  });
});
