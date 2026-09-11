import { useCallback, useEffect, useRef, useState } from 'react';
import type { OfficeReliefReceipt } from '@stealth-reader/shared';
import { getCommunitySessionGeneration } from '../../api/community-http';
import { useCommunityAuthStore } from '../../app/store/community-auth-store';

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };
type Voice = { oscillator: OscillatorNode; gain: GainNode };
const getAudio = (): typeof AudioContext | undefined => window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
const PLAY_RESULTS = new Set(['coin', 'loss', 'title', 'tower_material', 'farm_crop', 'tower_book']);

/** Opt-in local tones only: no media assets, microphone, background audio or replay queue. */
export function useOfficeBossSound({ owner, generation, covered, active, receipt }: {
  owner: string;
  generation: number;
  covered: boolean;
  active: boolean;
  receipt: OfficeReliefReceipt | null;
}) {
  const [enabled, setEnabled] = useState(false), [starting, setStarting] = useState(false), [error, setError] = useState('');
  const context = useRef<AudioContext | null>(null), voices = useRef(new Set<Voice>());
  const enabledRef = useRef(false), epoch = useRef(0), mounted = useRef(false);
  const startupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenReceipt = useRef(receipt?.requestId ?? null);
  const boundary = useRef({ owner, generation, covered, active });
  boundary.current = { owner, generation, covered, active };
  const available = Boolean(getAudio()) && !error;
  const allowed = useCallback((): boolean => {
    const latest = boundary.current, auth = useCommunityAuthStore.getState();
    return mounted.current && latest.active && !latest.covered && !document.hidden && document.hasFocus()
      && getCommunitySessionGeneration() === latest.generation && auth.phase === 'active' && auth.user?.publicId === latest.owner;
  }, []);
  const release = useCallback((): void => {
    ++epoch.current;
    if (startupTimer.current !== null) { clearTimeout(startupTimer.current); startupTimer.current = null; }
    enabledRef.current = false;
    for (const voice of voices.current) {
      voice.oscillator.onended = null;
      try { voice.oscillator.stop(); } catch { /* Already ended or never started. */ }
      try { voice.oscillator.disconnect(); voice.gain.disconnect(); } catch { /* Already disconnected. */ }
    }
    voices.current.clear();
    const previous = context.current;
    context.current = null;
    try { if (previous && previous.state !== 'closed') void previous.close().catch(() => {}); } catch { /* Audio support must not break the activity. */ }
    if (mounted.current) { setEnabled(false); setStarting(false); }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const hide = (): void => { if (document.hidden) release(); };
    window.addEventListener('blur', release); window.addEventListener('pagehide', release); document.addEventListener('visibilitychange', hide);
    return () => {
      mounted.current = false;
      window.removeEventListener('blur', release); window.removeEventListener('pagehide', release); document.removeEventListener('visibilitychange', hide);
      release();
    };
  }, [release]);
  useEffect(() => { release(); }, [owner, generation, release]);
  useEffect(() => { if (covered || !active) release(); }, [covered, active, release]);

  // This function is called only by the explicit sound button. Never construct
  // or resume a context in an effect, on a receipt, or after returning to a tab.
  const toggle = useCallback((): void => {
    if (context.current || enabledRef.current) { release(); return; }
    if (!allowed() || !getAudio()) return;
    const attempt = ++epoch.current;
    setStarting(true); setError('');
    try {
      const Constructor = getAudio()!;
      const next = new Constructor();
      context.current = next;
      // Some browsers leave resume() pending forever when no output device is
      // available. A local deadline must release audio without blocking play.
      startupTimer.current = setTimeout(() => {
        startupTimer.current = null;
        if (attempt !== epoch.current || context.current !== next) return;
        release();
        if (mounted.current) setError('音效启动超时，已保持静音；视觉反馈与挑战不受影响。');
      }, 3000);
      void next.resume().then(() => {
        if (attempt !== epoch.current || context.current !== next || !allowed()) {
          if (context.current === next) release();
          return;
        }
        if (next.state !== 'running') {
          release(); setError('当前浏览器无法开启音效，视觉反馈与挑战不受影响。'); return;
        }
        if (startupTimer.current !== null) { clearTimeout(startupTimer.current); startupTimer.current = null; }
        enabledRef.current = true; setEnabled(true); setStarting(false);
      }).catch(() => {
        if (attempt !== epoch.current || context.current !== next) return;
        release();
        if (mounted.current) setError('当前浏览器无法开启音效，视觉反馈与挑战不受影响。');
      });
    } catch {
      release();
      if (mounted.current) setError('当前浏览器无法开启音效，视觉反馈与挑战不受影响。');
    }
  }, [allowed, release]);

  useEffect(() => {
    if (!receipt || seenReceipt.current === receipt.requestId) return;
    seenReceipt.current = receipt.requestId;
    const kind = receipt.outcome?.kind, audio = context.current;
    if (receipt.replayed || !kind || !PLAY_RESULTS.has(kind) || !enabledRef.current || !audio || !allowed()) return;
    if (audio.state !== 'running') { release(); return; }
    // Soft sine tones under 220ms, peak per voice 0.022. No result is simulated:
    // a matching, new server receipt determines this optional feedback only.
    const frequencies = kind === 'coin' ? [330, 440] : kind === 'loss' ? [180] : [392, 494, 587];
    try {
      frequencies.forEach((frequency, index) => {
        const start = audio.currentTime + index * .055, duration = kind === 'loss' ? .12 : .075;
        const oscillator = audio.createOscillator(), gain = audio.createGain();
        const voice = { oscillator, gain }; voices.current.add(voice);
        oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(frequency, start);
        if (kind === 'loss') oscillator.frequency.linearRampToValueAtTime(140, start + duration);
        gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(.022, start + .012); gain.gain.linearRampToValueAtTime(0, start + duration);
        oscillator.connect(gain); gain.connect(audio.destination);
        oscillator.onended = () => { voices.current.delete(voice); try { oscillator.disconnect(); gain.disconnect(); } catch { /* A closed device may already have detached nodes. */ } };
        oscillator.start(start); oscillator.stop(start + duration + .008);
      });
    } catch {
      release();
      if (mounted.current) setError('音效暂时不可用，已静音；本次挑战结果仍然有效。');
    }
  }, [receipt, allowed, release]);
  return { available, enabled, starting, toggle, message: error || (!getAudio() ? '当前浏览器不支持音效，视觉反馈与挑战不受影响。' : '') };
}
