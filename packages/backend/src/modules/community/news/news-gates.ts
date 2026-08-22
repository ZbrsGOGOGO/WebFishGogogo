import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

/** News is fail-closed everywhere. Local development must opt in explicitly. */
export function communityNewsEnabled(): boolean {
  return process.env.FEATURE_COMMUNITY_NEWS_ENABLED === 'true';
}

export function newsAdminEnabled(): boolean {
  return process.env.FEATURE_NEWS_ADMIN_ENABLED === 'true';
}

export function assertCommunityNewsEnabled(): void {
  if (!communityNewsEnabled()) {
    throw new ServiceUnavailableException({ code: 'COMMUNITY_NEWS_DISABLED' });
  }
}

export function assertNewsAdminEnabled(): void {
  assertCommunityNewsEnabled();
  if (!newsAdminEnabled()) {
    throw new ServiceUnavailableException({ code: 'NEWS_ADMIN_DISABLED' });
  }
}

@Injectable()
export class CommunityNewsFeatureGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    assertCommunityNewsEnabled();
    return true;
  }
}

@Injectable()
export class NewsAdminFeatureGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    assertNewsAdminEnabled();
    return true;
  }
}
