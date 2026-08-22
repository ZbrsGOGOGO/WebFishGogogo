export function communityFarmRemainingSeconds(
  maturesAt: string | null,
  serverOffsetMs: number,
  clientNowMs: number,
): number | null {
  if (!maturesAt) return null;
  const matureMs = Date.parse(maturesAt);
  if (!Number.isFinite(matureMs)) return null;
  return Math.max(0, Math.ceil((matureMs - (clientNowMs + serverOffsetMs)) / 1000));
}

export function formatCommunityFarmDuration(seconds: number | null): string {
  if (seconds == null) return '等待服务端时间';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours > 0) return `${hours}小时 ${minutes}分`;
  if (minutes > 0) return `${minutes}分 ${rest}秒`;
  return `${rest}秒`;
}
