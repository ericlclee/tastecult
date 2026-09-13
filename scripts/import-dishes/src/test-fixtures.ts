import type { SourceRow } from './source';

/** A dishes_enriched.csv row; defaults describe a top-level Middle Eastern dish. */
export function sourceRow(
  overrides: Partial<SourceRow> & Pick<SourceRow, 'dish_id' | 'dish'>,
): SourceRow {
  return {
    url: `https://www.tasteatlas.com/${overrides.dish_id}`,
    group_of: overrides.dish,
    cuisine: 'Middle Eastern',
    cuisine_region: 'Middle Eastern',
    cuisine_macro: 'Middle Eastern & African',
    category: 'Dip',
    other_names: '',
    ingredients: '',
    ...overrides,
  };
}

export function mentions(counts: Record<string, number>): Map<string, number> {
  return new Map(
    Object.entries(counts).map(([dishId, n]) => [`https://www.tasteatlas.com/${dishId}`, n]),
  );
}
