import { chatException } from './chat.errors';

function enabled(name: string): boolean {
  const value = process.env[name];
  if (value === 'true') return true;
  if (value === 'false') return false;
  return process.env.LOCAL_DEV === 'true';
}

export function isCommunityChatEnabled(): boolean {
  return enabled('FEATURE_COMMUNITY_CHAT_ENABLED');
}

export function isChatWritesEnabled(): boolean {
  return enabled('FEATURE_CHAT_WRITES_ENABLED');
}

export function isChatSocialVerificationRequired(): boolean {
  return process.env.FEATURE_SOCIAL_VERIFICATION_ENABLED === 'true';
}

export function assertCommunityChatEnabled(): void {
  if (!isCommunityChatEnabled()) {
    throw chatException('CHAT_DISABLED', '聊天室暂未开放。', 404);
  }
}

export function assertChatWritesEnabled(): void {
  if (!isChatWritesEnabled()) {
    throw chatException('CHAT_ROOM_READ_ONLY', '聊天室当前为只读状态。', 503);
  }
}
