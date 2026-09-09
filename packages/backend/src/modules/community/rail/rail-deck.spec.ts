import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import type { RailActionKind, RailCardKind, RailParticipant, RailRoomView } from '@stealth-reader/shared';
import { RailRoom, User } from '../../../database/entities';
import { createLocalDevDataSource } from '../../../database/local-dev-datasource';
import { RAIL_CARDS, RAIL_DECK_VERSION } from './cards';
import * as e from './engine';
import { RailService } from './rail.service';
import type { RailChatService } from './rail-chat.service';

const NOW = 2_000_000;
const SEED = 'rail-deck-fixture-no-live-accounts-20260909';
const KINDS: readonly RailCardKind[] = ['good', 'bad', 'buff'];
const PEOPLE: RailParticipant[] = Array.from({ length: 9 }, (_, index) => ({
  id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, displayName: `合成成员${index + 1}`, isBot: false,
}));
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function assertCurrentHands(state: e.RailEngineState): void {
  expect(state.deckVersion).toBe(RAIL_DECK_VERSION);
  const ids: string[] = [];
  for (const player of state.players) {
    for (const kind of KINDS) {
      expect(player.hand[kind]).toHaveLength(player.id === state.conductorId ? 0 : 3);
      expect(new Set(player.hand[kind].map((card) => card.templateId)).size).toBe(player.hand[kind].length);
      for (const card of player.hand[kind]) {
        expect(card.deckVersion).toBe(RAIL_DECK_VERSION);
        const template = RAIL_CARDS[kind].find((entry) => entry.templateId === card.templateId);
        expect(template).toBeDefined();
        expect(card).toMatchObject(template!);
        expect(card.id).toMatch(new RegExp(`^r${state.round}:p${player.seat}:${kind}:[012]$`));
        expect(card.id).not.toBe(card.templateId);
        ids.push(card.id);
      }
    }
  }
  expect(new Set(ids).size).toBe(ids.length);
}

function legacyRound(input: e.RailEngineState): e.RailEngineState {
  const state = copy(input);
  delete state.deckVersion;
  const texts = {
    good: ['修伞的云朵', '夜班灯塔员', '失物管理员'],
    bad: ['午休会议机', '抢功橡皮章', '永远插队鸭'],
    buff: ['唯一会修咖啡机', '今天刚刚道歉', '其实正在演戏'],
  };
  for (const player of state.players) for (const kind of KINDS) {
    player.hand[kind] = player.hand[kind].map((card, index) => ({
      id: card.id, kind, title: texts[kind][index], description: '旧回合已发出的完整牌面，不得回填新目录。',
    }));
  }
  return state;
}
function act(state: e.RailEngineState, playerId: string, kind: RailActionKind, fields: Record<string, unknown> = {}): e.RailEngineState {
  return e.act(state, playerId, kind, { roundToken: state.roundToken, ...fields }, state.advancedAt + 10);
}
function endRound(input: e.RailEngineState): e.RailEngineState {
  let state = input;
  for (const player of input.players.filter((entry) => entry.team)) {
    state = act(state, player.id, 'place_good', { cardId: player.hand.good[0].id });
    state = act(state, player.id, 'place_bad', { cardId: player.hand.bad[0].id });
  }
  for (const player of state.players.filter((entry) => entry.team)) {
    const target = [...state.tracks.A, ...state.tracks.B].find((entry) => !entry.buff)!;
    state = act(state, player.id, 'place_buff', { cardId: player.hand.buff[0].id, targetId: target.id });
  }
  state = act(state, state.conductorId, 'choose_track', { track: 'A' });
  for (const player of state.players.filter((entry) => entry.team)) state = act(state, player.id, 'rate', { value: 5 });
  expect(state.phase).toBe('round_end');
  return state;
}

