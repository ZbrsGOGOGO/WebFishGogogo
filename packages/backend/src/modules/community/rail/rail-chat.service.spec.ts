import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { RailChatMessageRecord, RailRoom, RailRoomMember, User, UserBlock } from '../../../database/entities';
import { createLocalDevDataSource } from '../../../database/local-dev-datasource';
import { ChatModerationService } from '../../chat/chat-moderation.service';
import { RailChatService } from './rail-chat.service';

describe('RailChatService', () => {
  let db: DataSource; let service: RailChatService; let moderation: ChatModerationService;
  const environment = { ...process.env };
  beforeEach(async () => {
    process.env.LOCAL_DEV = 'true'; process.env.NODE_ENV = 'test';
    process.env.AUTH_TOKEN_PEPPER = 'rail-chat-tests-private-pepper-long-enough';
    process.env.FEATURE_COMMUNITY_CHAT_ENABLED = 'true'; process.env.FEATURE_CHAT_WRITES_ENABLED = 'true';
    process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'true'; process.env.CHAT_LOCAL_MODERATION_ENABLED = 'true';
    db = await createLocalDevDataSource(); moderation = new ChatModerationService(); service = new RailChatService(db, moderation);
  });
  afterEach(async () => { jest.restoreAllMocks(); if (db?.isInitialized) await db.destroy(); process.env = { ...environment }; });
  async function user(name: string) { return db.getRepository(User).save(db.getRepository(User).create({ email: `${name}@rail-chat.invalid`, username: name, displayName: name, passwordHash: 'not-a-login', accountStatus: 'active' })); }
  async function setup() {
    const host = await user('host'); const spectator = await user('watcher'); const outsider = await user('outsider');
    const room = await db.getRepository(RailRoom).save(db.getRepository(RailRoom).create({ creatorId: host.id, hostUserId: host.id, clientRequestId: randomUUID(), requestHash: 'a'.repeat(64), mode: 'room', title: '测试协作组', status: 'waiting', version: 1, passwordHash: null, maxPlayers: 9, botCount: 0, engineState: null, rankingEligible: false, latestChatSequence: 0, createdAt: new Date(), startedAt: null, expiresAt: new Date(Date.now() + 3_600_000), finishedAt: null, leaderboardDate: null }));
    for (const [person, role] of [[host, 'participant'], [spectator, 'spectator']] as const) await db.getRepository(RailRoomMember).insert({ roomId: room.id, userId: person.id, role, ready: false, active: true, lastSequence: 0, actionWindowAt: null, actionWindowCount: 0, joinedAt: new Date(), leftAt: null });
    return { host, spectator, outsider, room };
  }
  const input = (body = '这轮怎么选？', channel = 'player') => ({ clientMessageId: randomUUID(), body, channel });

  it('requires membership and active account, rather than trusting supplied roles', async () => {
    const { host, outsider, room } = await setup();
    await expect(service.list(outsider.id, room.id)).rejects.toMatchObject({ response: { code: 'RAIL_ROOM_NOT_FOUND' } });
    await expect(service.send(outsider.id, room.id, input())).rejects.toMatchObject({ response: { code: 'RAIL_ROOM_NOT_FOUND' } });
    await expect(service.send(host.id, room.id, { ...input(), role: 'spectator' })).rejects.toMatchObject({ response: { code: 'RAIL_REQUEST_INVALID' } });
    await db.getRepository(User).update(host.id, { accountStatus: 'suspended' });
    await expect(service.list(host.id, room.id)).rejects.toMatchObject({ response: { code: 'RAIL_ACTIVE_ACCOUNT_REQUIRED' } });
  });
  it('separates write channels while members can read both, with no internal IDs or secrets', async () => {
    const { host, spectator, room } = await setup();
    await service.send(host.id, room.id, input('玩家频道'));
    await service.send(spectator.id, room.id, input('观众频道', 'spectator'));
    await expect(service.send(host.id, room.id, input('越权', 'spectator'))).rejects.toMatchObject({ response: { code: 'RAIL_CHAT_CHANNEL_FORBIDDEN' } });
    await expect(service.send(spectator.id, room.id, input('越权'))).rejects.toMatchObject({ response: { code: 'RAIL_CHAT_CHANNEL_FORBIDDEN' } });
    const page = await service.list(spectator.id, room.id);
    expect(page.items.map((entry) => entry.channel)).toEqual(['player', 'spectator']);
    expect(JSON.stringify(page)).not.toMatch(/passwordHash|email|requestHash|engineState/);
    expect(JSON.stringify(page)).not.toContain(host.id);
    expect((await service.list(host.id, room.id, { channel: 'spectator' })).items).toHaveLength(1);
  });
  it('deduplicates a stable message ID and rejects altered replays', async () => {
    const { host, room } = await setup(); const request = input();
    const first = await service.send(host.id, room.id, request);
    expect(await service.send(host.id, room.id, request)).toEqual(first);
    await expect(service.send(host.id, room.id, { ...request, body: '改写' })).rejects.toMatchObject({ response: { code: 'RAIL_IDEMPOTENCY_CONFLICT' } });
    expect(await db.getRepository(RailChatMessageRecord).count()).toBe(1);
    expect((await db.getRepository(RailRoom).findOneByOrFail({ id: room.id })).latestChatSequence).toBe(1);
  });
  it('withdraws only own messages, erases body and never resurrects it on retry', async () => {
    const { host, spectator, room } = await setup(); const request = input();
    const first = await service.send(host.id, room.id, request);
    await expect(service.withdraw(spectator.id, room.id, first.id)).rejects.toMatchObject({ response: { code: 'RAIL_CHAT_MESSAGE_NOT_FOUND' } });
    expect(await service.withdraw(host.id, room.id, first.id)).toMatchObject({ body: null, status: 'withdrawn', sequence: 1 });
    expect(await service.send(host.id, room.id, request)).toMatchObject({ body: null, status: 'withdrawn' });
    expect((await service.list(spectator.id, room.id)).items[0].body).toBeNull();
    expect((await db.getRepository(RailChatMessageRecord).findOneByOrFail({ id: first.id })).body).toBe('');
  });
  it('rechecks membership and channel after asynchronous moderation', async () => {
    const { host, room } = await setup();
    jest.spyOn(moderation, 'moderate').mockImplementation(async () => {
      await db.getRepository(RailRoomMember).update({ roomId: room.id, userId: host.id }, { leftAt: new Date(), active: false });
      return { decision: 'allow', provider: 'test', reference: null };
    });
    await expect(service.send(host.id, room.id, input())).rejects.toMatchObject({ response: { code: 'RAIL_ROOM_NOT_FOUND' } });
    expect(await db.getRepository(RailChatMessageRecord).count()).toBe(0);
  });
  it('rechecks account restrictions and write gates after moderation', async () => {
    const { host, room } = await setup();
    jest.spyOn(moderation, 'moderate').mockImplementation(async () => {
      await db.getRepository(User).update(host.id, { accountStatus: 'banned' });
      return { decision: 'allow', provider: 'test', reference: null };
    });
    await expect(service.send(host.id, room.id, input())).rejects.toMatchObject({ response: { code: 'RAIL_ACTIVE_ACCOUNT_REQUIRED' } });
    expect(await db.getRepository(RailChatMessageRecord).count()).toBe(0);
  });
  it('does not persist rejected or pending moderation and fails closed if unavailable', async () => {
    const { host, room } = await setup();
    const moderate = jest.spyOn(moderation, 'moderate').mockResolvedValue({ decision: 'review', provider: 'test', reference: null });
    await expect(service.send(host.id, room.id, input())).rejects.toMatchObject({ response: { code: 'RAIL_CHAT_MODERATION_REJECTED' } });
    moderate.mockResolvedValue({ decision: 'reject', provider: 'test', reference: null });
    await expect(service.send(host.id, room.id, input())).rejects.toMatchObject({ response: { code: 'RAIL_CHAT_MODERATION_REJECTED' } });
    jest.spyOn(moderation, 'isAvailable').mockReturnValue(false);
    await expect(service.send(host.id, room.id, input())).rejects.toMatchObject({ response: { code: 'RAIL_CHAT_READ_ONLY' } });
    expect(service.availability().chatCanWrite).toBe(false);
    expect(await db.getRepository(RailChatMessageRecord).count()).toBe(0);
  });
  it('honors chat/community gates, room end and leave restrictions', async () => {
    const { host, room } = await setup();
    process.env.FEATURE_COMMUNITY_CHAT_ENABLED = 'false';
    await expect(service.list(host.id, room.id)).rejects.toThrow();
    process.env.FEATURE_COMMUNITY_CHAT_ENABLED = 'true'; process.env.FEATURE_CHAT_WRITES_ENABLED = 'false';
    await expect(service.send(host.id, room.id, input())).rejects.toThrow();
    process.env.FEATURE_CHAT_WRITES_ENABLED = 'true'; process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'false';
    await expect(service.send(host.id, room.id, input())).rejects.toThrow();
    process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'true';
    await db.getRepository(RailRoom).update(room.id, { status: 'finished' });
    await expect(service.send(host.id, room.id, input())).rejects.toMatchObject({ response: { code: 'RAIL_CHAT_READ_ONLY' } });
  });
  it('hides rooms after a mutual block and masks softly deleted authors', async () => {
    const { host, spectator, room } = await setup();
    await service.send(host.id, room.id, input('旧姓名和消息'));
    await db.getRepository(User).update(host.id, { accountStatus: 'deleted' });
    expect((await service.list(spectator.id, room.id)).items[0]).toMatchObject({ body: null, status: 'withdrawn', author: { username: null, displayName: '已注销同事' } });
    await db.getRepository(UserBlock).insert({ blockerId: host.id, blockedId: spectator.id });
    await expect(service.list(spectator.id, room.id)).rejects.toMatchObject({ response: { code: 'RAIL_ROOM_NOT_FOUND' } });
  });
  it('bounds bodies and cursor inputs while allowing Chinese emoji', async () => {
    const { host, room } = await setup();
    for (const body of ['', 'x'.repeat(601), '\u0000hi', '\ud800']) await expect(service.send(host.id, room.id, input(body))).rejects.toMatchObject({ response: { code: 'RAIL_CHAT_BODY_INVALID' } });
    for (const value of ['', '-1', '1.1', '9999999999', ['1'], '1002']) await expect(service.list(host.id, room.id, { afterSequence: value })).rejects.toMatchObject({ response: { code: 'RAIL_CHAT_CURSOR_INVALID' } });
    await expect(service.list(host.id, room.id, { afterSequence: '0', beforeSequence: '1' })).rejects.toMatchObject({ response: { code: 'RAIL_CHAT_CURSOR_INVALID' } });
    expect(await service.send(host.id, room.id, input('  中文🙂\n可换行  '))).toMatchObject({ body: '中文🙂\n可换行' });
  });
  it('enforces slow mode and a durable account quota even on rejected moderation', async () => {
    const { host, room } = await setup();
    await service.send(host.id, room.id, input());
    await expect(service.send(host.id, room.id, input('再一条'))).rejects.toMatchObject({ response: { code: 'RAIL_CHAT_SLOW_MODE' } });
    jest.spyOn(moderation, 'moderate').mockResolvedValue({ decision: 'reject', provider: 'test', reference: null });
    for (let i = 0; i < 3; i++) await expect(service.send(host.id, room.id, input(`拒绝${i}`))).rejects.toMatchObject({ response: { code: 'RAIL_CHAT_MODERATION_REJECTED' } });
    await expect(service.send(host.id, room.id, input())).rejects.toMatchObject({ response: { code: 'AUTH_RATE_LIMITED' } });
    expect(await db.getRepository(RailChatMessageRecord).count()).toBe(1);
  });
  it('returns bounded chronological pages and retains only a 200-message display window', async () => {
    const { host, room } = await setup();
    await db.getRepository(RailChatMessageRecord).insert(Array.from({ length: 210 }, (_, index) => ({ roomId: room.id, authorId: host.id, clientMessageId: randomUUID(), requestHash: 'a'.repeat(64), sequence: index + 1, channel: 'player' as const, body: `消息${index + 1}`, status: 'visible' as const, createdAt: new Date(), withdrawnAt: null })));
    await db.getRepository(RailRoom).update(room.id, { latestChatSequence: 210 });
    const tail = await service.list(host.id, room.id);
    expect(tail.items.map((entry) => entry.sequence)).toEqual(Array.from({ length: 50 }, (_, i) => i + 161));
    expect(tail.hasMore).toBe(true);
    expect((await service.list(host.id, room.id, { beforeSequence: '20' })).items.map((entry) => entry.sequence)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19]);
    expect((await service.list(host.id, room.id, { afterSequence: '207' })).items.map((entry) => entry.sequence)).toEqual([208, 209, 210]);
  });
});
