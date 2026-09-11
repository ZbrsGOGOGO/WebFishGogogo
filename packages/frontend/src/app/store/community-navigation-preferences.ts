import { COMMUNITY_SYSTEM_NAV, type CommunitySystemId } from '../community-nav';

export interface CommunityNavigationPreferences {
  version: 1;
  order: CommunitySystemId[];
  hidden: CommunitySystemId[];
}

export const COMMUNITY_NAVIGATION_PREFERENCES_EVENT = 'webfish:navigation-preferences-changed';
const MAX_JSON_LENGTH = 8_192;
const canonicalIds = [...new Set(COMMUNITY_SYSTEM_NAV.map(item => item.id))];
const allowedIds = new Set<string>(canonicalIds);

/** Preferences contain IDs only. Feature flags and account permissions are
 * deliberately not persisted: the rendering layer intersects them live. */
export function defaultCommunityNavigationPreferences(): CommunityNavigationPreferences {
  return { version: 1, order: [...canonicalIds], hidden: [] };
}

function safeArray(input: unknown): unknown[] | null {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype || input.length > 512) return null;
  const keys = Reflect.ownKeys(input);
  if (keys.some(key => key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= input.length))) return null;
  const result: unknown[] = [];
  let size = 2;
  for (let index = 0; index < input.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) return null;
    const value: unknown = descriptor.value;
    // Do not inspect/serialize arbitrary nested objects or invoke toJSON.
    if (typeof value === 'string') size += JSON.stringify(value).length + 1;
    else size += 5;
    if (size > MAX_JSON_LENGTH) return null;
    result.push(value);
  }
  return result;
}

function parsedPreferences(input: unknown): { value: CommunityNavigationPreferences; valid: boolean } {
  const invalid = () => ({ value: defaultCommunityNavigationPreferences(), valid: false });
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input) || ![null, Object.prototype].includes(Object.getPrototypeOf(input))) return invalid();
    const keys = Reflect.ownKeys(input);
    if (keys.length !== 3 || keys.some(key => !['version', 'order', 'hidden'].includes(String(key)) || typeof key !== 'string')) return invalid();
    const values = Object.fromEntries(keys.map(key => {
      const descriptor = Object.getOwnPropertyDescriptor(input, key)!;
      if (!descriptor.enumerable || !('value' in descriptor)) throw new Error('Navigation preference accessor');
      return [key, descriptor.value];
    }));
    if (values.version !== 1) return invalid();
    const order = safeArray(values.order), hidden = safeArray(values.hidden);
    if (!order || !hidden) return invalid();
    const ids = (items: unknown[]): CommunitySystemId[] => [...new Set(items.filter((id): id is CommunitySystemId => typeof id === 'string' && allowedIds.has(id)))];
    const first = ids(order), all = new Set(first);
    return { value: { version: 1, order: [...first, ...canonicalIds.filter(id => !all.has(id))], hidden: ids(hidden) }, valid: true };
  } catch { return invalid(); }
}

export function normalizeCommunityNavigationPreferences(input: unknown): CommunityNavigationPreferences {
  return parsedPreferences(input).value;
}

export function communityNavigationStorageKey(owner: string): string {
  // Preserve exact identity; trimming or a fallback guest key could leak one
  // account's preferences to another account or overwrite unrelated data.
  if (typeof owner !== 'string' || owner.length === 0 || owner.length > 512) throw new Error('Navigation preference owner invalid');
  return `webfish:navigation:v1:${encodeURIComponent(owner)}`;
}

export function readCommunityNavigationPreferences(owner: string): { value: CommunityNavigationPreferences; failed: boolean } {
  try {
    const raw = window.localStorage.getItem(communityNavigationStorageKey(owner));
    if (raw === null) return { value: defaultCommunityNavigationPreferences(), failed: false };
    if (raw.length > MAX_JSON_LENGTH) return { value: defaultCommunityNavigationPreferences(), failed: true };
    const parsed = parsedPreferences(JSON.parse(raw));
    return { value: parsed.value, failed: !parsed.valid };
  } catch { return { value: defaultCommunityNavigationPreferences(), failed: true }; }
}

function notifyOwner(owner: string): void {
  window.dispatchEvent(new CustomEvent(COMMUNITY_NAVIGATION_PREFERENCES_EVENT, { detail: { owner } }));
}

export function writeCommunityNavigationPreferences(owner: string, input: unknown): boolean {
  try {
    const key = communityNavigationStorageKey(owner), parsed = parsedPreferences(input);
    if (!parsed.valid) return false;
    const raw = JSON.stringify(parsed.value);
    if (raw.length > MAX_JSON_LENGTH) return false;
    window.localStorage.setItem(key, raw);
    notifyOwner(owner);
    return true;
  } catch { return false; }
}

export function resetCommunityNavigationPreferences(owner: string): boolean {
  try {
    window.localStorage.removeItem(communityNavigationStorageKey(owner));
    notifyOwner(owner);
    return true;
  } catch { return false; }
}
