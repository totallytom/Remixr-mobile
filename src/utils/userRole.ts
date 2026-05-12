/** Normalize DB / API role strings for comparisons (e.g. enum casing). */
export function isMusicianRole(role: unknown): boolean {
  return String(role ?? '').toLowerCase().trim() === 'musician';
}
