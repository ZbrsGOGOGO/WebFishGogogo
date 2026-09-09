import { useEffect, useRef, type JSX, type ReactNode } from 'react';

import { useGamePrivacy } from '../GamePrivacyContext';
import { TowerIcon } from './DemonTowerArt';
import styles from './DemonTower.module.css';

/** Fixed mobile tabs are not part of the browser's native scroll-into-view bounds. */
export function revealTowerControl(target: HTMLElement): void {
  if (window.innerWidth > 760 || target.closest('[role="dialog"],[role="tablist"]')) return;
  const rectangle = target.getBoundingClientRect();
  if (rectangle.width <= 0 || rectangle.height <= 0) return;
  const navigation = document.querySelector('[role="tablist"][aria-label="妖塔工作区"]');
  const bottom = navigation?.getBoundingClientRect().top ?? window.innerHeight - 90;
  if (rectangle.top < 12 || rectangle.bottom > bottom - 12) target.scrollIntoView?.({ block: 'center', behavior: 'instant' });
}

export function TowerPanel({ title, detail, children, className = '' }: { title: string; detail?: ReactNode; children: ReactNode; className?: string }): JSX.Element {
  return <section className={`${styles.panel} ${className}`}><header className={styles.panelHeading}><h2>{title}</h2>{detail}</header><div className={styles.panelBody}>{children}</div></section>;
}

export function TowerMeter({ label, value, max, tone = 'sage', detail }: { label: string; value: number; max: number; tone?: 'sage' | 'clay' | 'blue'; detail?: ReactNode }): JSX.Element {
  const safeMax = Math.max(1, Number.isFinite(max) ? max : 1);
  const safeValue = Math.max(0, Math.min(Number.isFinite(value) ? value : 0, safeMax));
  return <div className={styles.meter}><div className={styles.meterHeading}><span>{label}</span><span className={styles.numeric}>{value.toLocaleString('zh-CN')} <small>/ {max.toLocaleString('zh-CN')}</small></span></div><div className={styles.meterTrack} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={safeMax} aria-valuenow={safeValue} data-tone={tone}><span style={{ width: `${safeValue / safeMax * 100}%` }} /></div>{detail ? <small className={styles.meterDetail}>{detail}</small> : null}</div>;
}

const FOCUSABLE = 'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** A workspace-owned modal, never a body portal: the existing Esc cover hides it too. */
export function TowerModal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }): JSX.Element {
  const dialog = useRef<HTMLDivElement>(null);
  const { covered } = useGamePrivacy();
  const privacy = useRef(covered); privacy.current = covered;
  const priorFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    priorFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => { if (!privacy.current && priorFocus.current?.isConnected) priorFocus.current.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => {
    if (covered) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const first = dialog.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? dialog.current)?.focus({ preventScroll: true });
    const trap = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab' || !dialog.current) return;
      const elements = Array.from(dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
      const firstElement = elements[0]; const lastElement = elements.at(-1);
      if (!firstElement || !lastElement) { event.preventDefault(); dialog.current.focus(); return; }
      if (event.shiftKey && (document.activeElement === firstElement || !dialog.current.contains(document.activeElement))) { event.preventDefault(); lastElement.focus(); }
      else if (!event.shiftKey && (document.activeElement === lastElement || !dialog.current.contains(document.activeElement))) { event.preventDefault(); firstElement.focus(); }
    };
    document.addEventListener('keydown', trap);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', trap); };
  }, [covered]);
  return <div className={styles.modalBackdrop} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className={styles.modal} role="dialog" aria-modal="true" aria-label={title} ref={dialog} tabIndex={-1}><header className={styles.modalHeading}><div><span className={styles.eyebrow}>WORKSPACE DETAIL</span><h2>{title}</h2></div><button type="button" className={styles.iconButton} aria-label={`关闭${title}`} onClick={onClose}><TowerIcon name="close" /></button></header><div className={styles.modalBody}>{children}</div>{footer ? <footer className={styles.modalFooter}>{footer}</footer> : null}<p className={styles.modalPrivacy}>Esc 收起为便签，返回后保留当前页面。</p></div></div>;
}

export function towerTime(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return '时间待同步';
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(timestamp));
}

export function towerDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return seconds >= 60 ? `${Math.floor(seconds / 60)}分${String(seconds % 60).padStart(2, '0')}秒` : `${seconds}秒`;
}
