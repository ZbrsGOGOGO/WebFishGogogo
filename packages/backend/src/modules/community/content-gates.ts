import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

export function assertCommunityContentEnabled(): void {
  if (communityContentEnabled()) return;
  throw new ServiceUnavailableException({ code: 'COMMUNITY_CONTENT_DISABLED' });
}

export function communityContentEnabled(): boolean {
  const configured = process.env.FEATURE_COMMUNITY_CONTENT_ENABLED;
  return (
    configured === 'true' ||
    (configured === undefined && process.env.LOCAL_DEV === 'true')
  );
}

export function assertContentWritesEnabled(): void {
  assertCommunityContentEnabled();
  if (contentWritesEnabled()) return;
  throw new ServiceUnavailableException({ code: 'CONTENT_WRITES_DISABLED' });
}

export function contentWritesEnabled(): boolean {
  const configured = process.env.FEATURE_CONTENT_WRITES_ENABLED;
  return (
    configured === 'true' ||
    (configured === undefined && process.env.LOCAL_DEV === 'true')
  );
}

export function assertModerationOperationsEnabled(): void {
  assertCommunityContentEnabled();
  if (moderationOperationsEnabled()) return;
  throw new ServiceUnavailableException({
    code: 'MODERATION_OPERATIONS_DISABLED',
  });
}

export function moderationOperationsEnabled(): boolean {
  const configured = process.env.FEATURE_MODERATION_OPERATIONS_ENABLED;
  return (
    configured === 'true' ||
    (configured === undefined && process.env.LOCAL_DEV === 'true')
  );
}

@Injectable()
export class CommunityContentFeatureGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    assertCommunityContentEnabled();
    return true;
  }
}
