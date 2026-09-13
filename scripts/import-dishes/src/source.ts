import { parse } from 'csv-parse/sync';
import { z } from 'zod';

/**
 * The columns read from apalate's dishes_enriched.csv. Descriptions, TasteAtlas
 * scores and ratings are deliberately never read — that's TasteAtlas's own
 * content, and only names, cuisine, category and ingredients were cleared for use.
 */
const sourceRowSchema = z.object({
  dish_id: z.string().min(1),
  dish: z.string(),
  url: z.string(),
  group_of: z.string(),
  cuisine: z.string(),
  cuisine_region: z.string(),
  cuisine_macro: z.string(),
  category: z.string(),
  other_names: z.string(),
  ingredients: z.string(),
});
export type SourceRow = z.infer<typeof sourceRowSchema>;

export function parseDishesCsv(text: string): SourceRow[] {
  const records: unknown[] = parse(text, { columns: true, skip_empty_lines: true, bom: true });
  return records.map((record, i) => {
    const parsed = sourceRowSchema.safeParse(record);
    if (!parsed.success) {
      throw new Error(`Dish record ${i + 1} is invalid:\n${z.prettifyError(parsed.error)}`);
    }
    return parsed.data;
  });
}

const mentionsSchema = z.object({
  hits: z.record(z.string(), z.object({ london: z.number().int().nonnegative().optional() })),
});

/** TasteAtlas URL -> number of London review mentions. */
export function parseLondonMentions(text: string): Map<string, number> {
  const { hits } = mentionsSchema.parse(JSON.parse(text));
  return new Map(Object.entries(hits).map(([url, counts]) => [url, counts.london ?? 0]));
}
