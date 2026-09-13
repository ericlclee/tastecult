import { slugify } from '@tastecult/shared-types';
import type { SourceRow } from './source.js';

export interface CuisineRecord {
  slug: string;
  name: string;
  region: string;
  macroRegion: string;
}

export interface DishRecord {
  slug: string;
  name: string;
  /** Every cuisine the merged versions had, e.g. Hummus: middle-eastern, north-african, turkish. */
  cuisineSlugs: string[];
  category: string | null;
  otherNames: string[];
  ingredients: string[];
  popularity: number;
  /** Root parent for variants (Pizza Margherita -> pizza); null for top-level dishes. */
  parentSlug: string | null;
  /** Source rows folded into this dish, e.g. hummus, hummus-egypt, hummus-iraq. */
  sourceIds: string[];
}

export interface Catalogue {
  cuisines: CuisineRecord[];
  dishes: DishRecord[];
  skipped: { dishId: string; reason: string }[];
  /** Variant parents that aren't in the catalogue (their rows were skipped). */
  missingParents: string[];
}

// Bidi and zero-width marks that TasteAtlas native names carry (e.g. U+200E after Persian text)
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

function clean(value: string): string {
  return value.replace(INVISIBLE, '').normalize('NFC').trim().replace(/\s+/g, ' ');
}

/** Rows with the same display name are one dish (e.g. 8 country versions of Hummus). */
function nameKey(name: string): string {
  return clean(name).normalize('NFKC').toLowerCase();
}

function splitList(value: string, separator: string): string[] {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const raw of value.split(separator)) {
    const item = clean(raw);
    const key = item.toLowerCase();
    if (item && !seen.has(key)) {
      seen.add(key);
      items.push(item);
    }
  }
  return items;
}

export function buildCatalogue(
  rows: readonly SourceRow[],
  londonMentions: ReadonlyMap<string, number>,
): Catalogue {
  const skipped: Catalogue['skipped'] = [];
  const usable = rows.filter((row) => {
    if (!clean(row.dish)) skipped.push({ dishId: row.dish_id, reason: 'blank name' });
    else if (!clean(row.cuisine)) skipped.push({ dishId: row.dish_id, reason: 'no cuisine' });
    else return true;
    return false;
  });

  const cuisines = buildCuisines(usable);
  const popularityOf = (row: SourceRow) => londonMentions.get(row.url) ?? 0;

  const groups = new Map<string, SourceRow[]>();
  for (const row of usable) {
    const key = nameKey(row.dish);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const entries = [...groups].map(([key, group]) => {
    const name = clean(group[0]!.dish);
    const plain = group.find((r) => r.dish_id === slugify(name));
    // Prefer the unsuffixed TasteAtlas entry ("hummus" over "hummus-egypt"), else
    // the most-mentioned version; ids keep the choice stable across reruns. The
    // main version only supplies category and ingredients — cuisines come from
    // every version.
    const main =
      plain ??
      [...group].sort(
        (a, b) =>
          popularityOf(b) - popularityOf(a) ||
          a.dish_id.length - b.dish_id.length ||
          a.dish_id.localeCompare(b.dish_id),
      )[0]!;
    return { key, group, name, main, isPlain: plain !== undefined };
  });

  // Plain entries claim their own ids first so derived slugs can't take them.
  entries.sort((a, b) => Number(b.isPlain) - Number(a.isPlain) || a.key.localeCompare(b.key));

  const sourceIds = new Set(usable.map((r) => r.dish_id));
  const takenSlugs = new Set<string>();
  const slugByKey = new Map<string, string>();
  for (const entry of entries) {
    // Slugs must not depend on which version is "main" — that shifts with mention
    // counts, and the import upserts by slug, so a changed slug would create a
    // duplicate dish instead of updating the existing one.
    const stableId = entry.group.map((r) => r.dish_id).sort()[0]!;
    let slug = entry.isPlain ? entry.main.dish_id : slugify(entry.name);
    // Non-Latin names slugify to '', and a derived slug mustn't steal another row's id
    if (!slug || takenSlugs.has(slug) || (!entry.isPlain && sourceIds.has(slug))) {
      slug = stableId;
    }
    if (takenSlugs.has(slug)) {
      let n = 2;
      while (takenSlugs.has(`${slug}-${n}`)) n++;
      slug = `${slug}-${n}`;
    }
    takenSlugs.add(slug);
    slugByKey.set(entry.key, slug);
  }

  const parentKeyByKey = new Map(entries.map((e) => [e.key, nameKey(e.main.group_of)]));
  const missingParents = new Set<string>();

  function resolveParent(key: string): string | null {
    const seen = new Set([key]);
    let current = key;
    for (;;) {
      const next = parentKeyByKey.get(current);
      if (!next || next === current) break;
      if (!slugByKey.has(next)) {
        if (current === key) missingParents.add(next);
        break;
      }
      // A cycle means the grouping is unreliable; leave the dish unparented
      if (seen.has(next)) return null;
      seen.add(next);
      current = next;
    }
    return current === key ? null : slugByKey.get(current)!;
  }

  const dishes = entries.map(({ key, group, name, main }): DishRecord => {
    const nameLower = nameKey(name);
    return {
      slug: slugByKey.get(key)!,
      name,
      cuisineSlugs: [...new Set(group.map((r) => slugify(clean(r.cuisine))))].sort(),
      category: clean(main.category) || null,
      otherNames: splitList(group.map((r) => r.other_names).join(','), ',').filter(
        (n) => nameKey(n) !== nameLower,
      ),
      ingredients: splitList(
        main.ingredients.trim()
          ? main.ingredients
          : (group.find((r) => r.ingredients.trim())?.ingredients ?? ''),
        ';',
      ),
      // Country versions share one mention count, so take the max rather than summing
      popularity: Math.max(...group.map(popularityOf)),
      parentSlug: resolveParent(key),
      sourceIds: group.map((r) => r.dish_id).sort(),
    };
  });

  dishes.sort((a, b) => a.slug.localeCompare(b.slug));
  return { cuisines, dishes, skipped, missingParents: [...missingParents].sort() };
}

function buildCuisines(rows: readonly SourceRow[]): CuisineRecord[] {
  const cuisines = new Map<string, CuisineRecord>();
  for (const row of rows) {
    const record: CuisineRecord = {
      slug: slugify(clean(row.cuisine)),
      name: clean(row.cuisine),
      region: clean(row.cuisine_region),
      macroRegion: clean(row.cuisine_macro),
    };
    if (!record.region || !record.macroRegion) {
      throw new Error(
        `Cuisine "${record.name}" (${row.dish_id}) is missing its region or macro region`,
      );
    }
    const existing = cuisines.get(record.slug);
    if (!existing) {
      cuisines.set(record.slug, record);
    } else if (existing.region !== record.region || existing.macroRegion !== record.macroRegion) {
      throw new Error(`Cuisine "${record.name}" maps to more than one region`);
    }
  }
  return [...cuisines.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}
