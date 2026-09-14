import { randomUUID } from 'node:crypto';
import { WORD_FRONT_V2_CHAPTERS, WORD_FRONT_V2_UNITS, WORD_FRONT_V2_WIDTH, createWordFrontV2State, wordFrontV2Terrain } from '@stealth-reader/shared';
import type { DataSource } from 'typeorm';
import { AuthRateLimitService } from '../../auth/auth-rate-limit.service';
import { WordFrontRoomService } from './word-front-room.service';

describe('Word Front 1V1 authoritative short rooms', () => {
  const old = { ...process.env };
  const users = new Map<string, { id: string; publicId: string; displayName: string; accountStatus: string }>();
  const blocks: Array<{ blockerId: string; blockedId: string }> = [];
  const db = { getRepository: jest.fn((entity: { name: string }) => entity.name === 'User'
    ? { findOneBy: async ({ id }: { id: string }) => users.get(id) ?? null }
    : { find: async () => blocks }) } as unknown as DataSource;
  let service: WordFrontRoomService;
  const actor = (name: string) => {
    const id = randomUUID(); users.set(id, { id, publicId: `p-${name}`, displayName: name, accountStatus: 'active' }); return id;
  };
  const create = () => ({ requestId: randomUUID(), name: '双线工位', chapter: 1, password: '' });
  beforeEach(() => {
    users.clear(); blocks.length = 0; process.env.FEATURE_WORD_FRONT_ROOMS_ENABLED = 'true'; process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'true';
    jest.spyOn(AuthRateLimitService.prototype, 'consume').mockResolvedValue(undefined);
    service = new WordFrontRoomService(db);
  });
  afterEach(() => { service.onModuleDestroy(); jest.restoreAllMocks(); });
  afterAll(() => { process.env = old; });

  it('gates all room APIs behind explicit feature flag and community write gate', async () => {
    const a = actor('甲'); process.env.FEATURE_WORD_FRONT_ROOMS_ENABLED = 'false';
    await expect(service.list(a)).rejects.toMatchObject({ response: { code: 'WORD_ROOM_DISABLED' } });
    process.env.FEATURE_WORD_FRONT_ROOMS_ENABLED = 'true'; process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'false';
    await expect(service.create(a, create())).rejects.toMatchObject({ response: { code: 'COMMUNITY_WRITES_DISABLED' } });
  });
  it('enforces 1V1 member-only access, fixed intent idempotence, and no secret or account asset in views', async () => {
    const a = actor('甲'), b = actor('乙'), c = actor('丙'), request = create();
    const first = await service.create(a, request);
    expect((await service.create(a, request)).id).toBe(first.id);
    await expect(service.create(a, { ...request, chapter: 2 })).rejects.toMatchObject({ response: { code: 'WORD_ROOM_CREATE_CONFLICT' } });
    await expect(service.get(b, first.id)).rejects.toThrow();
    await expect(service.start(a, first.id, {})).rejects.toMatchObject({ response: { code: 'WORD_ROOM_NOT_READY' } });
    const joined = await service.join(b, { roomId: first.id, password: '' });
    expect(joined.mySide).toBe('blue'); expect(joined.opponent?.displayName).toBe('甲');
    await expect(service.join(c, { roomId: first.id, password: '' })).rejects.toMatchObject({ response: { code: 'WORD_ROOM_FULL' } });
    const serialized = JSON.stringify(joined);
    for (const hidden of [a, b, 'passwordHash', 'createHash', 'seed', 'email', 'wallet']) expect(serialized).not.toContain(hidden);
  });
  it('rejects wrong password and hides rooms across a block', async () => {
    const a = actor('甲'), b = actor('乙'), room = await service.create(a, { ...create(), password: '双线密码' });
    await expect(service.join(b, { roomId: room.id, password: '错误密码' })).rejects.toMatchObject({ response: { code: 'WORD_ROOM_PASSWORD_INVALID' } });
    blocks.push({ blockerId: b, blockedId: a });
    expect((await service.list(b)).rooms).toHaveLength(0);
    await expect(service.join(b, { roomId: room.id, password: '双线密码' })).rejects.toMatchObject({ response: { code: 'WORD_ROOM_NOT_FOUND' } });
  });
  it('uses one server seed, strips action tick and scores, applies intents once, and advances both lanes together', async () => {
    const a = actor('甲'), b = actor('乙'), room = await service.create(a, create());
    await service.join(b, { roomId: room.id, password: '' });
    await expect(service.start(b, room.id, {})).rejects.toMatchObject({ response: { code: 'WORD_ROOM_HOST_REQUIRED' } });
    const begun = await service.start(a, room.id, {});
    expect(begun.board?.units).toHaveLength(1); expect(begun.board?.status).toBe('running');
    expect(begun.board?.units).toEqual((await service.get(b, room.id)).board?.units);
    await expect(service.act(a, room.id, { actionId: randomUUID(), action: { type: 'start' } })).rejects.toThrow();
    await expect(service.act(a, room.id, { actionId: randomUUID(), action: { type: 'recruit', tick: 0 } })).rejects.toThrow();
    await expect(service.act(a, room.id, { actionId: randomUUID(), action: { type: 'recruit', score: 5000 } })).rejects.toThrow();
    const actionId = randomUUID();
    const first = await service.act(a, room.id, { actionId, action: { type: 'recruit' } });
    expect(first.board?.credits).toBe(8);
    const replay = await service.act(a, room.id, { actionId, action: { type: 'recruit' } });
    expect(replay.board?.credits).toBe(8);
    await expect(service.act(a, room.id, { actionId, action: { type: 'buy_boost', boost: 'attack' } })).rejects.toMatchObject({ response: { code: 'WORD_ROOM_ACTION_CONFLICT' } });
    const now = Date.now(); service.advance(now + 850);
    const red = await service.get(a, room.id), blue = await service.get(b, room.id);
    expect(red.board?.tick).toBe(blue.board?.tick); expect(red.board?.tick).toBeGreaterThan(0);
    expect(red.board?.credits).toBe(8); expect(blue.board?.credits).toBe(20);
  });
  it('delivers bounded counterattacks and awards a forfeit only to the remaining human', async () => {
    const a = actor('甲'), b = actor('乙'), room = await service.create(a, create());
    await service.join(b, { roomId: room.id, password: '' }); await service.start(a, room.id, {});
    const internal = (service as unknown as { rooms: Map<string, { red: { enemies: unknown[] }; blue: { enemies: unknown[] }; attackMeter: { red: number } }> }).rooms.get(room.id)!;
    const before = internal.blue.enemies.length;
    internal.attackMeter.red = 5;
    service.advance(Date.now() + 850);
    expect(internal.blue.enemies.length).toBeGreaterThan(before);
    expect(internal.attackMeter.red).toBe(0);
    await service.leave(a, room.id, {});
    const remaining = await service.get(b, room.id);
    expect(remaining.status).toBe('finished'); expect(remaining.winner).toBe('blue');
    expect((await service.list(a)).currentRoomId).toBeNull();
  });
  it('reassigns the vacant red lane when the waiting host leaves', async () => {
    const a = actor('甲'), b = actor('乙'), c = actor('丙'), room = await service.create(a, create());
    await service.join(b, { roomId: room.id, password: '' });
    await service.leave(a, room.id, {});
    const replacement = await service.join(c, { roomId: room.id, password: '' });
    expect(replacement.mySide).toBe('red');
    expect((await service.get(b, room.id)).mySide).toBe('blue');
    expect((await service.start(b, room.id, {})).status).toBe('running');
    await expect(service.start(c, room.id, {})).rejects.toMatchObject({ response: { code: 'WORD_ROOM_HOST_REQUIRED' } });
  });
  it('freezes authoritative ticks during write maintenance and retains timed-out results', async () => {
    const a = actor('甲'), b = actor('乙'), room = await service.create(a, create());
    await service.join(b, { roomId: room.id, password: '' }); await service.start(a, room.id, {});
    const now = Date.now();
    process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'false'; service.advance(now + 850);
    expect((await service.get(a, room.id)).board?.tick).toBe(0);
    await expect(service.act(a, room.id, { actionId: randomUUID(), action: { type: 'recruit' } })).rejects.toMatchObject({ response: { code: 'COMMUNITY_WRITES_DISABLED' } });
    process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'true'; service.advance(now + 15 * 60_000 + 2_000);
    const result = await service.get(a, room.id);
    expect(result.status).toBe('finished');
    expect(result.expiresAt).toBeGreaterThan(now + 15 * 60_000 + 2_000);
  });
  it('positions the guaranteed opening hero on a best-coverage legal tile that protects the first segment in every chapter', async () => {
    const a = actor('甲'), b = actor('乙');
    for (const chapter of WORD_FRONT_V2_CHAPTERS) {
      // Chosen LCG seeds force each of the five guaranteed hero pairs, plus boundaries.
      for (const seed of [2_000_000_000, 0, 3_000_000_000, 1_000, 100_000, 0x7fffffff, 0xffffffff]) {
        const room = await service.create(a, { ...create(), chapter: chapter.id });
        const internal = (service as unknown as { rooms: Map<string, { red: { seed: number }; blue: { seed: number } }> }).rooms.get(room.id)!;
        internal.red.seed = seed; internal.blue.seed = seed;
        await service.join(b, { roomId: room.id, password: '' });
        const begun = await service.start(a, room.id, {});
        const board = begun.board!;
        const unit = board.units[0]!;
        const range = WORD_FRONT_V2_UNITS[unit.kind].range;
        const reaches = (slot: number, cell: number) => Math.abs(slot % WORD_FRONT_V2_WIDTH - cell % WORD_FRONT_V2_WIDTH) +
          Math.abs(Math.floor(slot / WORD_FRONT_V2_WIDTH) - Math.floor(cell / WORD_FRONT_V2_WIDTH)) <= range;
        const coverage = (slot: number) => chapter.path.filter(cell => reaches(slot, cell)).length;
        const terrainState = createWordFrontV2State('story', chapter.id, 1);
        const legal = Array.from({ length: 48 }, (_, slot) => slot).filter(slot => ['open', 'buff'].includes(wordFrontV2Terrain(terrainState, slot)));
        expect(coverage(unit.slot)).toBe(Math.max(...legal.map(coverage)));
        expect(chapter.path.slice(0, 6).some(cell => reaches(unit.slot, cell))).toBe(true);
        expect((await service.get(b, room.id)).board?.units).toEqual(board.units);
        await service.leave(a, room.id, {}); await service.leave(b, room.id, {});
      }
    }
  });
});
