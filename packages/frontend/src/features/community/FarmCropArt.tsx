import type { JSX } from 'react';

const CROP_KEYS = ['desk_mint', 'meeting_tomato', 'deadline_strawberry', 'overtime_coffee', 'promotion_sunflower', 'annual_moonflower'] as const;
type CropArtKey = typeof CROP_KEYS[number];

/** Old guest saves use hyphens; unknown future crops get a neutral seedling. */
export function farmCropArtKey(key: string | undefined): CropArtKey | 'seedling' {
  const normalized = key?.replaceAll('-', '_');
  return CROP_KEYS.find((candidate) => candidate === normalized) ?? 'seedling';
}

export function FarmCropArt({ cropKey, label, className, scene = false }: {
  cropKey?: string; label: string; className?: string; scene?: boolean;
}): JSX.Element {
  const kind = farmCropArtKey(cropKey);
  return <svg className={className} viewBox={scene ? '0 0 160 205' : '18 0 124 145'}
    role="img" aria-label={`${label}图标`} focusable="false" data-crop-art={kind}>
    <g stroke="#447756" strokeWidth="5" strokeLinecap="round" fill="none">
      <path d="M80 160V49M80 116L49 89M80 96L107 73" />
    </g>
    <g fill="#659963" stroke="#447756" strokeWidth="1.5">
      <path d="M77 115C47 120 24 100 29 82C56 78 76 94 77 115Z" />
      <path d="M82 96C108 102 133 83 127 65C104 63 84 78 82 96Z" />
    </g>
    {kind === 'desk_mint' ? <g fill="#78ac70" stroke="#447756" strokeWidth="1.5">
      <path d="M80 74L66 69L64 61L56 55L60 46L57 37L66 33L71 22L80 17L89 26L99 31L96 43L102 51L94 59L91 68Z" />
      <path d="M80 72V31M79 51L66 42M81 59L93 47" fill="none" />
    </g> : null}
    {kind === 'meeting_tomato' ? <g>
      <path d="M48 91V59M79 52L53 57" stroke="#447756" strokeWidth="4" fill="none" />
      <circle cx="48" cy="83" r="23" fill="#cd6254" /><circle cx="98" cy="48" r="26" fill="#d87058" />
      <path d="M48 59L39 68L48 65L59 71L54 60M98 21L88 34L98 29L111 36L103 23" fill="#477957" />
      <path d="M35 80Q33 74 40 71M82 46Q80 38 89 36" stroke="#efb09a" strokeWidth="4" strokeLinecap="round" fill="none" />
    </g> : null}
    {kind === 'deadline_strawberry' ? <g>
      <path d="M58 53C48 32 74 22 81 37C96 21 118 39 104 58L82 88Z" fill="#c95767" />
      <path d="M56 44L71 34L81 43L89 31L108 40L94 43L83 52L72 44Z" fill="#50855a" />
      {[ [69,53], [88,58], [96,49], [78,68], [84,77] ].map(([cx, cy]) => <ellipse key={`${cx}-${cy}`} cx={cx} cy={cy} rx="1.6" ry="2.7" fill="#f6d2a6" />)}
    </g> : null}
    {kind === 'overtime_coffee' ? <g>
      <path d="M80 78L54 46M80 64L104 36" stroke="#447756" strokeWidth="4" fill="none" />
      <path d="M79 44C57 39 58 12 78 12C94 14 96 31 79 44Z" fill="#527f51" />
      {[ [57,53], [70,65], [97,40], [103,56] ].map(([cx,cy], index) => <g key={`${cx}-${cy}`}>
        <ellipse cx={cx} cy={cy} rx="10" ry="13" fill={index % 2 ? '#a95850' : '#ba6860'} />
        <path d={`M${cx} ${cy! - 7}q-4 6 0 14`} fill="none" stroke="#80483f" strokeWidth="1.7" />
      </g>)}
    </g> : null}
    {kind === 'promotion_sunflower' ? <g>
      {Array.from({ length: 10 }, (_, index) => <ellipse key={index} cx="80" cy="20" rx="9" ry="20" transform={`rotate(${index * 36} 80 46)`} fill={index % 2 ? '#eac66b' : '#dfb95c'} />)}
      <circle cx="80" cy="46" r="20" fill="#84634a" /><circle cx="80" cy="46" r="13" fill="#a07d51" />
      <path d="M73 39H76M84 39H87M73 48H76M84 48H87M79 55H82" stroke="#674f3f" strokeWidth="3" strokeLinecap="round" />
    </g> : null}
    {kind === 'annual_moonflower' ? <g>
      {Array.from({ length: 5 }, (_, index) => <path key={index} d="M80 50Q50 30 80 5Q101 27 80 50Z" transform={`rotate(${index * 72} 80 50)`} fill={index % 2 ? '#f1f0e5' : '#e2e7ee'} stroke="#9faeca" strokeWidth="1.5" />)}
      <circle cx="80" cy="50" r="8" fill="#d9c683" /><path d="M117 12L120 19L127 22L120 25L117 32L114 25L107 22L114 19Z" fill="#e8dec2" />
    </g> : null}
    {kind === 'seedling' ? <path d="M80 71C55 49 67 24 80 29C102 26 111 53 80 71Z" fill="#83a870" /> : null}
    {scene ? <g>
      <ellipse cx="80" cy="190" rx="45" ry="8" fill="#684d39" opacity=".15" />
      <path d="M37 148H123L112 187Q80 202 48 187Z" fill="#c28a65" />
      <rect x="32" y="140" width="96" height="17" rx="5" fill="#d39b74" />
      <path d="M67 177H93" stroke="#ebcbb1" strokeWidth="3" strokeLinecap="round" />
    </g> : null}
  </svg>;
}
