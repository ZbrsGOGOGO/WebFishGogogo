import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { COMMUNITY_ACHIEVEMENTS } from '@stealth-reader/shared';
import { useCommunityAuthStore } from '../../app/store/community-auth-store';
import { FISH_EVENT, type FishEventDetail } from '../community-progression/useFishActivity';
import { useBallpointWindow } from '../games/ballpoint-breach/BallpointWindow';
import { DeskPetProvider, useDeskPet } from './DeskPetContext';
import { PetAppearance } from './PetAppearance';
import { petBounds, petFocusPath } from './pet-model';
import styles from './DeskPet.module.css';

export function DeskPetSession({ children }: { children: ReactNode }) {
  const phase = useCommunityAuthStore(s => s.phase);
  const publicId = useCommunityAuthStore(s => s.user?.publicId);
  const owner = phase === 'active' && publicId ? `user:${publicId}` : phase === 'guest' ? 'guest' : 'unavailable';
  return <DeskPetProvider key={owner} owner={owner}>{children}{owner !== 'unavailable' ? <DeskPet /> : null}</DeskPetProvider>;
}

const phrases = ['收到，今天也要劳逸结合。', '我负责可爱，你负责准点下班。', '摸鱼有度，喝口水再继续。', '这不是发呆，是在整理思路。'];
export function DeskPet() {
  const { prefs, update, storageError, owner } = useDeskPet();
  const location = useLocation();
  const { isOpen: paperOpen } = useBallpointWindow();
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [hidden, setHidden] = useState(document.hidden);
  const [message, setMessage] = useState('');
  const [reaction, setReaction] = useState(0);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ id: number; x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false), phrase = useRef(0), lastRank = useRef<number | null>(null);
  const bounds = petBounds(viewport.w, viewport.h, prefs.size);
  const point = prefs.position ?? { x: 1, y: 1 };
  const left = dragPosition?.x ?? bounds.left + point.x * bounds.width;
  const top = dragPosition?.y ?? bounds.top + point.y * bounds.height;
  const clamp = (x: number, y: number) => ({ x: Math.min(bounds.left + bounds.width, Math.max(bounds.left, x)), y: Math.min(bounds.top + bounds.height, Math.max(bounds.top, y)) });
  const savePoint = (x: number, y: number): void => {
    const p = clamp(x, y);
    update({ position: { x: bounds.width ? (p.x - bounds.left) / bounds.width : 0, y: bounds.height ? (p.y - bounds.top) / bounds.height : 0 } });
  };
  useEffect(() => {
    const resize = (): void => { setViewport({ w: window.innerWidth, h: Math.min(window.innerHeight, window.visualViewport?.height ?? window.innerHeight) }); drag.current = null; setDragPosition(null); };
    const visibility = (): void => setHidden(document.hidden);
    window.addEventListener('resize', resize); window.visualViewport?.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', visibility);
    return () => { window.removeEventListener('resize', resize); window.visualViewport?.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(''), 4200);
    return () => window.clearTimeout(timer);
  }, [message, reaction]);
  useEffect(() => {
    const listen = (event: Event): void => {
      const detail = (event as CustomEvent<FishEventDetail>).detail;
      if (!detail || `user:${detail.owner}` !== owner) return;
      const target = COMMUNITY_ACHIEVEMENTS.find(item => item.metric === 'fishExperience' && item.title.key === detail.progress.rank.key)?.target;
      if (target === undefined) return;
      if (lastRank.current !== null && target > lastRank.current && prefs.enabled && !prefs.quiet && !prefs.sleeping) setMessage(`恭喜晋升「${detail.progress.rank.label}」！`);
      lastRank.current = target;
    };
    window.addEventListener(FISH_EVENT, listen); return () => window.removeEventListener(FISH_EVENT, listen);
  }, [owner, prefs.enabled, prefs.quiet, prefs.sleeping]);
  useEffect(() => { setMessage(''); drag.current = null; setDragPosition(null); }, [location.pathname, prefs.collapsed, prefs.enabled]);
  const focusHidden = prefs.focusMode && (petFocusPath(location.pathname) || paperOpen);
  if (!prefs.enabled || hidden || viewport.h < 360 || viewport.w < 240 || focusHidden || /^\/(?:login|register|account|password)(?:\/|$)/.test(location.pathname)) return null;
  const say = (text: string): void => { setMessage(text); setReaction(n => n + 1); };
  if (prefs.collapsed) return <Link className={styles.restore} to="/desk-pet" aria-label="工位搭子已收起，打开管理">搭子</Link>;
  return <aside className={styles.widget} aria-label="我的工位搭子" style={{ left, top, '--pet-size': `${prefs.size}px` } as CSSProperties} onKeyDown={event => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); update({ collapsed: true }); }
  }}>
    {message ? <div key={reaction} className={styles.bubble} role="status">{message}</div> : null}
    <div className={styles.widgetHeader}><span>{prefs.name.trim() || '摸摸'}</span><button type="button" aria-label="收起工位搭子" onClick={() => update({ collapsed: true })}>−</button></div>
    <button type="button" className={styles.petButton} aria-label={`摸摸${prefs.name.trim() || '搭子'}，可拖动或用方向键移动`} title="点击摸头；拖动或方向键移动；Esc 收起" onPointerDown={event => {
      if (event.button !== 0 || event.isPrimary === false) return;
      suppressClick.current = false;
      drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left, top, moved: false };
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }} onPointerMove={event => {
      const d = drag.current; if (!d || d.id !== event.pointerId) return;
      const dx = event.clientX - d.x, dy = event.clientY - d.y;
      if (Math.hypot(dx, dy) > 5) d.moved = true;
      if (d.moved) { suppressClick.current = true; setDragPosition(clamp(d.left + dx, d.top + dy)); }
    }} onPointerUp={event => {
      const d = drag.current; if (!d || d.id !== event.pointerId) return;
      if (d.moved) savePoint(d.left + event.clientX - d.x, d.top + event.clientY - d.y);
      drag.current = null; setDragPosition(null);
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }} onPointerCancel={() => { drag.current = null; setDragPosition(null); suppressClick.current = true; }} onLostPointerCapture={() => { drag.current = null; setDragPosition(null); }} onKeyDown={event => {
      const delta: Record<string, [number, number]> = { ArrowLeft: [-16,0], ArrowRight: [16,0], ArrowUp: [0,-16], ArrowDown: [0,16] };
      if (delta[event.key]) { event.preventDefault(); savePoint(left + delta[event.key][0], top + delta[event.key][1]); }
    }} onClick={event => {
      if (suppressClick.current && event.detail !== 0) { suppressClick.current = false; return; }
      if (prefs.sleeping) say('嘘……让我再眯一会儿。');
      else say(phrases[phrase.current++ % phrases.length]);
    }}>
      <span key={reaction} className={!prefs.quiet && reaction ? styles.reaction : undefined}><PetAppearance prefs={prefs} /></span>
    </button>
    <div className={styles.widgetActions}>
      <button type="button" disabled={prefs.sleeping} onClick={() => say('小饼干收到！不花办公币，心意满分。')}>喂食</button>
      <button type="button" onClick={() => { update({ sleeping: !prefs.sleeping }); say(prefs.sleeping ? '醒啦，今天也陪你上班。' : '午休模式，稍后再摸。'); }}>{prefs.sleeping ? '叫醒' : '睡觉'}</button>
      <Link to="/desk-pet">装扮</Link>
    </div>
    {storageError ? <span className={styles.unsaved}>未保存，请到装扮页查看</span> : null}
  </aside>;
}
