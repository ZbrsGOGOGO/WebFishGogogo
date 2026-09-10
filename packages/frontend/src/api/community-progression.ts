import type { CommunityAchievementRefreshReceipt, CommunityProgressionCatalog, CommunityProgressionView, CommunityTitleInput, CommunityTitleReceipt, FishHeartbeatInput, FishProgressView, SupportAdminView, SupportGrantInput } from '@stealth-reader/shared';
import { CommunityApiError, communityHttp } from './community-http';

const ROOT = '/v1/community/progression';
export const communityProgressionApi = {
  catalog: (signal?: AbortSignal): Promise<CommunityProgressionCatalog> => communityHttp.get(`${ROOT}/catalog`, { auth: false, signal }),
  me: (signal?: AbortSignal): Promise<CommunityProgressionView> => communityHttp.get(`${ROOT}/me`, { signal }),
  refresh: (signal?: AbortSignal): Promise<CommunityAchievementRefreshReceipt> => communityHttp.post(`${ROOT}/refresh`, {}, { signal, retryAfterRefresh: false }),
  title: (input: CommunityTitleInput, signal?: AbortSignal): Promise<CommunityTitleReceipt> => communityHttp.post(`${ROOT}/title`, input, { signal, retryAfterRefresh: false }),
  heartbeat: (input: FishHeartbeatInput, signal?: AbortSignal): Promise<FishProgressView> => communityHttp.post(`${ROOT}/heartbeat`, input, { signal, retryAfterRefresh: false }),
  supportAdmin: (offset = 0, signal?: AbortSignal): Promise<SupportAdminView> => communityHttp.get(`${ROOT}/support/admin?offset=${offset}`, { signal }),
  supportGrant: (input: SupportGrantInput): Promise<{ replayed: boolean; id: string }> => communityHttp.post(`${ROOT}/support/admin`, input, { retryAfterRefresh: false }),
  supportRevoke: (id: string): Promise<{ revoked: true }> => communityHttp.post(`${ROOT}/support/admin/${encodeURIComponent(id)}/revoke`, { confirmed: true }, { retryAfterRefresh: false }),
};
export function progressionErrorCode(error: unknown): string {
  return error instanceof CommunityApiError && error.body && typeof error.body === 'object' && 'code' in error.body ? String(error.body.code) : '';
}
export function progressionUncertain(error: unknown): boolean {
  return !['PROGRESSION_DISABLED', 'COMMUNITY_WRITES_DISABLED'].includes(progressionErrorCode(error)) && (!(error instanceof CommunityApiError) || error.status === 0 || error.status >= 500);
}
export function progressionErrorMessage(error: unknown, mutation = false): string {
  const messages: Record<string, string> = {
    PROGRESSION_DISABLED: '成长档案暂未开放。', COMMUNITY_WRITES_DISABLED: '当前维护只读，暂不能同步成就或更换称号。',
    PROGRESSION_VERSION_CONFLICT: '佩戴状态已经变化，请同步后重新选择。', TITLE_NOT_UNLOCKED: '该称号尚未解锁，请先同步成就进度。',
    TITLE_UNCHANGED: '当前已经是这个佩戴状态，无需重复提交。', PROGRESSION_IDEMPOTENCY_CONFLICT: '操作编号与内容不一致，请同步后重新选择。',
    PROGRESSION_REQUEST_INVALID: '提交内容无效，请检查后重试。',
    SUPPORT_INPUT_INVALID: '请填写正确的登录账号、订单号、1–12 个月和人民币金额，并确认已核验。',
    SUPPORT_USER_NOT_FOUND: '没有找到这个正常状态的登录账号；请核对账号而不是昵称。',
    SUPPORT_ORDER_DUPLICATE: '这个爱发电订单已登记（包括已作废记录），不会重复发放。',
    SUPPORT_REQUEST_CONFLICT: '操作编号与原登记不一致，请先核对历史记录。',
  };
  const code = progressionErrorCode(error);
  if (messages[code]) return messages[code];
  if (error instanceof CommunityApiError && error.status === 401) return '登录已失效，请重新登录。';
  if (error instanceof CommunityApiError && error.status === 429) return '操作较快，请稍后重试。';
  if (error instanceof CommunityApiError && error.status === 403) return '当前账号不能进行此操作。';
  return mutation && progressionUncertain(error) ? '连接中断，尚不能确定上次操作是否完成，请确认原操作。' : '资料暂时无法同步，请稍后重试。';
}
