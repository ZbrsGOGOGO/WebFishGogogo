import { useEffect, useState } from 'react';
import type { ArcadeGameKey, PlayCatalog } from '@stealth-reader/shared';

import { communityGameRoomsApi } from '../../../api/community-game-rooms';

export const GAME_KEYS: readonly ArcadeGameKey[] = ['snake', 'tetris', 'tank', 'zhesi', 'draw', 'undercover'];
export const GAME_NAMES: Record<ArcadeGameKey, string> = { snake: '贪食蛇', tetris: '俄罗斯方块', tank: '坦克大战', zhesi: '遮司', draw: '你画我猜', undercover: '谁是卧底' };
export const PRACTICE_PATHS: Partial<Record<ArcadeGameKey, string>> = { snake: '/games/snake', tetris: '/games/tetris', tank: '/games/tank', zhesi: '/games/zhesi' };
export const ROOM_STATUS = { waiting: '等待加入', running: '进行中', finished: '已结算', closed: '已关闭' } as const;

export function gameKeyFrom(value: string | null | undefined): ArcadeGameKey | undefined {
  return GAME_KEYS.includes(value as ArcadeGameKey) ? value as ArcadeGameKey : undefined;
}

export function usePlayCatalog() {
  const [catalog, setCatalog] = useState<PlayCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    void communityGameRoomsApi.catalog(controller.signal).then((result) => { if (active) { setCatalog(result); setError(null); } }).catch((reason: unknown) => { if (active && !controller.signal.aborted) setError(reason instanceof Error ? reason.message : '游戏目录暂时无法读取。'); });
    return () => { active = false; controller.abort(); };
  }, [revision]);
  return { catalog, error, retry: () => setRevision((value) => value + 1) };
}
