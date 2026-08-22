import { ServiceUnavailableException } from '@nestjs/common';

/** 社区新增写操作在生产必须显式开启；本地开发默认开启。 */
export function assertCommunityWritesEnabled(): void {
  if (communityWritesEnabled()) return;
  throw new ServiceUnavailableException({
    code: 'COMMUNITY_WRITES_DISABLED',
  });
}

export function communityWritesEnabled(): boolean {
  const configured = process.env.FEATURE_COMMUNITY_WRITES_ENABLED;
  return (
    configured === 'true' ||
    (configured === undefined && process.env.LOCAL_DEV === 'true')
  );
}
