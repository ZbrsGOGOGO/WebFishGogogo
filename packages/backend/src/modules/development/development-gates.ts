import { ServiceUnavailableException } from '@nestjs/common';

/** Private workspace is fail-closed in every environment. */
export function developmentWorkspaceEnabled(): boolean {
  return process.env.FEATURE_DEVELOPMENT_WORKSPACE_ENABLED === 'true';
}

export function assertDevelopmentWorkspaceEnabled(): void {
  if (!developmentWorkspaceEnabled()) {
    throw new ServiceUnavailableException({
      code: 'DEVELOPMENT_WORKSPACE_DISABLED',
    });
  }
}
