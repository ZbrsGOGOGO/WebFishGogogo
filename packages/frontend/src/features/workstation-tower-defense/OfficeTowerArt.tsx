import { useId, type JSX } from 'react';

export interface OfficeTowerArtProps {
  kind: string;
  tier?: number;
  className?: string;
}

/** Small code-native sprites: clear silhouettes even on the mobile board. */
export function OfficeTowerArt({ kind, tier = 2, className }: OfficeTowerArtProps): JSX.Element {
  const id = useId().replace(/:/g, '');
  const palette = kind === 'single' ? ['#ec875d', '#a64539']
    : kind === 'slow' ? ['#69b49c', '#307667']
      : kind === 'splash' ? ['#719bc4', '#3c607e']
        : kind === 'push' ? ['#b59ace', '#70578e']
          : ['#e9bf55', '#a47b2c'];
  return <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false" data-art={kind} data-tier={tier}>
    <defs><linearGradient id={`${id}-body`} x1="14" y1="12" x2="48" y2="51" gradientUnits="userSpaceOnUse"><stop stopColor={palette[0]} /><stop offset="1" stopColor={palette[1]} /></linearGradient></defs>
    <ellipse cx="32" cy="54" rx="23" ry="5" fill="#263e3a" opacity=".17" />
    {tier === 1 ? <>
      <rect x="15" y="15" width="34" height="34" rx="10" fill={`url(#${id}-body)`} stroke={palette[1]} strokeWidth="2" transform="rotate(-9 32 32)" />
      <path d="M22 20h17M20 43h19" stroke="#fff" strokeOpacity=".45" strokeWidth="3" strokeLinecap="round" />
      <path d="m29 26 7 3-7 3v-6Zm-4 9h14" stroke="#fff" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx="46" cy="43" r="8" fill="#fff9e9" stroke={palette[1]} strokeWidth="2" /><path d="M43 43h6m-3-3v6" stroke={palette[1]} strokeWidth="2" strokeLinecap="round" />
    </> : kind === 'single' ? <>
      <path d="M10 43h42l4 9H8l2-9Z" fill={palette[1]} stroke="#704139" strokeWidth="2" />
      <path d="m14 17 39 11-4 13-37-8 2-16Z" fill={`url(#${id}-body)`} stroke={palette[1]} strokeWidth="2" />
      <path d="m19 19 29 9-2 5-28-8 1-6Z" fill="#ffd9b8" /><path d="m14 34 3 10h28l4-4" stroke="#f4e8d1" strokeWidth="4" />
      <circle cx="15" cy="36" r="4" fill="#dae4dc" stroke="#526b60" strokeWidth="2" /><path d="m44 29 10 3" stroke="#fff4d9" strokeWidth="4" strokeLinecap="round" />
    </> : kind === 'slow' ? <>
      <rect x="13" y="11" width="34" height="42" rx="7" fill={`url(#${id}-body)`} stroke={palette[1]} strokeWidth="2" />
      <rect x="18" y="15" width="24" height="8" rx="3" fill="#dfefda" /><circle cx="39" cy="19" r="2" fill="#a9d669" />
      <path d="M24 26h13v4H24z" fill="#284d43" /><path d="M20 35h20v10a5 5 0 0 1-5 5H25a5 5 0 0 1-5-5V35Z" fill="#fff3d6" />
      <path d="M40 37h3a4 4 0 0 1 0 8h-3" stroke="#fff3d6" strokeWidth="3" /><path d="M28 30v4m6-4v4" stroke="#a2643e" strokeWidth="2" strokeLinecap="round" /><rect x="17" y="50" width="28" height="4" rx="2" fill="#254f44" />
    </> : kind === 'splash' ? <>
      <path d="M20 7h25v23H20z" fill="#fffcf0" stroke="#8cacae" strokeWidth="2" /><path d="M25 14h14m-14 5h10" stroke="#b5c7c4" strokeWidth="2" strokeLinecap="round" />
      <rect x="9" y="25" width="47" height="25" rx="7" fill={`url(#${id}-body)`} stroke={palette[1]} strokeWidth="2" />
      <path d="M18 39h29v14H18z" fill="#314f62" /><path d="M22 39h21v17H22z" fill="#fff8e8" stroke="#a8b9b4" strokeWidth="1.5" /><path d="M27 45h11m-11 5h8" stroke="#aec0b8" strokeWidth="2" strokeLinecap="round" />
      <circle cx="47" cy="31" r="2" fill="#ccebab" /><path d="M16 31h14" stroke="#b3d2da" strokeWidth="3" strokeLinecap="round" />
    </> : kind === 'push' ? <>
      <path d="M32 40v13m0-1-13 5m13-5 13 5" stroke="#526263" strokeWidth="4" strokeLinecap="round" /><circle cx="19" cy="57" r="3" fill="#34494b" /><circle cx="45" cy="57" r="3" fill="#34494b" />
      <rect x="19" y="7" width="26" height="28" rx="9" fill={`url(#${id}-body)`} stroke={palette[1]} strokeWidth="2" /><path d="M24 13h16" stroke="#e1d1ee" strokeWidth="3" strokeLinecap="round" />
      <rect x="15" y="32" width="35" height="10" rx="5" fill={palette[0]} stroke={palette[1]} strokeWidth="2" /><path d="M12 27v10m40-10v10M8 27h9m30 0h9" stroke="#526263" strokeWidth="3" strokeLinecap="round" />
    </> : <>
      <rect x="14" y="24" width="37" height="31" rx="7" fill={`url(#${id}-body)`} stroke={palette[1]} strokeWidth="2" /><rect x="10" y="21" width="45" height="10" rx="4" fill="#d1a646" stroke={palette[1]} strokeWidth="2" />
      <path d="M22 6h20v19H22z" fill="#fff9e7" stroke="#c9b482" strokeWidth="2" /><path d="M27 12h10m-10 5h7" stroke="#cdbf99" strokeWidth="2" strokeLinecap="round" /><path d="M23 37h18v11H23z" fill="#6d662f" />
      <path d="m27 38 1 8m5-8-1 8m5-8 1 8" stroke="#eee2ab" strokeWidth="2" strokeLinecap="round" /><circle cx="47" cy="26" r="2" fill="#fff1c7" />
    </>}
    {tier >= 2 ? <g data-evolution={`${kind}-${tier}`}>
      {kind === 'single' ? tier === 3
        ? <><path d="M40 25h18v6H40zM39 34h17v5H39z" fill="#d8e2dc" stroke="#754c44" strokeWidth="2" /><path d="m45 44 5-3 5 3-2 7h-6z" fill="#ffe4a7" stroke="#9b5d42" /></>
        : <path d="m40 37 5-4 6 3-2 8h-7l-2-7Zm5-3-2 8" fill="#e8ded0" stroke="#875c4f" strokeWidth="2" />
        : kind === 'slow' ? tier === 3
          ? <><path d="M36 27h21v7H36z" fill="#f7ecd5" stroke="#326c60" strokeWidth="2" /><path d="m56 24 5-4m-5 10h6m-6 7 5 4" stroke="#58ae9d" strokeWidth="2" strokeLinecap="round" /></>
          : <><rect x="23" y="36" width="8" height="8" rx="2" fill="#c5edfa" stroke="#77b2c2" transform="rotate(-15 27 40)" /><rect x="30" y="40" width="7" height="7" rx="2" fill="#dff7ff" stroke="#77b2c2" /></>
          : kind === 'splash' ? tier === 3
            ? <><path d="m20 14 12-7 12 7v13l-12 7-12-7V14Z" fill="#bcd5ee" stroke="#395e83" strokeWidth="2" /><path d="m20 14 12 7 12-7m-12 7v13" stroke="#395e83" strokeWidth="2" /></>
            : <><path d="M16 34h31" stroke="#d4f4ff" strokeWidth="3" /><path d="m45 30 13-3m-13 7h15" stroke="#68bddc" strokeWidth="2" /></>
            : kind === 'push' ? tier === 3
              ? <><path d="M17 11 14 5l10 3 8-5 8 5 10-3-4 9" fill="#e9d08b" stroke="#86638f" strokeWidth="2" /><path d="M22 21h20M26 18v12m12-12v12" stroke="#dfc7ed" strokeWidth="2" /></>
              : <path d="M23 21h18M24 26h16" stroke="#e6d4f1" strokeWidth="3" strokeLinecap="round" />
              : tier === 3
                ? <><path d="M7 19C-1 37 7 56 24 57M54 45c10-18 4-31-9-36" stroke="#c49333" strokeWidth="2" strokeDasharray="3 3" /><path d="m5 29 7-2 2 8-7 2zM49 11l7 2-2 8-7-2z" fill="#fff5c9" stroke="#bd9b54" /></>
                : <path d="m22 33 4 5 4-5 4 5 4-5 4 5" stroke="#f7edb9" strokeWidth="2" />}
    </g> : null}
    {tier >= 3 ? <><path d="m24 6 3-5 5 5 5-5 3 5-2 6H26l-2-6Z" fill="#f3ce6c" stroke="#b28337" strokeWidth="1.5" /><path d="m54 10 1.5 4.5L60 16l-4.5 1.5L54 22l-1.5-4.5L48 16l4.5-1.5L54 10Z" fill="#f7d16e" /></> : null}
  </svg>;
}

