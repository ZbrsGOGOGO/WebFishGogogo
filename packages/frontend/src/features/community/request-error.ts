import { CommunityApiError } from '../../api/community';

export function communityRequestErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (error instanceof CommunityApiError) {
    const body = error.body && typeof error.body === 'object'
      ? error.body as Record<string, unknown>
      : undefined;
    if (error.status === 409 && body?.code === 'OFFICE_COIN_INSUFFICIENT') {
      const { required, current } = body;
      if (
        typeof required === 'number' && Number.isSafeInteger(required) &&
        typeof current === 'number' && Number.isSafeInteger(current) &&
        current >= 0 && required > current
      ) {
        return `办公币不足：需要 ${required} 办公币，当前 ${current}，还差 ${required - current}。请换低成本作物，或获取办公币后再试。`;
      }
      return '办公币不足，请换低成本作物，或获取办公币后再试。';
    }
    if (error.status === 409 && body?.code === 'PLANT_NOT_READY') {
      return '作物尚未成熟，请等待倒计时结束后再收获。';
    }
    if (error.status === 409 && body?.code === 'FARM_VERSION_CONFLICT') {
      return '农场状态已更新，请刷新农场后再试。';
    }
    if (error.status === 404 && body?.code === 'PLANT_CYCLE_NOT_FOUND') {
      return '当前没有可收获的作物，请刷新农场后开始种植。';
    }
    if (error.status === 0) return '网络连接失败，请检查网络后重试';
    if (error.status === 401) return '登录状态已失效，请重新登录后继续';
    if (error.status === 403) return '你没有权限查看或执行此操作';
    if (error.status === 404) return '没有找到对应的用户或记录';
    if (error.status === 409) return '状态已经变化，请刷新后重试';
    if (error.status === 429) return '操作过于频繁，请稍后再试';
  }
  return error instanceof Error && error.message ? error.message : fallback;
}
