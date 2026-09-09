import { useId, type JSX } from 'react';

export type TowerIconName = 'explore' | 'profile' | 'loadout' | 'world' | 'journal' | 'help' | 'coin' | 'material' | 'energy' | 'refresh' | 'shield' | 'arrow' | 'close' | 'check' | 'heart' | 'clock';

/** All artwork is local, deterministic SVG. It does not load fonts, images or scripts. */
export function TowerIcon({ name, className }: { name: TowerIconName; className?: string }): JSX.Element {
  const paths: Record<TowerIconName, JSX.Element> = {
    explore: <><path d="m12 3 8 17H4L12 3Z" /><path d="m12 9 3 7h-6l3-7Z" /></>,
    profile: <><circle cx="12" cy="8" r="3" /><path d="M5 21v-3a7 7 0 0 1 14 0v3M4 3h3M17 3h3" /></>,
    loadout: <><path d="m6 3 4 6-3 3-5-4 4-5ZM8 11l11 10 3-3-11-10M15 3l6 6M18 3l-5 5" /></>,
    world: <><path d="M4 20h16M6 17h12M7 13h10M8 9h8M9 5h6M12 2v3M5 17v3M7 13v4M8 9v4M10 5v4M19 17v3M17 13v4M16 9v4M14 5v4" /></>,
    journal: <><path d="M6 3h13v18H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM7 3v18M10 8h5M10 12h5M10 16h3" /></>,
    help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 8.5a2.5 2.5 0 1 1 4.1 1.9c-1.1.7-1.6 1.2-1.6 2.6M12 17h.01" /></>,
    coin: <><circle cx="12" cy="12" r="9" /><path d="M9 7h6M9 17h6M12 7v10M8 11h8M8 14h8" /></>,
    material: <><path d="m12 3 8 5v9l-8 5-8-5V8l8-5ZM4 8l8 5 8-5M12 13v9M8 5.5l8 5" /></>,
    energy: <path d="m14 2-9 12h6l-1 8 9-12h-6l1-8Z" />,
    refresh: <><path d="M20 8a8 8 0 0 0-14-3L3 8M3 3v5h5M4 16a8 8 0 0 0 14 3l3-3M16 16h5v5" /></>,
    shield: <><path d="m12 3 8 3v6c0 4-5 7-8 9-3-2-8-5-8-9V6l8-3Z" /><path d="m8 12 3 3 5-6" /></>,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    check: <path d="m5 12 4 4L19 6" />,
    heart: <path d="M20.7 5.7a5 5 0 0 0-7.1 0L12 7.3l-1.6-1.6a5 5 0 1 0-7.1 7.1L12 21l8.7-8.2a5 5 0 0 0 0-7.1Z" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 2" /></>,
  };
  return <svg className={className} viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}

function WeaponShape({ id }: { id: string }): JSX.Element {
  const number = Number(id.replace(/^w/, ''));
  if (number >= 13 && number <= 16) return <g><path d="M32 9 52 18v24c0 13-10 21-20 27C22 63 12 55 12 42V18L32 9Z" fill="currentColor" fillOpacity=".16" /><path d="M32 9 52 18v24c0 13-10 21-20 27C22 63 12 55 12 42V18L32 9ZM32 17v43M20 32h24" />{number === 14 ? <path d="M23 11v53M19 21h8M19 30h8M19 39h8" /> : <path d="m24 45 8-13 8 13-8 8-8-8Z" />}</g>;
  if (number === 17) return <g><path d="M20 28c0-20 24-20 24 0l5 20H15l5-20ZM18 49h28M32 49v10M26 59h12M32 13V6" /><path d="M21 43h22" /></g>;
  if (number === 19) return <g><path d="M25 13h14v9l6 11c10 23-36 23-26 0l6-11v-9ZM24 12h16M27 8h10M23 50h18M40 27c14-5 17 6 4 11M27 29h10" /><path d="M27 19h10" /></g>;
  if (number === 18 || number === 20) return <g><path d="M22 7v64M22 13h31l-7 15 7 15H22" /><path d="m29 19 12 10-12 8M17 68h10" /></g>;
  if (number === 2) return <g transform="rotate(25 32 40)"><path d="M28 30h8v39h-8zM10 12h44v21H10z" fill="currentColor" fillOpacity=".12" /><path d="M28 30h8v39h-8zM10 12h44v21H10zM16 17v11M48 17v11" /></g>;
  if (number === 3 || number === 4) return <g><path d="M28 8h7v62h-7zM35 13c8 0 15-3 19-8v34c-7-7-11-9-19-9M28 13C20 13 14 10 10 5v34c6-6 11-9 18-9" fill="currentColor" fillOpacity=".12" /><path d="M18 68h29" /></g>;
  if (number >= 9 && number <= 12) return <g><path d="M32 5 43 23 32 31 21 23 32 5ZM32 31v40M26 68h12" fill="currentColor" fillOpacity=".12" />{number === 10 || number === 12 ? <path d="M42 24c14 1 14 15 2 21M23 27l-8 15" /> : null}</g>;
  if (number === 8) return <g><path d="m12 8 16 13v31l-7 7-7-7V21L12 8ZM42 8 56 21v31l-7 7-7-7V21 8ZM10 54h22M38 54h22M21 59v12M49 59v12" /></g>;
  return <g transform={number >= 5 ? 'translate(5 7) scale(.86)' : undefined}><path d="M31 5 45 18v30L32 57 19 48V18L31 5Z" fill="currentColor" fillOpacity=".12" /><path d="M31 5 45 18v30L32 57 19 48V18L31 5ZM32 17v35M13 55h38M28 56v15h8V56M25 72h14" /></g>;
}

