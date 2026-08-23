import { randomUUID } from 'node:crypto';

import type { DataSource } from 'typeorm';

import {
  Friendship,
  OfficeBattleDefenseConfig,
  OfficeBattleFriendRewardClaim,
  OfficeBattleProfile,
  OfficeBattleRecord,
  PlayerProfile,
  RewardGrant,
  User,
  UserBlock,
} from '../../../database/entities';
import { createLocalDevDataSource } from '../../../database/local-dev-datasource';
import { PlatformAssetsService } from '../../platform/platform-assets.service';
import type { CommunityClock } from '../community-clock';
import { NotificationService } from '../notification.service';
import { RelationshipPolicyService } from '../relationship-policy.service';
import { OfficeBattleService } from './office-battle.service';

describe('OfficeBattleService transactions', () => {
  let dataSource: DataSource;
  let service: OfficeBattleService;
  let now: Date;

  beforeEach(async () => {
    dataSource = await createLocalDevDataSource();
    now = new Date('2026-08-22T10:00:00.000Z');
    const clock: CommunityClock = { now: () => new Date(now) };
    service = new OfficeBattleService(
      dataSource,
      new PlatformAssetsService(clock),
      new NotificationService(dataSource),
      new RelationshipPolicyService(),
      clock,
    );
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('settles an NPC battle once and recovers the exact result by request id', async () => {
    const user = await createUser('battle-one@example.com');
    const initial = (await service.chooseProfession(
      user.id,
      'developer',
      null,
      'choose-profession-0001',
    )) as { offers: Array<{ offerId: string }> };
    expect(initial.offers).toHaveLength(3);

    const practiceId = randomUUID();
    const practice = await service.createBattle(
      user.id,
      {
        battleRequestId: practiceId,
        opponent: { kind: 'npc', offerId: initial.offers[0].offerId },
        mode: 'practice',
        loadoutVersion: 1,
      },
      practiceId,
    );
    const replay = await service.createBattle(
      user.id,
      {
        battleRequestId: practiceId,
        opponent: { kind: 'npc', offerId: initial.offers[0].offerId },
        mode: 'practice',
        loadoutVersion: 1,
      },
      practiceId,
    );
    expect(replay).toEqual(practice);
    expect(
      (practice as unknown as { reward: { battleExperience: number } }).reward
        .battleExperience,
    ).toBe(0);
    expect(await dataSource.getRepository(OfficeBattleRecord).count({ where: { userId: user.id } })).toBe(1);
    expect((await dataSource.getRepository(OfficeBattleProfile).findOneByOrFail({ userId: user.id })).energy).toBe(12);

    const refreshed = (await service.bootstrap(user.id)) as {
      offers: Array<{ offerId: string }>;
      profile: { loadoutVersion: number };
    };
    const rewardId = randomUUID();
    const settled = await service.createBattle(
      user.id,
      {
        battleRequestId: rewardId,
        opponent: { kind: 'npc', offerId: refreshed.offers[1].offerId },
        mode: 'reward',
        loadoutVersion: refreshed.profile.loadoutVersion,
      },
      rewardId,
    );
    expect(await service.getBattleByRequest(user.id, rewardId)).toEqual(settled);
    expect((await dataSource.getRepository(OfficeBattleProfile).findOneByOrFail({ userId: user.id })).energy).toBe(11);
    expect(await dataSource.getRepository(RewardGrant).count({ where: { userId: user.id } })).toBe(1);
  });

  it('pages battle records by the indexed completed-at tuple', async () => {
    const user = await createUser('battle-history@example.com');
    const repo = dataSource.getRepository(OfficeBattleRecord);
    await repo.save(
      Array.from({ length: 31 }, (_, index) =>
        repo.create({
          userId: user.id,
          defenderUserId: null,
          battleRequestId: `history-request-${index}`,
          requestHash: `${index}`.padStart(64, '0'),
          mode: 'practice',
          opponentKind: 'npc',
          offerId: null,
          serviceDate: '2026-08-22',
          engineVersion: 'test-engine',
          balanceVersion: 'test-balance',
          seedHex: `${index}`.padStart(64, '0'),
          playerSnapshot: {},
          opponentSnapshot: {
            publicId: randomUUID(),
            displayName: `Opponent ${index}`,
            profession: 'developer',
            battleLevel: 1,
            power: 100,
          },
          opponentEquipmentVisible: false,
          playerEquipmentVisibleToDefender: false,
          events: [],
          winner: 'player',
          rewardSnapshot: {},
          energySnapshot: {},
          profileVersion: 1,
          loadoutVersion: 1,
          inventoryVersion: 1,
          completedAt: new Date(now.getTime() - index * 1_000),
        }),
      ),
    );

    const first = await service.history(user.id);
    expect(first.items).toHaveLength(30);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await service.history(user.id, first.nextCursor!);
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    expect(
      new Set([...first.items, ...second.items].map((item) => item.battleId)).size,
    ).toBe(31);
  });

  it('enforces friend challenge privacy and block filtering', async () => {
    const attacker = await createUser('battle-attacker@example.com');
    const defender = await createUser('battle-defender@example.com');
    const attackerBootstrap = (await service.chooseProfession(
      attacker.id,
      'qa',
      null,
      'choose-attacker-0001',
    )) as { profile: { loadoutVersion: number } };
    const defenderBootstrap = (await service.chooseProfession(
      defender.id,
      'product',
      null,
      'choose-defender-0001',
    )) as { defense: { equipmentIds: string[]; version: number } };
    const [userLowId, userHighId] =
      attacker.id < defender.id ? [attacker.id, defender.id] : [defender.id, attacker.id];
    await dataSource.getRepository(Friendship).save(
      dataSource.getRepository(Friendship).create({
        userLowId,
        userHighId,
        firstBecameFriendsAt: new Date(now.getTime() - 48 * 60 * 60 * 1_000),
        currentStartedAt: new Date(now.getTime() - 48 * 60 * 60 * 1_000),
        endedAt: null,
        endedReason: null,
      }),
    );
    await service.updateDefense(
      defender.id,
      defenderBootstrap.defense.equipmentIds,
      'none',
      'private',
      defenderBootstrap.defense.version,
      'close-defense-0001',
    );
    const requestId = randomUUID();
    await expect(
      service.createBattle(
        attacker.id,
        {
          battleRequestId: requestId,
          opponent: { kind: 'friend', publicId: defender.publicId },
          mode: 'practice',
          loadoutVersion: attackerBootstrap.profile.loadoutVersion,
        },
        requestId,
      ),
    ).rejects.toMatchObject({ response: { code: 'DEFENSE_PRIVACY_CLOSED' } });

    await dataSource.getRepository(UserBlock).save(
      dataSource.getRepository(UserBlock).create({
        blockerId: defender.id,
        blockedId: attacker.id,
        reason: null,
      }),
    );
    await expect(service.publicRecord(attacker.id, defender.publicId)).rejects.toMatchObject({
      response: { code: 'BATTLE_RECORD_NOT_FOUND' },
    });
  });

  it('returns every legal friend candidate beyond 50 in stable order with fixed batch queries', async () => {
    const attacker = await createUser('battle-many-friends@example.com');
    await service.chooseProfession(
      attacker.id,
      'developer',
      null,
      'choose-many-friends-0001',
    );

    // Social verification is disabled for this release, so an unverified but
    // otherwise active friend remains a legal candidate.
    const invalidIndexes = new Set([3, 17, 45]);
    const userRepo = dataSource.getRepository(User);
    const friends = await userRepo.save(
      Array.from({ length: 64 }, (_, index) => {
        const email = `battle-friend-${index.toString().padStart(2, '0')}@example.com`;
        return userRepo.create({
          email,
          emailNormalized: email,
          passwordHash: 'unused',
          displayName: `同名好友`,
          publicId: randomUUID(),
          accountStatus: index === 45 ? 'suspended' : 'active',
          socialVerificationStatus: index === 55 ? 'unverified' : 'verified',
          communityRole: 'user',
          emailVerifiedAt: now,
          passwordChangedAt: now,
          onboardingCompleted: true,
        });
      }),
    );
    const startedAt = new Date(now.getTime() - 48 * 60 * 60 * 1_000);
    const profileRepo = dataSource.getRepository(OfficeBattleProfile);
    await profileRepo.save(
      friends.map((friend, index) => profileRepo.create({
        userId: friend.id,
        profession: 'developer',
        totalBattleExperience: index,
        wins: 0,
        losses: 0,
        energy: 12,
        serviceDate: '2026-08-22',
        parts: 0,
        rewardedBattlesUsed: 0,
        rewardedFriendBattlesUsed: 0,
        upgradeProtectionUsed: false,
        profileVersion: 1,
        loadoutVersion: 1,
        inventoryVersion: 1,
        defenseVersion: 1,
        professionChangedAt: startedAt,
        starterProfessions: [],
      })),
    );
    const defenseRepo = dataSource.getRepository(OfficeBattleDefenseConfig);
    await defenseRepo.save(
      friends.map((friend, index) => defenseRepo.create({
        userId: friend.id,
        profession: 'developer',
        equipmentIds: [],
        challengeVisibility: index === 17 ? 'none' : 'friends',
        equipmentVisibility: 'friends',
        version: 1,
      })),
    );
    const friendshipRepo = dataSource.getRepository(Friendship);
    await friendshipRepo.save(
      friends.map((friend, index) => {
        const [userLowId, userHighId] =
          attacker.id < friend.id
            ? [attacker.id, friend.id]
            : [friend.id, attacker.id];
        return friendshipRepo.create({
          id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
          userLowId,
          userHighId,
          firstBecameFriendsAt: startedAt,
          currentStartedAt: startedAt,
          endedAt: null,
          endedReason: null,
        });
      }),
    );
    await dataSource.getRepository(UserBlock).save(
      dataSource.getRepository(UserBlock).create({
        blockerId: friends[3].id,
        blockedId: attacker.id,
        reason: null,
      }),
    );
    const playerProfileRepo = dataSource.getRepository(PlayerProfile);
    await playerProfileRepo.save([
      playerProfileRepo.create({
        userId: friends[0].id,
        nickname: '资料昵称',
        avatarKey: null,
        bio: null,
        battleProfession: 'developer',
        privacySettings: {
          equipment: 'friends',
          battleRecord: 'friends',
          plant: 'friends',
          honors: 'friends',
          friendCount: 'self',
          recentActivity: 'self',
        },
        title: '初入工位',
      }),
      playerProfileRepo.create({
        userId: friends[1].id,
        nickname: '   ',
        avatarKey: null,
        bio: null,
        battleProfession: 'developer',
        privacySettings: {
          equipment: 'friends',
          battleRecord: 'friends',
          plant: 'friends',
          honors: 'friends',
          friendCount: 'self',
          recentActivity: 'self',
        },
        title: '初入工位',
      }),
    ]);

    const attackerProfile = await profileRepo.findOneByOrFail({ userId: attacker.id });
    const friendshipQuerySpy = jest.spyOn(friendshipRepo, 'createQueryBuilder');
    const userFindSpy = jest.spyOn(userRepo, 'find');
    const profileFindSpy = jest.spyOn(profileRepo, 'find');
    const playerProfileFindSpy = jest.spyOn(playerProfileRepo, 'find');
    const defenseFindSpy = jest.spyOn(defenseRepo, 'find');
    const blockFindSpy = jest.spyOn(dataSource.getRepository(UserBlock), 'find');
    const claimFindSpy = jest.spyOn(
      dataSource.getRepository(OfficeBattleFriendRewardClaim),
      'find',
    );

    const candidateLoader = service as unknown as {
      friendCandidates(
        manager: DataSource['manager'],
        userId: string,
        profile: OfficeBattleProfile,
        at: Date,
      ): Promise<Array<{ publicId: string; displayName: string }>>;
    };
    const friendCandidates = await candidateLoader.friendCandidates(
      dataSource.manager,
      attacker.id,
      attackerProfile,
      now,
    );

    expect(friendCandidates).toHaveLength(61);
    expect(friendCandidates.map((candidate) => candidate.publicId)).toEqual(
      friends
        .filter((_friend, index) => !invalidIndexes.has(index))
        .map((friend) => friend.publicId),
    );
    expect(friendCandidates[0].displayName).toBe('资料昵称');
    expect(friendCandidates[1].displayName).toBe('同名好友');
    expect(friendCandidates.slice(2).every((candidate) => candidate.displayName === '同名好友')).toBe(true);
    expect(friendshipQuerySpy).toHaveBeenCalledTimes(1);
    expect(userFindSpy).toHaveBeenCalledTimes(1);
    expect(profileFindSpy).toHaveBeenCalledTimes(1);
    expect(playerProfileFindSpy).toHaveBeenCalledTimes(1);
    expect(defenseFindSpy).toHaveBeenCalledTimes(1);
    expect(blockFindSpy).toHaveBeenCalledTimes(1);
    expect(claimFindSpy).toHaveBeenCalledTimes(1);
  });

  async function createUser(email: string): Promise<User> {
    return dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        email,
        emailNormalized: email,
        passwordHash: 'unused',
        displayName: email.split('@')[0],
        publicId: randomUUID(),
        accountStatus: 'active',
        socialVerificationStatus: 'verified',
        communityRole: 'user',
        emailVerifiedAt: now,
        passwordChangedAt: now,
        onboardingCompleted: true,
      }),
    );
  }
});
