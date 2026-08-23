import { useCallback, useRef, useState } from 'react';

import { finishArcadeRun, startArcadeRun, type ArcadeGameKey, type ArcadeRun } from '../../api/community-arcade';
import { useCommunityAuthStore } from '../../app/store/community-auth-store';

export function useArcadeRun(gameKey: ArcadeGameKey) {
  const signedIn = useCommunityAuthStore((state) => state.phase === 'active');
  const runPromise = useRef<Promise<ArcadeRun | null> | null>(null);
  const finished = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  const begin = useCallback(() => {
    finished.current = false;
    setNotice(null);
    runPromise.current = signedIn
      ? startArcadeRun(gameKey).catch(() => {
          setNotice('本局可以继续游玩，成绩暂未接入排行榜。');
          return null;
        })
      : Promise.resolve(null);
  }, [gameKey, signedIn]);

  const finish = useCallback(async (score: number, metrics: Record<string, unknown>) => {
    if (finished.current) return;
    finished.current = true;
    const run = await runPromise.current;
    if (!run) return;
    try {
      const result = await finishArcadeRun(run.runId, score, metrics);
      setNotice(
        result.isPersonalBest
          ? `新纪录！当前排名第 ${result.rank} 名。`
          : `本局 ${result.score} 分，个人最佳 ${result.bestScore} 分。`,
      );
      setRevision((value) => value + 1);
    } catch {
      setNotice('本局成绩未能进入排行榜，请再挑战一次。');
    }
  }, []);

  return { begin, finish, notice, revision, signedIn };
}
