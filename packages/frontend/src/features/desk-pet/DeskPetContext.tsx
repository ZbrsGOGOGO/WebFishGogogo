import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_PET, parsePet, petStorageKey, type PetPreferences } from './pet-model';

interface PetContextValue {
  owner: string;
  prefs: PetPreferences;
  storageError: string;
  update: (patch: Partial<PetPreferences>) => void;
  clear: () => void;
}
const PetContext = createContext<PetContextValue | null>(null);
export function DeskPetProvider({ owner, children }: { owner: string; children: ReactNode }) {
  const key = petStorageKey(owner);
  const [storageError, setStorageError] = useState('');
  const [prefs, setPrefs] = useState(() => {
    try { return parsePet(localStorage.getItem(key)); } catch { return { ...DEFAULT_PET }; }
  });
  const current = useRef(prefs);
  const update = useCallback((patch: Partial<PetPreferences>) => {
    const next = parsePet(JSON.stringify({ ...current.current, ...patch, version: 1 }));
    current.current = next; setPrefs(next);
    try { localStorage.setItem(key, JSON.stringify(next)); setStorageError(''); }
    catch { setStorageError('浏览器未能保存设置（空间不足或存储被禁用）。当前预览仍可用，刷新后可能丢失。'); }
  }, [key]);
  const clear = useCallback(() => {
    try {
      localStorage.removeItem(key); current.current = { ...DEFAULT_PET }; setPrefs(current.current); setStorageError('');
    } catch { setStorageError('清除失败：浏览器禁止访问本地存储，请在浏览器的网站数据设置中清除。'); }
  }, [key]);
  useEffect(() => {
    const changed = (event: StorageEvent): void => {
      try { if (event.storageArea !== localStorage) return; } catch { return; }
      if (event.key !== key && event.key !== null) return;
      const next = parsePet(event.key === null ? null : event.newValue);
      current.current = next; setPrefs(next); setStorageError('');
    };
    window.addEventListener('storage', changed); return () => window.removeEventListener('storage', changed);
  }, [key]);
  return <PetContext.Provider value={{ owner, prefs, update, clear, storageError }}>{children}</PetContext.Provider>;
}
export function useDeskPet(): PetContextValue {
  const value = useContext(PetContext);
  if (!value) throw new Error('DeskPetProvider is required');
  return value;
}