export function OfficePlantArt({ className }: { className?: string }): JSX.Element {
  return <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
    <ellipse cx="32" cy="56" rx="20" ry="4" fill="#284d36" opacity=".13" /><path d="M32 45V16" stroke="#456f4b" strokeWidth="4" strokeLinecap="round" />
    <path d="M32 29C10 30 12 9 16 9c13 0 17 10 16 20Z" fill="#81ba6b" /><path d="M32 34C52 35 57 17 49 16c-11-1-18 6-17 18Z" fill="#4c9774" />
    <path d="M31 19C28 8 36 1 41 5c6 5 2 14-10 14Z" fill="#a0c776" /><path d="m19 40 4 16h19l4-16H19Z" fill="#cd8d62" stroke="#a97050" strokeWidth="2" /><rect x="16" y="37" width="33" height="6" rx="3" fill="#e1aa79" /><path d="M27 47h11" stroke="#edc39c" strokeWidth="3" strokeLinecap="round" />
  </svg>;
}

export function OfficeHeroArt({ className, mark }: { className?: string; mark: string }): JSX.Element {
  return <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
    <ellipse cx="32" cy="58" rx="19" ry="4" fill="#244541" opacity=".2" /><path d="M22 47v10m20-10v10" stroke="#344e50" strokeWidth="8" strokeLinecap="round" />
    <path d="M17 46v-9c0-8 6-12 15-12s15 4 15 12v9H17Z" fill="#5b9c9a" stroke="#376563" strokeWidth="2" /><path d="m27 27 5 6 5-6" fill="#fff4de" /><path d="m31 33-2 11 3 3 3-3-2-11" fill="#dcab65" />
    <rect x="22" y="7" width="22" height="22" rx="10" fill="#f3c9a2" /><path d="M20 15C19 0 49 0 45 19l-5-8-17 7-3-3Z" fill="#344c4b" /><circle cx="28" cy="20" r="1.5" fill="#344c4b" /><circle cx="37" cy="20" r="1.5" fill="#344c4b" />
    <path d="m17 35-5 10m35-10 5 10" stroke="#f3c9a2" strokeWidth="6" strokeLinecap="round" /><rect x="43" y="35" width="14" height="18" rx="3" fill="#f9f0da" stroke="#b99761" strokeWidth="2" /><text x="50" y="48" textAnchor="middle" fontSize="10" fontWeight="800" fill="#7a633d">{Array.from(mark)[0] ?? '守'}</text>
  </svg>;
}
