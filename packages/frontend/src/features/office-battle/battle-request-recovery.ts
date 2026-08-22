import {
  CommunityApiError,
  type CommunityBattleRequest,
  type CommunityBattleSettlement,
} from '../../api/community';

/**
 * 对战 POST 超时后先按不可变 battleRequestId 查单。只有服务端明确返回 404，
 * 才用完全相同的请求体和幂等键重发一次；401、409 和其他错误均不重放。
 */
export async function submitBattleWithRecovery(
  request: Readonly<CommunityBattleRequest>,
  submit: (
    exactRequest: CommunityBattleRequest,
  ) => Promise<CommunityBattleSettlement>,
  lookup: (battleRequestId: string) => Promise<CommunityBattleSettlement>,
): Promise<CommunityBattleSettlement> {
  try {
    return await submit(request);
  } catch (error) {
    if (!(error instanceof CommunityApiError) || error.status !== 0) throw error;
  }

  try {
    return await lookup(request.battleRequestId);
  } catch (lookupError) {
    if (!(lookupError instanceof CommunityApiError) || lookupError.status !== 404) {
      throw lookupError;
    }
  }

  return submit(request);
}
