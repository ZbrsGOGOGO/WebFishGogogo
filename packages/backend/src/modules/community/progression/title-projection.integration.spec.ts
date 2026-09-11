import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { ChatMessage, ChatRoom, DeskPlant, Friendship, PlayerProfile, RailRoom, RailRoomMember, User, UserBlock } from '../../../database/entities';
import { CommunityAchievementUnlock, CommunityUserPresentation } from '../../../database/entities/community-progression.entity';
import { DEFAULT_COMMUNITY_PRIVACY } from '../../../database/entities/player-profile.entity';
import { createLocalDevDataSource } from '../../../database/local-dev-datasource';
import { ChatService } from '../../chat/chat.service';
import { ChatModerationService } from '../../chat/chat-moderation.service';
import { ChatRealtimeService } from '../../chat/chat-realtime.service';
import { DirectMessageService } from '../../chat/direct-message.service';
import { PublicProfileService } from '../public-profile.service';
import { RelationshipPolicyService } from '../relationship-policy.service';
import { RailChatService } from '../rail/rail-chat.service';
import { CommunityProgressionService } from './community-progression.service';
import { MembershipService } from './membership.service';

describe('Title metadata across public profiles and existing chat channels', () => {
  let db: DataSource; let realtime: ChatRealtimeService; let chat: ChatService; let direct: DirectMessageService;
  let rail: RailChatService; let progression: CommunityProgressionService; let profiles: PublicProfileService;
  const env = { ...process.env };
  beforeEach(async () => {
    process.env.LOCAL_DEV = 'true'; process.env.NODE_ENV = 'test';
    process.env.AUTH_TOKEN_PEPPER = 'synthetic-progression-title-pepper-long-enough';
    process.env.FEATURE_COMMUNITY_PROGRESSION_ENABLED = 'true'; process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'true';
    process.env.FEATURE_COMMUNITY_CHAT_ENABLED = 'true'; process.env.FEATURE_CHAT_WRITES_ENABLED = 'true';
    process.env.FEATURE_SOCIAL_VERIFICATION_ENABLED = 'false';
    process.env.CHAT_LOCAL_MEMORY_BUS_ENABLED = 'true'; process.env.CHAT_LOCAL_MODERATION_ENABLED = 'true';
    db = await createLocalDevDataSource(); realtime = new ChatRealtimeService(); await realtime.onModuleInit();
    await db.getRepository(ChatRoom).createQueryBuilder().update().set({ slowModeSeconds: 0 }).execute();
    const moderation = new ChatModerationService(); chat = new ChatService(db, realtime, moderation); direct = new DirectMessageService(db, realtime, moderation); rail = new RailChatService(db, moderation);
    progression = new CommunityProgressionService(db, new MembershipService(), { now: () => new Date() });
    profiles = new PublicProfileService(db, new RelationshipPolicyService());
  });
  afterEach(async () => { if (realtime) await realtime.onModuleDestroy(); if (db?.isInitialized) await db.destroy(); process.env = { ...env }; });
  async function user(name: string) {
    const actor = await db.getRepository(User).save(db.getRepository(User).create({ username: name, email: `${name}@title-test.invalid`, passwordHash: 'synthetic-only', displayName: name, accountStatus: 'active' }));
    await db.getRepository(PlayerProfile).save(db.getRepository(PlayerProfile).create({ userId: actor.id, nickname: name, privacySettings: { ...DEFAULT_COMMUNITY_PRIVACY }, title: '<b>not a real badge</b>' }));
    await db.getRepository(DeskPlant).save(db.getRepository(DeskPlant).create({ userId: actor.id, totalHarvests: 25 }));
    return actor;
  }
  async function equip(actor: User, titleKey: string | null, version = 0) { return progression.equip(actor.id, { requestId: randomUUID(), expectedVersion: version, titleKey }); }
  async function friends(a: User, b: User) {
    const [userLowId, userHighId] = [a.id, b.id].sort(); const now = new Date();
    await db.getRepository(Friendship).insert({ userLowId, userHighId, firstBecameFriendsAt: now, currentStartedAt: now, endedAt: null, endedReason: null });
  }
  it('makes only the deliberately equipped title public while preserving private honors and blocks', async () => {
    const a = await user('owner'); const b = await user('viewer'); await progression.refresh(a.id, {});
    expect(await profiles.get(a.publicId, null)).toMatchObject({ equippedTitle: null });
    expect(await profiles.get(a.publicId, null)).not.toHaveProperty('honors');
    await equip(a, 'farm_first');
    const anonymous = await profiles.get(a.publicId, null);
    expect(anonymous.equippedTitle).toEqual({ key: 'farm_first', label: '工位园丁' }); expect(anonymous).not.toHaveProperty('honors');
    expect(JSON.stringify(anonymous)).not.toMatch(/expiresAt|membership|vip|unlockedAt|title-test\.invalid|not a real badge/);
    await friends(a, b); expect((await profiles.get(a.publicId, b.id)).honors).toEqual([{ key: 'farm_first', label: '工位园丁' }, { key: 'farm_25', label: '绿意常驻' }]);
    await db.getRepository(PlayerProfile).update(a.id, { privacySettings: { ...DEFAULT_COMMUNITY_PRIVACY, honors: 'self' } });
    expect(await profiles.get(a.publicId, b.id)).not.toHaveProperty('honors'); expect((await profiles.get(a.publicId, a.id)).honors).toHaveLength(2);
    await db.getRepository(UserBlock).insert({ blockerId: b.id, blockedId: a.id, reason: null });
    await expect(profiles.get(a.publicId, b.id)).rejects.toMatchObject({ response: { code: 'USER_NOT_FOUND' } });
  });
  it('reads current group titles in both history and realtime projection without rewriting names or bodies', async () => {
    const a = await user('writer'); const b = await user('reader'); await equip(a, 'farm_first');
    const sent = await chat.send(a.id, { clientMessageId: randomUUID(), roomSlug: 'general', body: 'ordinary plain text' });
    expect(sent.author).toMatchObject({ displayName: 'writer', title: { key: 'farm_first', label: '工位园丁' } });
    await equip(a, 'farm_25', 1);
    expect((await chat.history(b.id, 'general', {})).items[0].author.title?.key).toBe('farm_25');
    expect((await chat.messageForViewer(b.id, sent.id)).author.title?.key).toBe('farm_25');
    expect((await db.getRepository(ChatMessage).findOneByOrFail({ id: sent.id })).body).toBe('ordinary plain text');
    await equip(a, null, 2); expect((await chat.messageForViewer(b.id, sent.id)).author).not.toHaveProperty('title');
  });
  it('omits titles for blocked, suspended and deleted group authors and fails closed for unowned keys', async () => {
    const a = await user('safe_writer'); const b = await user('safe_reader'); await equip(a, 'farm_first');
    const sent = await chat.send(a.id, { clientMessageId: randomUUID(), roomSlug: 'general', body: 'metadata privacy' });
    await db.getRepository(UserBlock).insert({ blockerId: b.id, blockedId: a.id, reason: null });
    const blocked = await chat.messageForViewer(b.id, sent.id); expect(blocked.visibility).toBe('blocked_placeholder'); expect(blocked.author).not.toHaveProperty('title');
    expect((await chat.history(b.id, 'general', {})).items[0].author).not.toHaveProperty('title');
    await db.getRepository(UserBlock).delete({ blockerId: b.id, blockedId: a.id });
    await db.getRepository(User).update(a.id, { accountStatus: 'suspended' }); expect((await chat.messageForViewer(b.id, sent.id)).author).not.toHaveProperty('title');
    await db.getRepository(User).update(a.id, { accountStatus: 'active' }); await db.getRepository(CommunityAchievementUnlock).delete({ userId: a.id }); expect((await chat.messageForViewer(b.id, sent.id)).author).not.toHaveProperty('title');
    await db.getRepository(User).update(a.id, { accountStatus: 'deleted' }); expect((await chat.messageForViewer(b.id, sent.id)).author).toEqual({ publicId: '00000000-0000-4000-8000-000000000000', displayName: '已注销用户' });
  });
  it('projects current titles in direct histories and conversation headers, and blocks access after blocking', async () => {
    const a = await user('dm_author'); const b = await user('dm_reader'); await friends(a, b); await equip(a, 'farm_first');
    const conversation = await direct.openConversation(b.id, a.publicId); expect(conversation.friend.title?.key).toBe('farm_first');
    const sent = await direct.send(a.id, { conversationId: conversation.id, clientMessageId: randomUUID(), body: 'private plain text' });
    expect(sent.author.title?.key).toBe('farm_first'); await equip(a, 'farm_25', 1);
    expect((await direct.history(b.id, conversation.id, {})).items[0].author.title?.key).toBe('farm_25');
    expect((await direct.messageForViewer(b.id, sent.id)).author.title?.key).toBe('farm_25');
    expect((await direct.listConversations(b.id)).items[0].friend.title?.key).toBe('farm_25');
    await db.getRepository(UserBlock).insert({ blockerId: b.id, blockedId: a.id, reason: null });
    await expect(direct.history(b.id, conversation.id, {})).rejects.toBeDefined();
  });
  it('adds title metadata to rail chat send/replay/history only, with current ownership and active status', async () => {
    const a = await user('rail_author'); const b = await user('rail_reader'); await equip(a, 'farm_first');
    const now = new Date(); const room = await db.getRepository(RailRoom).save(db.getRepository(RailRoom).create({ creatorId: a.id, hostUserId: a.id, clientRequestId: randomUUID(), requestHash: 'a'.repeat(64), mode: 'room', title: 'synthetic title room', status: 'waiting', version: 1, maxPlayers: 9, botCount: 0, rankingEligible: false, latestChatSequence: 0, createdAt: now, expiresAt: new Date(now.getTime() + 3600_000) }));
    for (const actor of [a, b]) await db.getRepository(RailRoomMember).insert({ roomId: room.id, userId: actor.id, role: 'participant', ready: false, active: true, lastSequence: 0, actionWindowCount: 0, joinedAt: now, leftAt: null });
    const input = { clientMessageId: randomUUID(), channel: 'player', body: 'rail plain text' };
    expect((await rail.send(a.id, room.id, input)).author.title?.key).toBe('farm_first'); await equip(a, 'farm_25', 1);
    expect((await rail.send(a.id, room.id, input)).author.title?.key).toBe('farm_25');
    expect((await rail.list(b.id, room.id)).items[0].author.title?.key).toBe('farm_25');
    await db.getRepository(User).update(a.id, { accountStatus: 'suspended' }); expect((await rail.list(b.id, room.id)).items[0].author).not.toHaveProperty('title');
  });
  it('turning the feature off hides all existing chat and public badges without erasing saved unlocks', async () => {
    const a = await user('switch_author'); const b = await user('switch_reader'); await equip(a, 'farm_first');
    const sent = await chat.send(a.id, { clientMessageId: randomUUID(), roomSlug: 'general', body: 'feature switch' });
    process.env.FEATURE_COMMUNITY_PROGRESSION_ENABLED = 'false';
    expect((await chat.messageForViewer(b.id, sent.id)).author).not.toHaveProperty('title'); expect((await profiles.get(a.publicId, null)).equippedTitle).toBeNull();
    expect(await db.getRepository(CommunityAchievementUnlock).countBy({ userId: a.id })).toBe(2);
    expect((await db.getRepository(CommunityUserPresentation).findOneByOrFail({ userId: a.id })).equippedTitleKey).toBe('farm_first');
  });
  it('reuses public-profile, group and private-chat projections for all three deliberately worn relief prizes', async () => {
    const a = await user('relief_writer'), b = await user('relief_reader'); await friends(a, b);
    const keys = ['office_relief_fish', 'office_relief_rebel', 'office_relief_rest'];
    for (const achievementKey of keys) await db.getRepository(CommunityAchievementUnlock).insert({ userId: a.id, achievementKey, unlockedAt: new Date(), sourceVersion: 1 });
    expect((await profiles.get(a.publicId, null)).equippedTitle).toBeNull();
    const conversation = await direct.openConversation(a.id, b.publicId);
    const groupMessage = await chat.send(a.id, { clientMessageId: randomUUID(), roomSlug: 'general', body: 'ordinary relief title message' });
    const privateMessage = await direct.send(a.id, { conversationId: conversation.id, clientMessageId: randomUUID(), body: 'ordinary private title message' });
    for (const [version, key] of keys.entries()) {
      await equip(a, key, version);
      expect(await profiles.get(a.publicId, null)).toMatchObject({ equippedTitle: { key } });
      expect((await chat.messageForViewer(b.id, groupMessage.id)).author.title?.key).toBe(key);
      expect((await direct.messageForViewer(b.id, privateMessage.id)).author.title?.key).toBe(key);
    }
    expect((await db.getRepository(ChatMessage).findOneByOrFail({ id: groupMessage.id })).body).toBe('ordinary relief title message');
    await db.getRepository(UserBlock).insert({ blockerId: b.id, blockedId: a.id, reason: null });
    expect((await chat.messageForViewer(b.id, groupMessage.id)).author).not.toHaveProperty('title');
    await expect(profiles.get(a.publicId, b.id)).rejects.toMatchObject({ response: { code: 'USER_NOT_FOUND' } });
  });
});
