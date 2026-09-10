import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { FISH_RULES, type FishProgressView } from '@stealth-reader/shared';
import { communityProgressionApi } from '../../api/community-progression';
import { COMMUNITY_FEATURE_FLAGS } from '../../app/community-nav';
import { useCommunityAuthStore } from '../../app/store/community-auth-store';
import { useBallpointWindow } from '../games/ballpoint-breach/BallpointWindow';

export const FISH_EVENT = 'community:fish-progress';
export type FishEventDetail = { owner: string; progress: FishProgressView };
export const isFishGamePath = (path: string): boolean => !/\/(?:leaderboards?|rooms)\/?$|\/leaderboards?\//.test(path) && /^\/(?:games\/(?!rooms\/?$)[^/]+|tower-defense(?:\/|$))/.test(path);

/** Coarse activity totals only. No keystrokes, URLs, chat contents or client-supplied durations are sent. */
export function useFishActivity(): void {
  const { isOpen, isPlaying } = useBallpointWindow();
  const floating = useRef({ isOpen, isPlaying }); floating.current = { isOpen, isPlaying };
  const phase = useCommunityAuthStore(s => s.phase), owner = useCommunityAuthStore(s => s.user?.publicId);
  const location = useLocation(), path = useRef(location.pathname); path.current = location.pathname;
  const boundary = useRef<(() => void) | null>(null);
  const signature = `${location.pathname}:${isOpen}:${isPlaying}`;
  const previousSignature = useRef(signature);
  useEffect(() => {
    if (previousSignature.current !== signature) boundary.current?.();
    previousSignature.current = signature;
  }, [signature]);
  useEffect(() => {
    if (phase !== 'active' || !owner || !COMMUNITY_FEATURE_FLAGS.communityProgressionEnabled) return;
    const controller = new AbortController(), tabId = crypto.randomUUID();
    let sequence = 0, lastActivity = Date.now(), busy = false, paused = false, needsPause = false;
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;
    const activity = (event: Event): void => { if (event.isTrusted) lastActivity = Date.now(); };
    const frameWindows = new Set<Window>();
    const connectFrames = (): void => {
      for (const frame of document.querySelectorAll('iframe')) {
        try {
          const target = frame.contentWindow;
          if (!target || !frame.contentDocument || frameWindows.has(target)) continue;
          for (const event of events) target.addEventListener(event, activity, { passive: true });
          frameWindows.add(target);
        } catch { /* Cross-origin embeds do not contribute input activity. */ }
      }
    };
    const tick = async (): Promise<void> => {
      if (busy || controller.signal.aborted) return;
      connectFrames();
      const active = !needsPause && !document.hidden && document.hasFocus() && Date.now() - lastActivity < FISH_RULES.idleSeconds * 1000;
      if (!active && paused) { needsPause = false; return; }
      busy = true;
      try {
        const covered = !!document.querySelector('[data-activity-covered="true"]');
        const game = !covered && (floating.current.isPlaying || (!floating.current.isOpen && path.current !== '/games/ballpoint-breach' && isFishGamePath(path.current)));
        const progress = await communityProgressionApi.heartbeat({ tabId, sequence: ++sequence, mode: !active ? 'pause' : game ? 'game' : 'browse' }, controller.signal);
        paused = !active;
        if (!active) needsPause = false;
        if (!controller.signal.aborted && useCommunityAuthStore.getState().user?.publicId === owner && useCommunityAuthStore.getState().phase === 'active') window.dispatchEvent(new CustomEvent<FishEventDetail>(FISH_EVENT, { detail: { owner, progress } }));
      } catch { /* No optimistic XP, replay queue or offline catch-up. Retry next bounded heartbeat. */ }
      finally { busy = false; }
    };
    for (const event of events) window.addEventListener(event, activity, { passive: true });
    const visibility = (): void => { if (document.hidden || !document.hasFocus()) needsPause = true; void tick(); };
    const pauseBoundary = (): void => { needsPause = true; void tick(); };
    boundary.current = pauseBoundary;
    const observer = new MutationObserver(records => { if (records.some(r => r.type === 'attributes' && r.attributeName === 'data-activity-covered')) pauseBoundary(); });
    observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['data-activity-covered'] });
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('blur', visibility); window.addEventListener('focus', visibility);
    const timer = window.setInterval(() => { void tick(); }, FISH_RULES.heartbeatSeconds * 1000);
    void tick();
    return () => {
      controller.abort(); window.clearInterval(timer);
      observer.disconnect(); boundary.current = null;
      for (const event of events) window.removeEventListener(event, activity);
      for (const frame of frameWindows) for (const event of events) { try { frame.removeEventListener(event, activity); } catch { /* Detached frame. */ } }
      document.removeEventListener('visibilitychange', visibility); window.removeEventListener('blur', visibility); window.removeEventListener('focus', visibility);
    };
  }, [phase, owner]);
}

/** Mounted once above every community route, including standalone tools/games. */
export function CommunityActivityTracker(): null { useFishActivity(); return null; }
