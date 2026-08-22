import { CommunityApiError } from '../../api/community';

export function communityRequestErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (error instanceof CommunityApiError) {
    if (error.status === 0) return '网络连接失败，请检查网络后重试';
    if (error.status === 401) return '登录状态已失效，请重新登录后继续';
    if (error.status === 403) return '你没有权限查看或执行此操作';
    if (error.status === 404) return '没有找到对应的用户或记录';
    if (error.status === 409) return '状态已经变化，请刷新后重试';
    if (error.status === 429) return '操作过于频繁，请稍后再试';
  }
  return error instanceof Error && error.message ? error.message : fallback;
}
