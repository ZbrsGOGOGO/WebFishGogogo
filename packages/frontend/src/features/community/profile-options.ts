export const COMMUNITY_AVATARS = [
  { id: 'violet', mark: 'Z', label: '紫色工牌' },
  { id: 'green', mark: '芽', label: '绿色工位' },
  { id: 'orange', mark: '咖', label: '咖啡时刻' },
  { id: 'blue', mark: '云', label: '蓝色协作' },
  { id: 'rose', mark: '光', label: '玫色灵感' },
] as const;

export function communityAvatarMark(avatarKey: string | undefined): string {
  return COMMUNITY_AVATARS.find((avatar) => avatar.id === avatarKey)?.mark ?? 'Z';
}
