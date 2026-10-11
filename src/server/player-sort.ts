import { normalizeIdentityPart } from '../domain/index.js';

const SUFFIXES = new Set(['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv', 'v']);

export function playerSortKey(name: string): string {
  const normalized = normalizeIdentityPart(name);
  if (!normalized) return '';

  const comma = normalized.indexOf(',');
  if (comma > 0) {
    const left = normalized.slice(0, comma).trim();
    const right = normalized.slice(comma + 1).trim();

    if (SUFFIXES.has(right)) {
      const parts = left.split(' ');
      const surname = parts.at(-1) ?? '';
      const given = parts.slice(0, -1).join(' ');
      return [surname, given, right].filter(Boolean).join(' ');
    }

    return [left, right].filter(Boolean).join(' ');
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