describe('versioned 51-card deck', () => {
  it('has exactly 19 good, 18 bad, 14 buff and 51 immutable stable template IDs', () => {
    const sizes = { good: 19, bad: 18, buff: 14 };
    expect(RAIL_DECK_VERSION).toBe('rail-deck-20260909-v2');
    const all = Object.values(RAIL_CARDS).flat();
    expect(all).toHaveLength(51);
    expect(new Set(all.map((card) => card.templateId)).size).toBe(51);
    expect(new Set(all.map((card) => card.title)).size).toBe(51);
    for (const kind of KINDS) {
      expect(RAIL_CARDS[kind]).toHaveLength(sizes[kind]);
      expect(RAIL_CARDS[kind].map((card) => card.templateId)).toEqual(Array.from({ length: sizes[kind] }, (_, index) => `rail-v2-${kind}-${String(index + 1).padStart(2, '0')}`));
      expect(Object.isFrozen(RAIL_CARDS[kind])).toBe(true);
      for (const card of RAIL_CARDS[kind]) {
        expect(Object.isFrozen(card)).toBe(true);
        expect(card.title.length).toBeGreaterThan(0); expect(card.title.length).toBeLessThanOrEqual(40);
        expect(card.description.length).toBeLessThanOrEqual(100);
        expect(card.title + card.description).not.toMatch(/[<>\u0000-\u001f\u007f]/);
      }
    }
    expect(RAIL_CARDS.buff[2].title).toBe('你会爱上Ta');
    expect(RAIL_CARDS.buff[8].title).toBe('愿意把豪华邮轮送给你，只要你能放过Ta');
    expect(RAIL_CARDS.buff[9].title).toBe('电车会缓慢的碾过Ta，让Ta感受痛苦');
    expect(RAIL_CARDS.good.slice(10, 13).map((card) => card.title)).toEqual(['刘亦菲', '吴彦祖', '姆巴佩']);
  });

  it('uses three explicit fictional behavior replacements, not nationality or medical conditions as wrongdoing', () => {
    expect(RAIL_CARDS.bad[4].title).toBe('盘踞虚构岛屿、绑架旅人的海盗团伙');
    expect(RAIL_CARDS.bad[10].title).toBe('一个计划把学校当成靶场的歹徒');
    expect(RAIL_CARDS.bad[16].title).toBe('故意克扣饭菜还把餐费据为己有的食堂阿姨');
    expect(RAIL_CARDS.bad.map((card) => card.title).join('|')).not.toMatch(/日本|帕金森|超雄/);
    expect(RAIL_CARDS.bad[0].title).toBe('一个携带丧尸病毒的人');
  });

  it.each([3, 4, 5, 6, 7, 8, 9])('deals three distinct templates per category to all %i seats without changing the independent-hand rule', (count) => {
    const state = e.create(PEOPLE.slice(0, count), NOW, SEED);
    assertCurrentHands(state);
    expect(state).toEqual(e.create(PEOPLE.slice(0, count), NOW, SEED));
    expect(e.view(state, PEOPLE[1].id, NOW).deckVersion).toBe(RAIL_DECK_VERSION);
    expect(e.view(state, PEOPLE[1].id, NOW).me?.hand).toEqual(state.players[1].hand);
    expect(e.view(state, null, NOW).me).toBeNull();
  });

  it('samples only the new catalog across 100 seeds, including every template, without mutating it', () => {
    const before = JSON.stringify(RAIL_CARDS);
    const seen = new Set<string>();
    for (let seed = 0; seed < 100; seed++) {
      const state = e.create(PEOPLE, NOW, `${SEED}-${seed}`);
      assertCurrentHands(state);
      for (const player of state.players) for (const kind of KINDS) for (const card of player.hand[kind]) seen.add(card.templateId!);
    }
    expect(seen.size).toBe(51);
    expect(JSON.stringify(RAIL_CARDS)).toBe(before);
  });

  it.each([2, 4, 8])('supports %i bots through every phase and round with the smaller buff pool', (bots) => {
    const participants = [PEOPLE[0], ...Array.from({ length: bots }, (_, index) => ({ id: `AI0${index + 1}`, displayName: `AI0${index + 1}`, isBot: true }))];
    let state = e.create(participants, NOW, SEED);
    assertCurrentHands(state);
    state = e.advance(state, state.endsAt + 1);
    expect(state.phase).toBe('finished');
    expect(state.history).toHaveLength(bots + 1);
    expect(e.result(state)?.players).toHaveLength(bots + 1);
    expect(e.result(state)?.survivorMvpIds).toEqual([]);
  });

  it('does not rewrite legacy issued hands on projection, advancement, placement, buffs or decision', () => {
    const legacy = legacyRound(e.create(PEOPLE.slice(0, 3), NOW, SEED));
    const source = JSON.stringify(legacy);
    expect(e.view(legacy, PEOPLE[1].id, NOW).me?.hand).toEqual(legacy.players[1].hand);
    expect(e.view(legacy, PEOPLE[1].id, NOW).deckVersion).toBeUndefined();
    const advanced = e.advance(legacy, NOW + 100);
    expect(advanced.players.map((player) => player.hand)).toEqual(legacy.players.map((player) => player.hand));
    const ended = endRound(advanced);
    expect(ended.deckVersion).toBeUndefined();
    for (const character of [...ended.tracks.A, ...ended.tracks.B]) {
      expect(character.card.description).toBe('旧回合已发出的完整牌面，不得回填新目录。');
      expect(character.card.templateId).toBeUndefined();
      if (character.buff) expect(character.buff.card.description).toBe('旧回合已发出的完整牌面，不得回填新目录。');
    }
    expect([...ended.tracks.A, ...ended.tracks.B].filter((character) => character.buff)).toHaveLength(2);
    expect(JSON.stringify(legacy)).toBe(source);
    const next = act(ended, ended.conductorId, 'next_round');
    expect(next.round).toBe(2); assertCurrentHands(next);
    expect(next.history).toEqual(ended.history);
    expect(ended.deckVersion).toBeUndefined();
    expect(JSON.stringify(next.players)).not.toContain('旧回合已发出的');
  });

  it('changes to the new catalog only when a timed-out legacy round legitimately starts its next round', () => {
    let state = legacyRound(e.create(PEOPLE.slice(0, 3), NOW, SEED));
    for (let phase = 0; phase < 4; phase++) state = e.advance(state, state.deadlineAt);
    expect(state.phase).toBe('round_end'); expect(state.round).toBe(1);
    expect(state.deckVersion).toBeUndefined();
    expect([...state.tracks.A, ...state.tracks.B].every((entry) => entry.card.templateId === undefined)).toBe(true);
    state = e.advance(state, state.deadlineAt);
    expect(state.round).toBe(2); assertCurrentHands(state);
  });
});

