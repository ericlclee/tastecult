/**
 * Normalizes a restaurant's menu name so casing/spacing variants of the same
 * alias map to one MenuItem. Deliberately conservative — no fuzzy matching,
 * since two genuinely different menu items must stay separate.
 * Empty/missing aliases normalize to '' so the DB unique constraint still applies.
 */
export function normalizeAlias(alias: string | null | undefined): string {
  if (alias == null) return '';
  return alias.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Display form of an alias: trimmed and whitespace-collapsed, casing kept. Null if empty. */
export function cleanAlias(alias: string | null | undefined): string | null {
  if (alias == null) return null;
  const cleaned = alias.normalize('NFKC').trim().replace(/\s+/g, ' ');
  return cleaned === '' ? null : cleaned;
}

/** URL-safe slug for canonical dishes and cuisines, e.g. "Crème Brûlée" -> "creme-brulee". */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
