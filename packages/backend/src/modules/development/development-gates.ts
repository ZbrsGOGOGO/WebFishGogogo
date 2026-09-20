import { ServiceUnavailableException } from '@nestjs/common';
import type { DevelopmentAiAccess } from '@stealth-reader/shared';

const GROQ_FREE_MODEL = 'openai/gpt-oss-20b' as const;

export function developmentAiAccess(): DevelopmentAiAccess {
  const key = process.env.GROQ_API_KEY?.trim() ?? '';
  return {
    enabled:
      process.env.FEATURE_DEVELOPMENT_AI_ENABLED === 'true' &&
      key.length >= 24,
    provider: 'groq-free',
    model: GROQ_FREE_MODEL,
    userDailyLimit: 20,
    siteDailyLimit: 200,
    sendsAttachments: false,
  };
}

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
