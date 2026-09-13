import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { getPrisma } from '@tastecult/db';
import { config as loadEnv } from 'dotenv';
import { importCatalogue } from './import';
import { parseDishesCsv, parseLondonMentions } from './source';
import { buildCatalogue } from './transform';

// Local runs read the monorepo .env; elsewhere the env vars are set directly.
loadEnv({ path: path.resolve(import.meta.dirname, '../../../.env'), quiet: true });

const { values } = parseArgs({
  options: {
    dishes: { type: 'string' },
    mentions: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});

if (!values.dishes || !values.mentions) {
  console.error(
    'Usage: import-dishes --dishes <dishes_enriched.csv> --mentions <cache_mentions.json> [--dry-run]',
  );
  process.exit(2);
}

const [csvText, mentionsText] = await Promise.all([
  readFile(values.dishes, 'utf8'),
  readFile(values.mentions, 'utf8'),
]);
const rows = parseDishesCsv(csvText);
const catalogue = buildCatalogue(rows, parseLondonMentions(mentionsText));

const merged = rows.length - catalogue.skipped.length - catalogue.dishes.length;
const withParent = catalogue.dishes.filter((d) => d.parentSlug !== null).length;
console.log(
  `${rows.length} source rows -> ${catalogue.dishes.length} dishes ` +
    `(${merged} country duplicates merged, ${catalogue.skipped.length} skipped), ` +
    `${catalogue.cuisines.length} cuisines, ${withParent} variants linked to a parent`,
);
for (const s of catalogue.skipped) console.log(`  skipped ${s.dishId}: ${s.reason}`);
if (catalogue.missingParents.length > 0) {
  console.log(
    `  ${catalogue.missingParents.length} variant parents not in catalogue: ${catalogue.missingParents.join(', ')}`,
  );
}
const top = [...catalogue.dishes].sort((a, b) => b.popularity - a.popularity).slice(0, 10);
console.log(
  `  most mentioned in London: ${top.map((d) => `${d.name} (${d.popularity})`).join(', ')}`,
);

if (values['dry-run']) {
  console.log('[dry run] nothing written');
} else {
  const prisma = getPrisma();
  try {
    const result = await importCatalogue(prisma, catalogue);
    console.log(
      `Imported ${result.cuisines} cuisines, ${result.dishesWritten} dishes written, ` +
        `${result.parentLinksChanged} parent links changed, ${result.cuisineLinksChanged} cuisine links changed`,
    );
    if (result.dishesConflicting > 0) {
      console.warn(
        `${result.dishesConflicting} dishes not written: their slug is taken by a user-requested dish`,
      );
    }
    if (result.staleDishes > 0) {
      console.warn(
        `${result.staleDishes} approved dishes in the DB are not in this catalogue (kept, not deleted)`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}
