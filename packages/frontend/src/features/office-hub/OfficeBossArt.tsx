import { useId, type CSSProperties } from 'react';
import type { OfficeReliefSkinId, OfficeReliefTool } from '@stealth-reader/shared';
import styles from './OfficeBossWorkspace.module.css';

/** Trusted, local SVG only. This character is a fictional paper work order. */
export function OfficeBossArt({ tool, skin, effect = null }: {
  tool: OfficeReliefTool;
  skin: OfficeReliefSkinId | null;
  effect?: 'gain' | 'loss' | 'rare' | 'tap' | null;
}) {
  const id = useId().replace(/:/g, '');
  return <svg className={styles.art} viewBox="0 0 560 270" role="img" aria-label="桌面上的虚构纸片小老板" data-skin={skin ?? 'default'} data-effect={effect ?? 'none'}>
    <defs><pattern id={`${id}-dots`} width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".7" fill="currentColor" opacity=".16" /></pattern></defs>
    <rect width="560" height="270" rx="12" className={styles.artBackground} />
    <rect width="560" height="270" rx="12" fill={`url(#${id}-dots)`} />
    <path d="M42 223h476" className={styles.artLine} strokeWidth="1.5" />
    <g opacity=".8" transform="rotate(-5 116 102)">
      <rect x="67" y="52" width="98" height="89" rx="4" className={styles.artNote} />
      <rect x="98" y="47" width="37" height="10" rx="2" fill="#a9bbac" opacity=".7" />
      <path d="M83 77h12m9 0h44M83 94h12m9 0h35M83 111h12m9 0h40" className={styles.artLine} strokeWidth="3" strokeLinecap="round" />
      <path d="m84 75 4 4 8-9m-12 23 4 4 8-9" stroke="#659078" fill="none" strokeWidth="2" strokeLinecap="round" />
    </g>
    <g transform="translate(428 60)"><circle r="27" className={styles.artPaper} /><circle r="23" className={styles.artLine} fill="none" /><path d="M0-16v17l10 6" className={styles.artLine} strokeWidth="2.5" fill="none" strokeLinecap="round" /><circle r="2.5" fill="currentColor" /></g>
    <g transform="translate(419 172)"><path d="M0 40V5M0 23C-22 20-28 2-17 0-5 0 0 12 0 23ZM0 16C16 14 24-5 13-7 1-8 0 8 0 16Z" fill="#89a993" stroke="#5e836e" strokeWidth="2" /><path d="m-17 24 5 26h24l5-26Z" fill="#b99476" stroke="#8f7159" strokeWidth="2" /><path d="M-19 24h38" stroke="#d3b899" strokeWidth="6" strokeLinecap="round" /></g>
    <ellipse cx="278" cy="225" rx="92" ry="8" fill="currentColor" opacity=".09" />
    <g className={styles.paperCharacter}>
      <path d="m218 192-25 23m143-23 25 23" className={styles.artLine} strokeWidth="7" strokeLinecap="round" />
      <path d="M242 212v12m73-12v12" className={styles.artLine} strokeWidth="9" strokeLinecap="round" />
      <path d="M215 50h110l22 23v134a8 8 0 0 1-8 8H215a8 8 0 0 1-8-8V58a8 8 0 0 1 8-8Z" className={styles.artPaper} strokeWidth="2" />
      <path d="M325 50v23h22" fill="none" className={styles.artLine} strokeWidth="1.5" />
      <rect x="247" y="43" width="60" height="16" rx="5" className={styles.artClip} />
      <rect x="260" y="42" width="34" height="8" rx="3" className={styles.artLine} fill="none" strokeWidth="2" />
      <path d="M227 90h38m26 0h35" className={styles.artLine} strokeWidth="2" strokeLinecap="round" />
      <g className={styles.bossGlasses}><rect x="226" y="103" width="40" height="29" rx="5" fill="#425b59" /><rect x="289" y="103" width="40" height="29" rx="5" fill="#425b59" /><path d="M265 112h24" stroke="#425b59" strokeWidth="4" /><path d="m233 109 9 0m55 0h9" stroke="#f6f3e8" strokeWidth="3" opacity=".55" strokeLinecap="round" /></g>
      <path d={effect === 'loss' ? 'M264 148q14-10 28 0' : effect ? 'M264 142q14 15 28 0' : 'M266 145h25'} className={styles.artLine} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="m244 161 34 15 33-15m-37 15-5 23 9 7 9-7-5-23" className={styles.artTie} strokeWidth="2" strokeLinejoin="round" />
      <path d="M226 183h20m-20 7h14M310 183h17m-17 7h12" className={styles.artLine} strokeWidth="2" strokeLinecap="round" opacity=".5" />
    </g>
    <g className={styles.artTool} transform="translate(92 184) rotate(-9)">
      {tool === 'keyboard' ? <><rect width="90" height="38" rx="5" className={styles.artPaper} strokeWidth="2" /><path d="M9 10h8m5 0h8m5 0h8m5 0h8m5 0h8m5 0h8M9 19h8m5 0h8m5 0h8m5 0h8m5 0h8m5 0h8M10 28h12m5 0h39m5 0h10" className={styles.artLine} strokeWidth="3" strokeLinecap="round" /></> : tool === 'stapler' ? <><path d="M0 28h82v9H0z" fill="#697f7b" /><path d="m5 1 78 14-4 15-77-9Z" fill="#89a69d" stroke="#4c6d61" strokeWidth="2" /><path d="m13 7 58 11" stroke="#d7e8df" strokeWidth="4" strokeLinecap="round" /><circle cx="8" cy="24" r="5" fill="#d1d9d7" /></> : <><path d="M12 0h43v27a10 10 0 0 1-10 10H22a10 10 0 0 1-10-10Z" className={styles.artPaper} strokeWidth="2" /><path d="M55 5h7a10 10 0 0 1 0 20h-7" className={styles.artLine} strokeWidth="4" fill="none" /><ellipse cx="34" cy="1" rx="19" ry="4" fill="#987259" /><path d="M26-16q-5 5 0 10m15-12q-5 5 0 10" className={styles.artLine} fill="none" strokeWidth="2" strokeLinecap="round" /></>}
    </g>
    {effect && effect !== 'tap' && <g className={styles.particles} aria-hidden="true">{Array.from({ length: 10 }, (_, i) => <g key={i} style={{ '--particle-x': `${(i % 2 ? 1 : -1) * (36 + i * 11)}px`, '--particle-y': `${-25 - (i % 4) * 16}px` } as CSSProperties}><circle cx="278" cy="116" r={i % 3 === 0 ? 4 : 2.5} fill={effect === 'loss' ? '#bf8c80' : effect === 'rare' ? '#c7ac68' : '#81a18c'} /></g>)}</g>}
  </svg>;
}