/** Actual entities/SQL in pg-mem; not a production DB or a PostgreSQL-locking claim. */
describe('rail deck persisted-room compatibility', () => {
  let db: DataSource;
  let service: RailService;
  const env = { ...process.env };
  beforeEach(async () => {
    process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'true';
    db = await createLocalDevDataSource();
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'hrtime'] }).setSystemTime(new Date('2026-09-12T03:00:00Z'));
    service = new RailService(db, { availability: () => ({ chatEnabled: true, chatCanWrite: true }) } as RailChatService);
  });
  afterEach(async () => { service?.onModuleDestroy(); jest.useRealTimers(); if (db?.isInitialized) await db.destroy(); process.env = { ...env }; });
  async function people(): Promise<User[]> {
    const repo = db.getRepository(User);
    return Promise.all(['deck_a', 'deck_b', 'deck_c'].map((label) => repo.save(repo.create({
      email: `${label}@deck.invalid`, username: label, displayName: label, passwordHash: 'fixture-not-a-real-password', accountStatus: 'active',
    }))));
  }
  async function waiting(users: User[]): Promise<RailRoomView> {
    const room = await service.create(users[0].id, { clientRequestId: randomUUID(), mode: 'room', maxPlayers: 3 });
    for (const user of users.slice(1)) await service.join(user.id, { roomId: room.id });
    for (const user of users) await service.ready(user.id, room.id, { ready: true });
    return room;
  }
  async function storedRoom(id: string): Promise<RailRoom> {
    return db.getRepository(RailRoom).createQueryBuilder('room').addSelect('room.engineState').where('room.id = :id', { id }).getOneOrFail();
  }

  it('starts a previously persisted waiting room without any migration or new room fields', async () => {
    const users = await people(); const room = await waiting(users);
    const oldWaiting = await storedRoom(room.id);
    expect(oldWaiting.engineState).toBeNull();
    // Recreate the service as on application deployment. The stored room stays unchanged.
    service = new RailService(db, { availability: () => ({ chatEnabled: true, chatCanWrite: true }) } as RailChatService);
    await service.start(users[0].id, room.id);
    const stored = await storedRoom(room.id);
    assertCurrentHands(stored.engineState as unknown as e.RailEngineState);
    expect(await db.getRepository(RailRoom).count()).toBe(1);
  });

  it('GET preserves old stored text/IDs and ordinary next-round actions switch to the new deck', async () => {
    const users = await people(); const waitingRoom = await waiting(users);
    await service.start(users[0].id, waitingRoom.id);
    const row = await storedRoom(waitingRoom.id);
    const old = legacyRound(row.engineState as unknown as e.RailEngineState);
    row.engineState = old as unknown as Record<string, unknown>;
    await db.getRepository(RailRoom).save(row);
    for (let get = 0; get < 3; get++) {
      jest.setSystemTime(new Date(Date.now() + 100));
      await service.get(users[1].id, row.id);
      const read = (await storedRoom(row.id)).engineState as unknown as e.RailEngineState;
      expect(read.deckVersion).toBeUndefined();
      expect(read.players.map((player) => player.hand)).toEqual(old.players.map((player) => player.hand));
      expect(read.tracks).toEqual(old.tracks);
    }
    // Exercise ordinary actions through the service, including command IDs/sequences.
    let latest = await service.get(users[0].id, row.id);
    for (let turn = 0; turn < 30 && latest.game?.round === 1; turn++) {
      for (const user of users) {
        const current = await service.get(user.id, row.id);
        const me = current.game!.me!; const kind = me.availableActions[0];
        if (!kind) continue;
        const payload: Record<string, unknown> = { roundToken: current.game!.roundToken };
        if (kind === 'place_good') payload.cardId = me.hand.good[0].id;
        else if (kind === 'place_bad') payload.cardId = me.hand.bad[0].id;
        else if (kind === 'place_buff') { payload.cardId = me.hand.buff[0].id; payload.targetId = [...current.game!.tracks.A, ...current.game!.tracks.B].find((entry) => !entry.buff)!.id; }
        else if (kind === 'choose_track') payload.track = 'A';
        else if (kind === 'rate') payload.value = 5;
        const updated = await service.action(user.id, row.id, { actionId: randomUUID(), sequence: current.me.nextSequence, kind, payload });
        latest = updated;
        if (updated.game!.round === 2) break;
      }
    }
    expect(latest.game?.round).toBe(2);
    const stored = await storedRoom(row.id);
    assertCurrentHands(stored.engineState as unknown as e.RailEngineState);
    expect(latest.game?.history).toHaveLength(1);
    expect(await db.getRepository(RailRoom).count()).toBe(1);
  });
});
