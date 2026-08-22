import { DataSource } from 'typeorm';

import { AppDataSource } from '../database/data-source';
import { AdminAuditLog } from '../database/entities/admin-audit-log.entity';
import { User } from '../database/entities/user.entity';

type AssignableCommunityRole = 'moderator' | 'admin';

export interface CommunityRoleAssignmentInput {
  publicId: string;
  role: AssignableCommunityRole;
  confirmation: string;
  reason: string;
}

export interface CommunityRoleAssignmentResult {
  publicId: string;
  previousRole: User['communityRole'];
  role: AssignableCommunityRole;
  changed: boolean;
}

/**
 * Offline-only bootstrap/assignment primitive. It deliberately accepts an exact
 * publicId and has no email/phone lookup path. No controller exposes this code.
 */
export async function assignCommunityRole(
  dataSource: DataSource,
  input: CommunityRoleAssignmentInput,
): Promise<CommunityRoleAssignmentResult> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.publicId)) {
    throw new Error('COMMUNITY_ROLE_TARGET_PUBLIC_ID must be an exact UUID');
  }
  if (input.role !== 'moderator' && input.role !== 'admin') {
    throw new Error('COMMUNITY_ROLE_TARGET_ROLE must be moderator or admin');
  }
  const expectedConfirmation = `ASSIGN:${input.publicId}:${input.role}`;
  if (input.confirmation !== expectedConfirmation) {
    throw new Error(`COMMUNITY_ROLE_CONFIRMATION must exactly equal ${expectedConfirmation}`);
  }
  const reason = input.reason.trim().normalize('NFC');
  if ([...reason].length < 5 || [...reason].length > 500) {
    throw new Error('COMMUNITY_ROLE_REASON must contain 5 to 500 characters');
  }

  return dataSource.transaction(async (manager) => {
    const users = manager.getRepository(User);
    const target = await users.findOne({
      where: { publicId: input.publicId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!target || target.accountStatus !== 'active') {
      throw new Error('Active user with exact publicId was not found');
    }
    const previousRole = target.communityRole;
    if (previousRole === input.role) {
      return {
        publicId: target.publicId,
        previousRole,
        role: input.role,
        changed: false,
      };
    }

    target.communityRole = input.role;
    await users.save(target);
    await manager.getRepository(AdminAuditLog).save(
      manager.getRepository(AdminAuditLog).create({
        // The first privileged assignment cannot honestly name a privileged
        // user actor. Record the offline operator as system instead of making
        // the target appear to have granted privileges to itself.
        actorId: null,
        actorRole: 'system',
        action: 'community_role.offline_assignment',
        targetType: 'user',
        targetId: target.id,
        reason,
        requestId: `offline-role:${target.publicId}:${input.role}`,
        previousState: {
          communityRole: previousRole,
          assignmentMode: 'offline_operator',
        },
        nextState: {
          communityRole: input.role,
          assignmentMode: 'offline_operator',
        },
      }),
    );
    return {
      publicId: target.publicId,
      previousRole,
      role: input.role,
      changed: true,
    };
  });
}

export function assignmentInputFromEnvironment(
  env: NodeJS.ProcessEnv,
): CommunityRoleAssignmentInput {
  const role = env.COMMUNITY_ROLE_TARGET_ROLE;
  return {
    publicId: env.COMMUNITY_ROLE_TARGET_PUBLIC_ID ?? '',
    role: role as AssignableCommunityRole,
    confirmation: env.COMMUNITY_ROLE_CONFIRMATION ?? '',
    reason: env.COMMUNITY_ROLE_REASON ?? '',
  };
}

async function main(): Promise<void> {
  await AppDataSource.initialize();
  try {
    const result = await assignCommunityRole(
      AppDataSource,
      assignmentInputFromEnvironment(process.env),
    );
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await AppDataSource.destroy();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Community role assignment failed';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
