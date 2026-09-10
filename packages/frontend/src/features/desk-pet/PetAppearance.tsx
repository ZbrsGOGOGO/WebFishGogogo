import type { CSSProperties } from 'react';
import type { PetPreferences } from './pet-model';
import styles from './DeskPet.module.css';

export function PetAppearance({ prefs, preview = false }: { prefs: PetPreferences; preview?: boolean }) {
  const src = prefs.style === 'pixel' ? prefs.pixelImage : prefs.image;
  return <span className={styles.appearance} data-style={prefs.style} data-sleeping={prefs.sleeping} data-still={prefs.quiet || preview} style={{ '--pet-size': `${prefs.size}px` } as CSSProperties}>
    {src ? <img src={src} alt="" draggable={false} /> : <svg viewBox="0 0 128 128" aria-hidden="true">
      {prefs.preset === 'fish' ? <><path d="M92 63 119 41v45L92 70" fill="#68b5ad" stroke="#315c59" strokeWidth="3" strokeLinejoin="round"/><ellipse cx="58" cy="65" rx="42" ry="32" fill="#a2d7c1" stroke="#315c59" strokeWidth="3"/><path d="m62 34 10-15 9 21M62 92l10 16 9-20" fill="#68b5ad" stroke="#315c59" strokeWidth="3" strokeLinejoin="round"/><circle cx="35" cy="59" r="4" fill="#243b3a"/><path d="M32 74q9 9 17 0" fill="none" stroke="#315c59" strokeWidth="3" strokeLinecap="round"/><ellipse cx="27" cy="70" rx="7" ry="4" fill="#edae9b"/><path d="m66 54 11 12-11 11" fill="none" stroke="#68b5ad" strokeWidth="4"/></> : prefs.preset === 'cat' ? <><path d="M26 51 24 19 50 34q15-7 29 0l25-15-3 35q17 52-37 53Q10 106 26 51Z" fill="#eac49b" stroke="#655344" strokeWidth="3" strokeLinejoin="round"/><path d="m31 31 3 18 11-9m49-9-3 18-11-9" fill="#e59e94"/><path d="M39 63h8m34 0h8M55 79q9 14 18 0" fill="none" stroke="#655344" strokeWidth="4" strokeLinecap="round"/><path d="m59 72 5 5 5-5" fill="#655344"/><path d="m18 71 18 3m-17 8 18-1m73-10-18 3m17 8-18-1" stroke="#655344" strokeWidth="2"/></> : <><path d="M64 77V38" stroke="#416657" strokeWidth="5"/><path d="M64 57Q21 57 27 24q36 0 37 33M65 47q0-32 34-30 3 30-34 30" fill="#8fc6a3" stroke="#416657" strokeWidth="3"/><path d="m28 73 8 39h57l8-39Z" fill="#d8ac8d" stroke="#655344" strokeWidth="3" strokeLinejoin="round"/><path d="M48 87h2m27 0h2M57 96q8 7 15 0" fill="none" stroke="#655344" strokeWidth="4" strokeLinecap="round"/></>}
    </svg>}
    {prefs.sleeping ? <span className={styles.zzz}>z Z</span> : null}
  </span>;
}
