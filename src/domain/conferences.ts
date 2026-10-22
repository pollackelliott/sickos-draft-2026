export function canonicalConferenceName(value: string): string {
  const trimmed = value.trim();
  return trimmed.toLocaleUpperCase('en-US') === 'MAAC' ? 'Metro' : trimmed;
}
