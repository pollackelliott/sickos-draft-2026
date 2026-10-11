import { normalizeIdentityPart } from '../domain/index.js';

const SUFFIXES = new Set(['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv', 'v']);

export function playerSortKey(name: string): string {
  const normalized = normalizeIdentityPart(name);
  if (!normalized) return '';

  const comma = normalized.indexOf(',');
  if (comma > 0) {
    const surname = normalized.slice(0, comma).trim();
    const given = normalized.slice(comma + 1).trim();
    return [surname, given].filter(Boolean).join(' ');
  }

  const parts = normalized.split(' ');
  let surnameIndex = parts.length - 1;
  let suffix = '';
  if (surnameIndex > 0 && SUFFIXES.has(parts[surnameIndex])) {
    suffix = parts[surnameIndex];
    surnameIndex -= 1;
  }

  const surname = parts[surnameIndex] ?? '';
  const given = parts.slice(0, surnameIndex).join(' ');
  return [surname, given, suffix].filter(Boolean).join(' ');
}
