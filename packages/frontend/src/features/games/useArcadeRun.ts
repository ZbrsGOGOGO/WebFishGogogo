import { useCallback, useEffect, useRef, useState } from 'react';

import {
  useArcadeAdapter,
  type ArcadeGameKey,
  type ArcadeRun,
} from './ArcadeAdapter';

export function useArcadeRun(gameKey: ArcadeGameKey) {
  const adapter = useArcadeAdapter();
  const signedIn = adapter?.signedIn ?? false;
  const currentRun = useRef<{
    promise: Promise<ArcadeRun | null>;
    finished: boolean;
  } | null>(null);
  const startQueue = useRef<Promise<ArcadeRun | null> | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    currentRun.current = null;
    setNotice(null);
    return () => { currentRun.current = null; };
  }, [adapter, gameKey]);

  const begin = useCallback(() => {
    const run = { promise: Promise.resolve<ArcadeRun | null>(null), finished: false };
    currentRun.current = run;
    setNotice(null);
    if (adapter && signedIn) {
      const request = async (): Promise<ArcadeRun | null> => {
        if (currentRun.current !== run) return null;
        try {
          return await adapter.startRun(gameKey);
        } catch {
          if (currentRun.current === run) {
            setNotice('本局可以继续游玩，成绩暂未接入排行榜。');
          }
          return null;
        }
      };
      // A new server run expires the previous one. Preserve request order so
      // an older, slower start cannot invalidate the player's current run.
      run.promise = startQueue.current ? startQueue.current.then(request) : request();
      startQueue.current = run.promise;
      void run.promise.then(() => {
        if (startQueue.current === run.promise) startQueue.current = null;
      });
    }
  }, [adapter, gameKey, signedIn]);

  const finish = useCallback(async (score: number, metrics: Record<string, unknown>) => {
    const pending = currentRun.current;
    if (!pending || pending.finished) return;
    pending.finished = true;
    const run = await pending.promise;
    if (!adapter || !run || currentRun.current !== pending) return;
    try {
      const result = await adapter.finishRun(run.runId, score, metrics);
      if (currentRun.current !== pending) return;
      setNotice(
        result.isPersonalBest
          ? `新纪录！当前排名第 ${result.rank} 名。`
          : `本局 ${result.score} 分，个人最佳 ${result.bestScore} 分。`,
      );
      setRevision((value) => value + 1);
    } catch {
      if (currentRun.current !== pending) return;
      setNotice('本局成绩未能进入排行榜，请再挑战一次。');
    }
  }, [adapter]);

  return { begin, finish, notice, revision, signedIn };
}
