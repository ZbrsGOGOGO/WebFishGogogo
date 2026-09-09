import type { JSX } from 'react';

type Silhouette = 'insect' | 'serpent' | 'bird' | 'guardian' | 'armored' | 'beast';

/** Visual silhouettes only. Combat type, powers and damage are never inferred here. */
function silhouette(name: string): Silhouette {
  if (/[蛛蝎蜂蚁虫蟹]/.test(name)) return 'insect';
  if (/[蛇蟒蛟龙鱼鲛鳞鲲]/.test(name)) return 'serpent';
  if (/[鸟雀鹏鸦隼鹤凤禽羽]/.test(name)) return 'bird';
  if (/[甲龟岩石]/.test(name)) return 'armored';
  if (/[兽狼犼羚]/.test(name)) return 'beast';
  if (/[卫将灵猿武僧人卒兵盗鬼魂魈骑]/.test(name)) return 'guardian';
  return 'beast';
}

/** Local SVG field-sketch, intentionally restrained and without animation. */
export function TowerEnemyArt({ name, className }: { name: string; className?: string }): JSX.Element {
  const shape = silhouette(name);
  const figures: Record<Silhouette, JSX.Element> = {
    beast: <>
      <path d="m31 38-7-17 18 6 8-5 15 6 15-8-4 24 12 13-9 12-17-2-15 9-20-4-14-17 18-17Z" fill="#bec8b2" />
      <path d="m32 39 13 5 11-2 10-10 12 12-4 13-12 10-15 9-20-4-14-17 19-16Z" fill="#a5b39b" />
      <path d="m34 44 8 3m19-5 8-2m-29 13 9 6 8-6m-8 6-2 8m-19-6 12 6M27 30l8 8m35-10-6 9" />
      <path d="m18 66 10 11h40l9-9M35 73l-3 10m31-11 4 11" />
    </>,
    armored: <>
      <path d="m20 55 12-26 23-9 22 18 5 22-17 13-36-3-9-15Z" fill="#b6c2ac" />
      <path d="m32 29 14 19-26 7m26-7 9-28m-9 28 31-10M46 48l19 25m-19-25-17 22m17-22 36 12" stroke="#7d8f74" />
      <path d="m22 54-12 9 2 9 18-2m50-16 9 7-1 9-16-2M28 69l-6 12h17l5-9m17 0 5 9h16l-9-11" fill="#94a58a" />
      <path d="m12 65 8-1m57-36 4-9-13 5m-34 3-2-10 12 6" />
    </>,
    insect: <>
      <ellipse cx="50" cy="48" rx="18" ry="26" fill="#b7c3aa" />
      <path d="m35 36-18-7-8 11m26 8-21 3-7 15m30-7-13 13-2 12m43-48 18-7 8 11m-26 8 21 3 7 15M63 59l13 13 2 12" />
      <path d="m43 27-3-14m17 14 3-14M34 45h32M34 54h32M38 64h24" stroke="#7a8f70" />
      <path d="m41 31 5 2m8 0 5-2M43 72l7 8 7-8" />
    </>,
    serpent: <>
      <path d="M21 75c-9-16 4-25 25-25 23 0 22-11 17-17l-4-8 15-8 14 14-6 17-19 6c24 9 23 24 3 29-17 4-35 1-45-8Z" fill="#b9c6ad" />
      <path d="M23 72c7 9 32 11 38 3 9-12-28-8-26-17m28-25 12 3 9-3m-25-8-6-9 13 4m9 3 4-11 5 15M67 39l6 2m3 6 13 7-2 5" />
      <path d="m42 55 3 7m9-8 1 7m-13 10-4 7m15-7v9" stroke="#879c7b" />
    </>,
    bird: <>
      <path d="m47 34 10-13 14 5-5 13 19 6 8 23-24-8-12 22-13-1-9-23-23 5 2-20 33-9Z" fill="#b4c2a7" />
      <path d="m46 43-20-4-12 4m29 5-20 1-11 14m32-9-9 4m25-13 13 7 20 16M57 52l12 8m-22-3 5 18 8-22" stroke="#819773" />
      <path d="m65 27 12 6-11 6m-12-7 5-1M44 80l-4 8m19-7 3 7M41 21l8 3-7-11" />
    </>,
    guardian: <>
      <path d="m39 20 19-2 9 13-7 17 16 8 5 23H22l5-23 14-9-9-15 7-12Z" fill="#b6c3ab" />
      <path d="m41 47 9 14 10-13 3 30H36l5-31Z" fill="#91a384" />
      <path d="m37 31 9 4m9-2 7-3m-16 7 6 5 5-5m-26 27 8-13m25-1 10 13M33 79l-4 10h16l4-10m7 0 3 10h17l-7-10" />
      <path d="M15 30v58m-5-51 5-14 5 14M35 21l-4-8 12 5m14-2 12-5-4 12" />
    </>,
  };
  return <svg className={className} viewBox="0 0 100 100" role="img" aria-label={`${name}的遭遇档案插图`} focusable="false">
    <circle cx="50" cy="49" r="43" fill="#eef2e7" />
    <path d="M9 88h81M13 17h10M83 14v12" stroke="#c7d3bd" fill="none" />
    <g fill="none" stroke="#53654b" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{figures[shape]}</g>
  </svg>;
}
