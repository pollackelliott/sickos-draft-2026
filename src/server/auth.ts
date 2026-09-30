import type { OwnerRecord } from './store-types.js';
import { D1DraftStore } from './d1-store.js';

export const OWNER_CODE_HEADER = 'x-league-code';

export function normalizeOwnerCode(code: string): string {
  return code.trim().toUpperCase();
}

export async function authenticateOwner(store: D1DraftStore, request: Request): Promise<OwnerRecord | null> {
  const raw = request.headers.get(OWNER_CODE_HEADER);
  if (!raw?.trim()) return null;
  return (await store.findOwnerByCode(raw)) ?? null;
}
