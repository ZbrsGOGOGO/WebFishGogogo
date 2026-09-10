import { parsePet, preparePetImage, type PetPreferences } from './pet-model';

export function exportPet(prefs: PetPreferences): string {
  return JSON.stringify({ format: 'desk-buddy-backup', version: 1, preferences: prefs });
}
export async function importPet(file: File): Promise<PetPreferences> {
  if (!file.size || file.size > 820_000) throw new Error('备份文件须小于 820 KB。');
  let value: { format?: string; version?: number; preferences?: PetPreferences };
  try { value = JSON.parse(await file.text()); } catch { throw new Error('无法识别备份文件。'); }
  if (value?.format !== 'desk-buddy-backup' || value.version !== 1 || value.preferences?.version !== 1) throw new Error('不是受支持的桌宠备份。');
  const prefs = parsePet(JSON.stringify(value.preferences));
  if (value.preferences.image && !prefs.image) throw new Error('备份图片格式不受支持。');
  if (prefs.image) {
    const bytes = Uint8Array.from(atob(prefs.image.split(',')[1]), c => c.charCodeAt(0));
    Object.assign(prefs, await preparePetImage(new File([bytes], 'buddy.png', { type: 'image/png' })));
  }
  // Import doesn't switch on a widget or trust another device's screen position.
  return { ...prefs, enabled: false, collapsed: false, position: null };
}
