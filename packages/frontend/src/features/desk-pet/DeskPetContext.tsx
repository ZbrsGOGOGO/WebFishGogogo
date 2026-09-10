import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_PET, parsePet, petStorageKey, type PetPreferences } from './pet-model';

interface PetContextValue {
  owner: string; prefs: PetPreferences; storageError: string;
  update: (patch: Partial<PetPreferences>) => void; clear: () => void;
}
export const petImageKey = (owner: string): string => `${petStorageKey(owner)}:images`;
export function readPet(owner: string): { prefs: PetPreferences; error: string } {
  if (owner === 'unavailable') return { prefs: { ...DEFAULT_PET }, error: '' };
  try {
    const raw = localStorage.getItem(petStorageKey(owner));
    const prefs = parsePet(raw);
    if (raw && raw.length <= 810_000 && JSON.parse(raw)?.separateImages === true) {
      const parsed = parsePet(localStorage.getItem(petImageKey(owner)));
      if (parsed.image) return { prefs: { ...prefs, image: parsed.image, pixelImage: parsed.pixelImage }, error: '' };
      return { prefs, error: '本机图片未能读取，设置仍保留。请重新导入图片或备份。' };
    }
    return { prefs, error: '' };
  } catch { return { prefs: { ...DEFAULT_PET }, error: '浏览器无法读取本地桌宠数据，请检查网站存储权限。原档案未被清除。' }; }
}
const PetContext = createContext<PetContextValue | null>(null);
export function DeskPetProvider({ owner, children }: { owner: string; children: ReactNode }) {
  const [state, setState] = useState(() => ({ owner, ...readPet(owner) }));
  // Reset only local state before rendering descendants, never remount the router.
  const visible = state.owner === owner ? state : { owner, ...readPet(owner) };
  if (state.owner !== owner) setState(visible);
  const current = useRef(visible); current.current = visible;
  const update = useCallback((patch: Partial<PetPreferences>) => {
    if (owner === 'unavailable' || current.current.owner !== owner) return;
    const previous = current.current.prefs;
    const { image, pixelImage, ...light } = { ...previous, ...patch };
    const changed = image !== previous.image || pixelImage !== previous.pixelImage;
    const images = changed ? parsePet(JSON.stringify({ version: 1, image, pixelImage })) : { image, pixelImage };
    const clean = parsePet(JSON.stringify(light));
    const next = { ...clean, image: images.image, pixelImage: images.pixelImage };
    let error = '';
    let savedImages: string | null | undefined;
    try {
      // Lazy migration: a failed metadata write must leave the last saved picture intact.
      if (next.image && (changed || localStorage.getItem(petImageKey(owner)) === null)) {
        savedImages = localStorage.getItem(petImageKey(owner));
        localStorage.setItem(petImageKey(owner), JSON.stringify({ version: 1, image: next.image, pixelImage: next.pixelImage }));
      }
      localStorage.setItem(petStorageKey(owner), JSON.stringify({ ...clean, separateImages: !!next.image }));
      if (!next.image) localStorage.removeItem(petImageKey(owner));
    } catch {
      if (savedImages !== undefined) {
        try { if (savedImages === null) localStorage.removeItem(petImageKey(owner)); else localStorage.setItem(petImageKey(owner), savedImages); } catch { /* Surface failure, never claim persistence. */ }
      }
      error = '浏览器未能保存设置（空间不足或存储被禁用）。当前预览仍可用，刷新后可能丢失。';
    }
    current.current = { owner, prefs: next, error }; setState(current.current);
  }, [owner]);
  const clear = useCallback(() => {
    if (owner === 'unavailable' || current.current.owner !== owner) return;
    try {
      localStorage.removeItem(petStorageKey(owner)); localStorage.removeItem(petImageKey(owner));
      current.current = { owner, prefs: { ...DEFAULT_PET }, error: '' }; setState(current.current);
    } catch { setState(s => ({ ...s, error: '清除失败：浏览器禁止访问本地存储，请在浏览器的网站数据设置中清除。' })); }
  }, [owner]);
  useEffect(() => {
    const changed = (event: StorageEvent): void => {
      try { if (event.storageArea !== localStorage) return; } catch { return; }
      if (event.key !== petStorageKey(owner) && event.key !== petImageKey(owner) && event.key !== null) return;
      const next = event.key === null || (event.key === petStorageKey(owner) && event.newValue === null)
        ? { prefs: { ...DEFAULT_PET }, error: '' } : readPet(owner);
      current.current = { owner, ...next }; setState(current.current);
    };
    window.addEventListener('storage', changed); return () => window.removeEventListener('storage', changed);
  }, [owner]);
  return <PetContext.Provider value={{ owner, prefs: visible.prefs, storageError: visible.error, update, clear }}>{children}</PetContext.Provider>;
}
export function useDeskPet(): PetContextValue {
  const value = useContext(PetContext);
  if (!value) throw new Error('DeskPetProvider is required');
  return value;
}
