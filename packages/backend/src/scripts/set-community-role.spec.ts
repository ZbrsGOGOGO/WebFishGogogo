import { randomUUID } from 'node:crypto';

import type { DataSource } from 'typeorm';

import { AdminAuditLog } from '../database/entities/admin-audit-log.entity';
import { User } from '../database/entities/user.entity';
import { createLocalDevDataSource } from '../database/local-dev-datasource';
import { assignCommunityRole } from './set-community-role';

describe('offline community role assignment', () => {
  let dataSource: DataSource;

  beforeEach(async () => {
    dataSource = await createLocalDevDataSource();
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('uses exact publicId plus explicit confirmation and writes an audit trail', async () => {
    const target = await activeUser('role-target@example.com');
    const result = await assignCommunityRole(dataSource, {
      publicId: target.publicId,
      role: 'admin',
      confirmation: `ASSIGN:${target.publicId}:admin`,
      reason: 'Initial production moderation bootstrap',
    });
    expect(result).toEqual({
      publicId: target.publicId,
      previousRole: 'user',
      role: 'admin',
      changed: true,
    });
    expect(
      (await dataSource.getRepository(User).findOneByOrFail({ id: target.id }))
        .communityRole,
    ).toBe('admin');
    const audit = await dataSource.getRepository(AdminAuditLog).findOneByOrFail({
      targetType: 'user',
      targetId: target.id,
    });
    expect(audit).toMatchObject({
      actorId: null,
      actorRole: 'system',
      action: 'community_role.offline_assignment',
      previousState: { communityRole: 'user', assignmentMode: 'offline_operator' },
      nextState: { communityRole: 'admin', assignmentMode: 'offline_operator' },
    });

    const replay = await assignCommunityRole(dataSource, {
      publicId: target.publicId,
      role: 'admin',
      confirmation: `ASSIGN:${target.publicId}:admin`,
      reason: 'Initial production moderation bootstrap',
    });
    expect(replay.changed).toBe(false);
    expect(await dataSource.getRepository(AdminAuditLog).count()).toBe(1);
  });

  it('fails before querying by email or changing state when confirmation is wrong', async () => {
    const target = await activeUser('wrong-confirmation@example.com');
    await expect(
      assignCommunityRole(dataSource, {
        publicId: target.publicId,
        role: 'moderator',
        confirmation: 'yes',
        reason: 'Moderator bootstrap request',
      }),
    ).rejects.toThrow('must exactly equal');
    expect(
      (await dataSource.getRepository(User).findOneByOrFail({ id: target.id }))
        .communityRole,
    ).toBe('user');
    expect(await dataSource.getRepository(AdminAuditLog).count()).toBe(0);
  });

  async function activeUser(email: string): Promise<User> {
    return dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        email,
        emailNormalized: email,
        passwordHash: 'unused',
        displayName: 'Role Target',
        publicId: randomUUID(),
        accountStatus: 'active',
        socialVerificationStatus: 'verified',
        communityRole: 'user',
        emailVerifiedAt: new Date(),
        passwordChangedAt: new Date(),
        onboardingCompleted: true,
      }),
    );
  }
});
