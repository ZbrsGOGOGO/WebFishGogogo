import { useEffect, useRef, useState } from 'react';
import type { Game } from './runtime/game/Game';
import { announceLocalGameForeground } from '../game-input';
import './ballpoint-breach.css';

export type BallpointBreachStatus = 'idle' | 'playing' | 'paused' | 'unavailable';
export interface BallpointBreachGameProps {
  active?: boolean;
  onStatusChange?: (status: BallpointBreachStatus) => void;
  onPrivacyPause?: () => void;
}

/** Local-only single-player canvas. Parent owns the window, route and privacy cover. */
export function BallpointBreachGame({ active = true, onStatusChange, onPrivacyPause }: BallpointBreachGameProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const callbackRef = useRef(onStatusChange);
  const privacyCallbackRef = useRef(onPrivacyPause);
  const activeRef = useRef(active);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [attempt, setAttempt] = useState(0);
  callbackRef.current = onStatusChange;
  privacyCallbackRef.current = onPrivacyPause;
  activeRef.current = active;

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    let cancelled = false;
    let instance: Game | null = null;
    setPhase('loading');
    const unavailable = () => {
      if (cancelled) return;
      instance?.dispose();
      instance = null;
      gameRef.current = null;
      setPhase('unavailable');
      callbackRef.current?.('unavailable');
    };
    const contextLost = (event: Event) => {
      event.preventDefault();
      unavailable();
    };
    canvas.addEventListener('webglcontextlost', contextLost);
    void import('./runtime/game/Game').then(({ Game: Runtime }) => {
      if (cancelled) return;
      try {
        instance = new Runtime(canvas, {
          root,
          onPrivacyPause: () => privacyCallbackRef.current?.(),
          onModeChange: (mode) => {
            if (cancelled) return;
            if (mode === 'playing') announceLocalGameForeground('ballpoint');
            callbackRef.current?.(mode === 'playing' ? 'playing' : mode === 'start' ? 'idle' : 'paused');
          },
        });
        gameRef.current = instance;
        instance.setActive(activeRef.current);
        setPhase('ready');
      } catch {
        // Constructor failures must not retain an incomplete WebGL context.
        try { canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* unavailable */ }
        unavailable();
      }
    }).catch(unavailable);
    return () => {
      cancelled = true;
      canvas.removeEventListener('webglcontextlost', contextLost);
      instance?.dispose();
      if (gameRef.current === instance) gameRef.current = null;
    };
  }, [attempt]);

  useEffect(() => { gameRef.current?.setActive(active); }, [active]);

  return (
    <div className="ballpointSurface" ref={rootRef} data-active={active} aria-label="纸上突围，本地单机静音练习">
      <canvas key={attempt} ref={canvasRef} tabIndex={0} data-exclusive-game-input="ballpoint" aria-label="纸上突围游戏画布，WASD 移动，Esc 暂停" />
      <div data-bp="paper-lines" aria-hidden="true" />
      <div data-bp="vignette" aria-hidden="true" />
      <section data-bp="hud" aria-label="本轮状态">
        <div className="bp-score">本轮 <strong data-hud="score">0</strong></div>
        <div className="bp-wave"><strong data-hud="wave">第 1 轮</strong><small data-hud="enemies">剩余 0</small></div>
        <div data-bp="boss-health"><strong data-hud="boss-name">涂鸦大师</strong><i data-hud="boss-bar" /></div>
        <div className="bp-health"><span>状态</span><i data-hud="health-bar" /><b data-hud="health">100</b></div>
        <div className="bp-ammo"><strong data-hud="ammo">30</strong><span data-hud="reserve">/150</span></div>
        <div className="bp-weapons">
          <ol>{['步枪', '霰弹', '左轮', '狙击', '太刀'].map((weapon, index) => (
            <li key={weapon} data-weapon-slot={index + 1}><span>{weapon}</span><em data-weapon-ammo="" /></li>
          ))}</ol>
          <strong data-hud="weapon-name">步枪</strong><small data-hud="weapon-description">1–5 切换</small>
        </div>
        <div className="bp-ability"><span>Q · 抓钩</span><i data-hud="grapple-bar" /></div>
        <div data-bp="block-stamina" className="bp-ability"><span>格挡</span><i data-hud="block-bar" /></div>
        <div data-bp="context-tip" />
        <div data-bp="wave-banner"><strong data-bp="wave-banner-title" /><span data-bp="wave-banner-subtitle" /></div>
        <div className="bp-crosshair" aria-hidden="true"><i /><i /><i /><i /></div>
        <div data-bp="hit-marker" aria-hidden="true">×</div>
        <div data-bp="damage-indicator" aria-hidden="true" />
        <div data-bp="scope-overlay" aria-hidden="true"><div className="bp-scope-reticle" /></div>
      </section>
      <button className="bp-pause" type="button" onClick={() => gameRef.current?.pause()} title="暂停并释放鼠标">暂停</button>
      <section data-bp="game-overlay" className="visible" data-mode="loading" aria-label="练习控制">
        <div className="bp-overlay-card">
          <p className="bp-eyebrow">工作稿 / BALLPOINT BREACH</p>
          <h2 data-bp="overlay-title">纸上突围</h2>
          <p data-bp="overlay-copy">正在整理工作稿…</p>
          <button data-bp="start-button" type="button" disabled>开始练习</button>
          <button data-bp="restart-button" type="button" hidden>重新开始</button>
          <p className="bp-controls">WASD 移动 · 鼠标转向 / 左键攻击<br />右键瞄准 · 1–5 切换 · R 装填 · Q 抓钩<br />Shift 加速 · 空格跳跃 · Esc 暂停</p>
          <small>需键盘和鼠标 · 本轮不计办公币与排行榜</small>
        </div>
      </section>
      <div data-bp="stage">本地单机 / 静音</div>
      {phase === 'loading' && <div className="bp-fallback" role="status">正在整理工作稿…</div>}
      {phase === 'unavailable' && <div className="bp-fallback" role="status">
        <h2>暂时无法打开工作稿</h2>
        <p>此浏览器未提供可用的 WebGL 2，或图形资源已中断。其他网站功能不受影响。</p>
        <p>可在开启硬件加速的桌面浏览器中重试。</p>
        <button type="button" onClick={() => setAttempt(value => value + 1)}>重新尝试</button>
      </div>}
    </div>
  );
}

export default BallpointBreachGame;
