import { normalizeLeagueCode } from '../api/client.js';

export const OWNER_CODE_STORAGE_KEY = 'sickos-draft-owner-code';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function readStoredOwnerCode(storage: StorageLike): string | null {
  const value = storage.getItem(OWNER_CODE_STORAGE_KEY);
  if (!value?.trim()) return null;
  return normalizeLeagueCode(value);
}

export function storeOwnerCode(storage: StorageLike, code: string): string {
  const normalized = normalizeLeagueCode(code);
  storage.setItem(OWNER_CODE_STORAGE_KEY, normalized);
  return normalized;
}

export function clearStoredOwnerCode(storage: StorageLike): void {
  storage.removeItem(OWNER_CODE_STORAGE_KEY);
}