export function TowerWeaponArt({ weaponId, label, className }: { weaponId?: string | null; label: string; className?: string }): JSX.Element {
  return <svg className={className} viewBox="0 0 64 80" width="48" height="60" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={label}>{weaponId ? <WeaponShape id={weaponId} /> : <><path d="M20 19h24v39H20zM25 14h14M25 63h14M32 26v24M26 38h12" strokeDasharray="3 4" /><circle cx="32" cy="38" r="20" strokeOpacity=".2" /></>}</svg>;
}

export function TowerPortrait({ name, weaponId, className, injured = false }: { name: string; weaponId?: string | null; className?: string; injured?: boolean }): JSX.Element {
  const id = useId().replace(/:/g, '');
  return <svg className={className} viewBox="0 0 280 320" role="img" aria-label={`${name}的寻道者形象`}>
    <defs><linearGradient id={`coat-${id}`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#596e69" /><stop offset="1" stopColor="#354d47" /></linearGradient></defs>
    <path d="M28 249h224M44 260h191M51 68h175M50 48h52M201 77v117" stroke="#cbd5ce" strokeWidth="1" />
    <circle cx="138" cy="135" r="92" fill="#e9eee7" /><circle cx="138" cy="135" r="75" fill="none" stroke="#d0dbd1" strokeDasharray="3 7" />
    <path d="M59 234 88 166l27-16 66 13 31 80-47 14-73-2-33-21Z" fill="#a3aaa0" opacity=".5" />
    <ellipse cx="143" cy="294" rx="70" ry="9" fill="#c7d0c8" opacity=".6" />
    <path d="m111 240-3 44-15 6v6h34l11-50M148 244l8 41-5 11h36v-7l-15-7-4-44" fill="#3b4744" />
    <path d="m106 123-27 25-10 74 25 5 12-48-6 78 73-1-3-77 17 44 22-11-26-72-24-16-53-1Z" fill={`url(#coat-${id})`} />
    <path d="m114 123 26 27 20-27 8 117h-62l8-117Z" fill="#dedccd" />
    <path d="m109 122-6 28 19 11-18 21M163 124l8 25-18 13 18 21M141 157v91M99 217h76" fill="none" stroke="#203d32" strokeWidth="2" />
    <path d="M126 109v19l14 15 13-17v-19" fill="#d9bda3" />
    <path d="M116 76c0-31 46-30 46 0v19c-2 29-39 32-46 2V76Z" fill="#e8d1b8" />
    <path d="M113 82c-3-35 45-49 54-12l-1 18-9-5-3-18-15 12-18-1-3 14-5-8Z" fill="#35433e" />
    <path d="M125 91h5M146 91h5M136 93l-2 9 6 1M131 112h13" stroke="#786555" strokeWidth="1.5" strokeLinecap="round" />
    <path d="m119 128 13 17-5 40 11 10 11-10-9-40 15-17" fill="none" stroke="#b1ac96" strokeWidth="2" />
    <path d="M123 176h26v22h-26z" fill="#f6f2e5" stroke="#60746a" /><path d="M129 184h14M129 190h9" stroke="#8c9c8f" />
    <path d="M95 209h29v18H95zM156 209h20v17h-20z" fill="#405a4e" stroke="#758475" />
    <path d="m73 218-1 15 10 11 8-6-4-16M188 215l6 10 11 2 7-10-6-9" fill="#e8d1b8" />
    <path d="m101 249 69 1" stroke="#718676" strokeWidth="2" />
    {weaponId ? <g transform="translate(192 142) rotate(14) scale(.95)" stroke="#506350" color="#506350" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"><WeaponShape id={weaponId} /></g> : <g fill="none" stroke="#667b68" strokeWidth="2"><path d="m205 156-10 132M205 156l4-18" /><path d="m199 257 9 3" /></g>}
    <rect x="31" y="32" width="40" height="20" rx="3" fill="#f8faf6" stroke="#cbd5ce" /><text x="51" y="46" textAnchor="middle" fill="#829381" fontSize="9" fontFamily="monospace">FILE 01</text>
    {injured ? <><path d="m169 74 15 15m0-15-15 15" stroke="#a77b70" strokeWidth="3" /><circle cx="177" cy="82" r="15" fill="none" stroke="#a77b70" opacity=".5" /></> : <path d="m218 92 6 6 11-14" fill="none" stroke="#879b80" strokeWidth="2" />}
  </svg>;
}

export function TowerTerrainArt({ terrain, className }: { terrain: string; className?: string }): JSX.Element {
  const water = terrain === 'lake' || terrain === 'sea';
  return <svg className={className} viewBox="0 0 640 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
    <rect width="640" height="200" fill="#edf0e9" /><circle cx="512" cy="43" r="23" fill="#e0dfcb" />
    <path d="M0 118 62 88 124 104 215 42 264 105 324 72 418 115 488 66 566 103 640 64V200H0Z" fill="#dae1d7" />
    <path d="m0 146 74-34 58 14 95-48 74 49 61-31 61 38 76-37 68 32 73-10v81H0Z" fill="#c5d2c4" opacity=".85" />
    {water ? <><path d="M0 142q82-18 160 3t160-2 160 2 160-3v58H0Z" fill="#d7e2de" /><path d="M43 165h104M175 180h95M321 157h131M481 182h99M90 190h32" stroke="#a8beb3" strokeWidth="2" strokeLinecap="round" /><path d="m126 148 13-8 19 12M133 148v-24m0 9 12 4" stroke="#879e8c" fill="none" />{terrain === 'sea' ? <path d="M351 166h50l-10 9h-33l-7-9Zm23-2v-40l23 34h-23" stroke="#889e94" fill="#c9d8d0" /> : <path d="M68 185v-38m0 22-9-8m9 0 9-12M597 176v-31m0 12 10-7" stroke="#82947b" fill="none" />}</> : <><path d="M0 182q100-49 207-16t196-8 237 4v38H0Z" fill="#b7c8b3" /><path d="m309 200-55-22 34-14 47-16-28-18" fill="none" stroke="#e7e7d3" strokeWidth="13" />{terrain === 'mountain' ? <path d="m407 162 21-34 32 4 21 36m-53-36 6 20 17-16" fill="#a8b9a5" stroke="#8ca08a" /> : <path d="M65 176v-15m0 7-6-5m6 1 6-6M521 179v-16m0 8-5-7m5 3 6-6" fill="none" stroke="#809778" />}</>}
    <path d="M40 29h58M40 36h31M581 142v26M573 150h16" stroke="#a5b7a3" strokeWidth="1" /><text x="585" y="35" textAnchor="end" fill="#8c9d88" fontSize="10" fontFamily="monospace">FIELD SURVEY / 09</text>
  </svg>;
}

export function TowerWorldArt({ openFloor, className }: { openFloor: number; className?: string }): JSX.Element {
  return <svg className={className} viewBox="0 0 160 320" role="img" aria-label={`九层妖塔，当前开放至第${openFloor}层`}>
    <path d="M80 8v16M21 302h118" fill="none" stroke="#a5b4a2" />
    {Array.from({ length: 9 }, (_, index) => { const floor = 9 - index; const y = 30 + index * 28; const width = 46 + index * 8; const x = (160 - width) / 2; const active = floor <= openFloor; return <g key={floor} fill={active ? '#d5e0d0' : '#ebeee7'} stroke={active ? '#7e9477' : '#c3cdc0'} strokeWidth="1.2"><path d={`M${x} ${y + 9}h${width}l8 6h-${width + 16}l8-6Z`} /><path d={`M${x + 8} ${y + 15}v14h${width - 16}v-14`} /><path d={`M${x + 16} ${y + 20}v5m${width - 32} -5v5`} /><text x="80" y={y + 26} textAnchor="middle" fill={active ? '#4b6646' : '#a2afa0'} stroke="none" fontSize="9" fontFamily="monospace">{String(floor).padStart(2, '0')}</text></g>; })}
    <path d="M37 297v-11M123 297v-11" stroke="#8ba181" /><path d="M66 299v-11h28v11" fill="#a4b79c" />
  </svg>;
}
